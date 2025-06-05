import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors({
  origin: ['https://batalla-naval-navy.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://batalla-naval-navy.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
    pingInterval: 25000, 
    pingTimeout: 60000,  
  }
});

const PORT = 3000;

const gameWorker2PPath = path.resolve(__dirname, 'gameWorker.js');
const gameWorker2P = new Worker(gameWorker2PPath, {
    workerData: { playersPerGame: 2, workerName: '2P_Worker' }
});

const gameWorker4P_2v2Path = path.resolve(__dirname, 'gameWorker.js');
const gameWorker4P_2v2 = new Worker(gameWorker4P_2v2Path, {
    workerData: { playersPerGame: 4, workerName: '4P_2v2_Worker' }
});

const connectedSockets = new Map();
const playerWorkerMap = new Map(); // socket.id -> Worker instance

const handleWorkerMessage = (workerInstance, message) => {
  const workerName = workerInstance?.workerData?.workerName || 'Unknown_Worker';

  switch (message.type) {
    case 'gameUpdate':
      const { event, data, targetPlayerId, gameId } = message.payload;
      if (targetPlayerId && connectedSockets.has(targetPlayerId)) {
        connectedSockets.get(targetPlayerId).emit(event, data);
      } else if (gameId) {
          io.to(gameId).emit(event, data); // Emitir a la sala del juego
      } else {
        io.emit(event, data); // Emisión general 
      }
      break;
    case 'joinRoom':
      const { gameId: joinGameId, playerId: joinPlayerId } = message.payload;
      if (connectedSockets.has(joinPlayerId)) {
          connectedSockets.get(joinPlayerId).join(joinGameId);
          console.log(`Main Thread: Jugador ${joinPlayerId.substring(0,6)}... se unió a la sala ${joinGameId.substring(0,6)}... (vía ${workerName})`);
      }
      break;
    case 'leaveRoom':
      const { gameId: leaveGameId, playerIds: leavePlayerIds } = message.payload;
      leavePlayerIds.forEach(id => {
          if (connectedSockets.has(id)) {
              connectedSockets.get(id).leave(leaveGameId);
              console.log(`Main Thread: Jugador ${id.substring(0,6)}... dejó la sala ${leaveGameId.substring(0,6)}... (vía ${workerName})`);
          }
      });
      break;
    case 'waitingPlayersCountUpdate':
      // Esta actualización se emite a todos los clientes para mostrar contadores de cola
      io.emit('waitingPlayersCountUpdate', {
          mode: message.payload.mode,
          count: message.payload.count,
          required: message.payload.required
      });
      break;
    default:
      console.warn(`Main Thread: Mensaje de worker desconocido (${workerName}):`, message.type, message.payload);
  }
};

gameWorker2P.on('message', (msg) => handleWorkerMessage(gameWorker2P, msg));
gameWorker2P.on('error', (err) => console.error('2P Game Worker encountered an error:', err));
gameWorker2P.on('exit', (code) => {
  if (code !== 0) console.error(`2P Game Worker exited with code ${code}.`);
  else console.log('2P Game Worker exited gracefully.');
});

gameWorker4P_2v2.on('message', (msg) => handleWorkerMessage(gameWorker4P_2v2, msg));
gameWorker4P_2v2.on('error', (err) => console.error('4P_2v2 Game Worker encountered an error:', err));
gameWorker4P_2v2.on('exit', (code) => {
  if (code !== 0) console.error(`4P_2v2 Game Worker exited with code ${code}.`);
  else console.log('4P_2v2 Game Worker exited gracefully.');
});


io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);
  connectedSockets.set(socket.id, socket);

  socket.on('requestGameMode', (mode) => {
    // Se crea un playerInfo para enviarlo al worker
    const playerInfo = { id: socket.id, username: `Player_${socket.id.substring(0,4)}` };

    if (mode === 2) {
      playerWorkerMap.set(socket.id, gameWorker2P);
      gameWorker2P.postMessage({ type: 'addPlayer', playerId: socket.id, playerInfo: playerInfo });
      console.log(`Jugador ${socket.id.substring(0,6)}... enrutado al modo 2 jugadores (1v1).`);
    } else if (mode === 4) {
      playerWorkerMap.set(socket.id, gameWorker4P_2v2);
      gameWorker4P_2v2.postMessage({ type: 'addPlayer', playerId: socket.id, playerInfo: playerInfo });
      console.log(`Jugador ${socket.id.substring(0,6)}... enrutado al modo 4 jugadores (2v2).`);
    } else {
      socket.emit('error', 'Modo de juego no válido. Por favor, especifica 2 o 4.');
      console.warn(`Jugador ${socket.id.substring(0,6)}... solicitó modo inválido: ${mode}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Jugador desconectado: ${socket.id}`);
    const assignedWorker = playerWorkerMap.get(socket.id);
    if (assignedWorker) {
      assignedWorker.postMessage({ type: 'removePlayer', playerId: socket.id });
      playerWorkerMap.delete(socket.id);
    }
    connectedSockets.delete(socket.id);
  });

  socket.on('playerAction', (data) => {
    const assignedWorker = playerWorkerMap.get(socket.id);
    if (assignedWorker) {
      assignedWorker.postMessage({ type: 'playerAction', playerId: socket.id, data: data });
    } else {
      socket.emit('error', 'No se ha asignado un modo de juego. Envía "requestGameMode" primero.');
    }
  });

  const shutdown = async () => {
    console.log('Shutting down server...');
    io.close(() => console.log('Socket.IO server closed.'));
    gameWorker2P.terminate();
    gameWorker4P_2v2.terminate();
    server.close(() => {
      console.log('HTTP server closed. Exiting process.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});

server.listen(PORT, () => {
  console.log(`Connection server running on http://localhost:${PORT}`);
  console.log('Workers for 2-player (1v1) and 4-player (2v2) modes are initializing...');
});