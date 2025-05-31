import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors'; // Importa el paquete cors
import { GameManager } from '../classes/multiplayer/gameManager.js'; // Asegúrate de que la ruta sea correcta

const app = express();

// Configuración de CORS para Express
app.use(cors({
  origin: ['https://batalla-naval-navy.vercel.app', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

const server = createServer(app);
const io = new Server(server, {
  cors: { // Mantén también la configuración de Socket.IO por si acaso
    origin: ['https://batalla-naval-navy.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
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