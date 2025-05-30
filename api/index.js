import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from '../classes/multiplayer/gameManager.js'; // <-- ¡Ruta relativa ajustada!

const app = express();

// Configuración de CORS para Express (Middleware)
app.use(cors({
  origin: 'https://batalla-naval-navy.vercel.app',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'], // Esto es útil si tu frontend envía cabeceras personalizadas
  credentials: true
}));

// Opcional: Una ruta de prueba para verificar que Express funciona
app.get('/', (req, res) => {
  res.send('Backend de Batalla Naval en funcionamiento.');
});

const server = createServer(app); // Usa 'app' aquí para que Express maneje las solicitudes HTTP
const io = new Server(server, {
  cors: { // Configuración de CORS específica para Socket.IO (necesaria para el websocket handshake)
    origin: 'https://batalla-naval-navy.vercel.app',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

// GameManager y lógica de Socket.IO
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
