import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors'; // Importa el paquete cors
import { GameManager } from './classes/multiplayer/gameManager.js';

const app = express();

// Configuración de CORS para Express
app.use(cors({
  origin: 'https://batalla-naval-navy.vercel.app',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

const server = createServer(app);
const io = new Server(server, {
  cors: { // Mantén también la configuración de Socket.IO por si acaso
    origin: 'https://batalla-naval-navy.vercel.app',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
const gameManager = new GameManager(io);

// ... (resto de tu código de servidor)

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});