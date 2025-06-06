import { parentPort, workerData } from 'worker_threads';
import { GameManager } from '../classes/multiplayer/gameManager.js';

const NUM_PLAYERS_MODE = workerData.playersPerGame;
const WORKER_NAME = workerData.workerName;

let gameManager = null;
gameManager = new GameManager(
    {
        // Emisión general a todos los sockets conectados (simula io.emit)
        emit: (event, data) => {
            parentPort.postMessage({
                type: 'gameUpdate',
                payload: { event, data, targetPlayerId: null, gameId: null }
            });
        },
        // Emisión a un socket específico (simula io.to(socketId).emit)
        to: (targetId) => ({
            emit: (event, data) => {
                parentPort.postMessage({
                    type: 'gameUpdate',
                    payload: { event, data, targetPlayerId: targetId }
                });
            }
        }),
        // Emisión a una sala específica (simula io.to(gameId).emit)
        toRoom: (gameId) => ({ 
            emit: (event, data) => {
                parentPort.postMessage({
                    type: 'gameUpdate',
                    payload: { event, data, targetPlayerId: null, gameId: gameId } 
                });
            }
        }),
        // Solicitar al hilo principal que un socket se una a una sala
        joinRoom: (gameId, playerId) => {
            parentPort.postMessage({
                type: 'joinRoom',
                payload: { gameId: gameId, playerId: playerId }
            });
        },
        // Solicitar al hilo principal que uno o varios sockets dejen una sala
        leaveRoom: (gameId, playerIds) => { 
            parentPort.postMessage({
                type: 'leaveRoom',
                payload: { gameId: gameId, playerIds: playerIds }
            });
        }
    },
    NUM_PLAYERS_MODE // El GameManager se inicializa con el modo de juego de este worker
);

// Listener para mensajes que provienen del hilo principal
parentPort.on('message', (message) => {
    switch (message.type) {
        case 'addPlayer':
            gameManager.addPlayer({ id: message.playerId, username: message.playerInfo.username });
            break;
        case 'removePlayer':
            gameManager.removePlayer(message.playerId);
            break;
        case 'playerAction':
            gameManager.handleAction(message.playerId, message.data);
            break;
        default:
            console.warn(`${WORKER_NAME} received unknown message type:`, message.type);
    }
});

console.log(`${WORKER_NAME} thread started, handling ${NUM_PLAYERS_MODE}-player games.`);

parentPort.on('close', () => {
    console.log(`${WORKER_NAME} thread is closing.`);
});