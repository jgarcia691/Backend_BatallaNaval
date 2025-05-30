import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameManager } from './classes/multiplayer/gameManager.js';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Cambia esto a tu frontend en producción
  },
});

const PORT = 3000;
const gameManager = new GameManager(io);

io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);
  gameManager.addPlayer(socket);

  socket.on('disconnect', () => {
    console.log(`Jugador desconectado: ${socket.id}`);
    gameManager.removePlayer(socket.id);
  });

  socket.on('player-action', (data) => {
    gameManager.handleAction(socket.id, data);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
