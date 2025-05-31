import { v4 as uuidv4 } from 'uuid';
import { Tablero } from '../tablero/Tablero.js';

export class GameManager {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = [];
    this.activeGames = new Map();
  }

  addPlayer(socket) {
    const playerId = socket.id;
    socket.emit('connectionSuccess', { playerId, message: 'Conectado. Buscando oponente...' });
    this.waitingPlayers.push(socket);
    socket.emit('statusUpdate', {
      status: 'waitingInQueue',
      message: `Estás en la cola. Jugadores esperando: ${this.waitingPlayers.length}.`,
      waitingCount: this.waitingPlayers.length,
    });
    this.io.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length });
    console.log(`+ Jugador ${playerId} en cola. Total: ${this.waitingPlayers.length}`);
    if (this.waitingPlayers.length >= 2) {
      const player1Socket = this.waitingPlayers.shift();
      const player2Socket = this.waitingPlayers.shift();
      const gameId = uuidv4();
      const gameData = {
        id: gameId,
        players: [
          { socket: player1Socket, id: player1Socket.id, isReady: false, board: null },
          { socket: player2Socket, id: player2Socket.id, isReady: false, board: null }
        ],
        turn: null,
        phase: 'COLOCACION',
        boards: {
          [player1Socket.id]: null,
          [player2Socket.id]: null
        }
      };
      this.activeGames.set(gameId, gameData);
      player1Socket.join(gameId);
      player2Socket.join(gameId);
      player1Socket.emit('gameFound', {
        gameId,
        playerNumber: 1,
        opponentId: player2Socket.id,
        message: `Partida ${gameId.substring(0,6)}... encontrada. Esperando oponente.`
      });
      player2Socket.emit('gameFound', {
        gameId,
        playerNumber: 2,
        opponentId: player1Socket.id,
        message: `Partida ${gameId.substring(0,6)}... encontrada. ¡Coloca tus barcos!`
      });
      console.log(`~ Partida emparejada: ${gameId} entre ${player1Socket.id} y ${player2Socket.id}. Fase: COLOCACION`);
      this.io.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length });
    }
  }

  removePlayer(socketId) {
    const initialQueueLength = this.waitingPlayers.length;
    this.waitingPlayers = this.waitingPlayers.filter(socket => socket.id !== socketId);
    if (this.waitingPlayers.length !== initialQueueLength) {
      console.log(`- Jugador ${socketId} fuera de cola.`);
      this.io.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length });
    }
    for (const [gameId, game] of this.activeGames.entries()) {
      const playerIndex = game.players.findIndex(p => p.id === socketId);
      if (playerIndex !== -1) {
        console.log(`- Jugador ${socketId} desconectado de juego ${gameId}.`);
        const remainingPlayerInfo = game.players.find(p => p.id !== socketId);
        if (remainingPlayerInfo && remainingPlayerInfo.socket) {
          remainingPlayerInfo.socket.emit('opponentLeft', { message: 'Oponente abandonó.' });
          remainingPlayerInfo.socket.emit('gameOver', { winnerId: remainingPlayerInfo.id, message: '¡Has ganado por desconexión!' });
        }
        game.players.forEach(p => { if (p.socket && p.socket.connected) p.socket.leave(gameId); });
        this.activeGames.delete(gameId);
        console.log(`x Juego ${gameId} terminado y eliminado.`);
        break;
      }
    }
  }

  handleAction(socketId, data) {
    let gameInstance = null;
    let playerInGame = null;
    for (const [gameId, game] of this.activeGames.entries()) {
      playerInGame = game.players.find(p => p.id === socketId);
      if (playerInGame) {
        gameInstance = game;
        break;
      }
    }
    if (!gameInstance) {
      console.log(`! Acción de ${socketId} sin juego activo.`);
      this.io.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' }});
      return;
    }

    if (data.type === 'PLAYER_READY') {
        const { gameId, playerId: senderId, placedPlayerShipsData } = data;
        playerInGame.isReady = true;
        gameInstance.boards[senderId] = Tablero.fromSimpleObject(placedPlayerShipsData);
        console.log(`> Jugador ${senderId} listo en ${gameId}. Listos: ${gameInstance.players.map(p => `${p.id}:${p.isReady}`).join(', ')}`);
        const allPlayersReady = gameInstance.players.every(p => p.isReady);
        if (allPlayersReady) {
            console.log(`>> Ambos jugadores en ${gameId} listos. Iniciando batalla.`);
            const startingPlayerInfo = gameInstance.players[Math.floor(Math.random() * gameInstance.players.length)];
            gameInstance.turn = startingPlayerInfo.id;
            gameInstance.phase = 'BATALLA';
            this.io.to(gameId).emit('gameStarted', {
                gameId: gameId,
                startingPlayerId: startingPlayerInfo.id,
                message: '¡Batalla iniciada!'
            });
        } else {
            playerInGame.socket.emit('playerAction', {
                action: { type: 'GAME_STATE_UPDATE', message: 'Esperando oponente...' }
            });
        }
        return;
    }

    if (gameInstance.turn !== socketId) {
      console.log(`! No es turno de ${socketId} para ${data.type}. Turno de: ${gameInstance.turn}`);
      this.io.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' }});
      return;
    }

    const opponentPlayerInfo = gameInstance.players.find(p => p.id !== socketId);
    if (!opponentPlayerInfo || !opponentPlayerInfo.socket) {
      console.log(`! Oponente no encontrado para ${socketId} en juego ${gameInstance.id}.`);
      this.io.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error: Oponente no encontrado.' }});
      return;
    }
    
    if (data.type === 'ATTACK') {
        const { coordinates } = data;
        const targetPlayerBoardInstance = gameInstance.boards[opponentPlayerInfo.id];
        
        if (!targetPlayerBoardInstance || !(targetPlayerBoardInstance instanceof Tablero)) {
            console.error(`! Tablero del oponente ${opponentPlayerInfo.id} no es una instancia de Tablero. ¡Error en el servidor!`);
            this.io.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto.' }});
            return;
        }

        const attackResult = targetPlayerBoardInstance.attackCell(coordinates.row, coordinates.col);
        gameInstance.boards[opponentPlayerInfo.id] = attackResult.newTablero; 
        
        console.log(`> ${socketId} ataca [${coordinates.row},${coordinates.col}] en ${opponentPlayerInfo.id}. Resultado: ${attackResult.message}`);
        
        console.log(`DEBUG: [Backend] Enviando ATTACK_RESULT a ATACANTE (${socketId})`);
        console.log(`  status: ${attackResult.status}`);
        console.log(`  message: ${attackResult.message}`);
        // Para una depuración más detallada del tablero, puedes expandir el log:
        const simpleBoardForDebug = attackResult.newTablero.toSimpleObject();
        console.log(`  newTableroRival (grid de celda atacada):`);

        this.io.to(socketId).emit('playerAction', {
            action: {
                type: 'ATTACK_RESULT',
                coordinates,
                status: attackResult.status,
                message: attackResult.message,
                sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                newTableroRival: attackResult.newTablero.toSimpleObject() 
            }
        });

        this.io.to(opponentPlayerInfo.id).emit('playerAction', {
            action: {
                type: 'ATTACK_RECEIVED',
                coordinates,
                status: attackResult.status,
                message: attackResult.message,
                sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
            }
        });

        if (attackResult.newTablero.areAllShipsSunk()) {
            this.io.to(gameInstance.id).emit('playerAction', {
                action: { type: 'GAME_OVER', winnerId: socketId, message: `¡${socketId} gana la partida!` }
            });
            gameInstance.phase = 'FINALIZADO';
            gameInstance.turn = null;
        } else {
            gameInstance.turn = opponentPlayerInfo.id;
            this.io.to(gameInstance.id).emit('playerAction', {
                action: { type: 'TURN_CHANGE', nextPlayerId: gameInstance.turn }
            });
        }

    } else {
        console.log(`! Acción desconocida de ${socketId}: ${data.type}`);
        this.io.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` }});
    }
  }
}