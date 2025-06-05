import { v4 as uuidv4 } from 'uuid';
import { Game1v1, Game2v2 } from './gameModes.js';

export class GameManager {
    constructor(ioEmitter, playersPerGame = 2) {
        this.ioEmitter = ioEmitter;
        this.waitingPlayers = [];
        this.activeGames = new Map();
        this.PLAYERS_PER_GAME = playersPerGame;
        console.log(`GameManager inicializado para partidas de ${this.PLAYERS_PER_GAME} jugadores.`);
    }

    addPlayer(playerInfo) {
        const playerId = playerInfo.id;
        if (!this.waitingPlayers.some(p => p.id === playerId)) {
            this.waitingPlayers.push(playerInfo);
            console.log(`+ Jugador ${playerId.substring(0,6)}... en cola para ${this.PLAYERS_PER_GAME}p. Total: ${this.waitingPlayers.length} (Necesario: ${this.PLAYERS_PER_GAME})`);
        } else {
            console.log(`Jugador ${playerId.substring(0,6)}... ya está en la cola.`);
        }
        this.ioEmitter.to(playerId).emit('statusUpdate', {
            status: 'waitingInQueue',
            message: `Estás en la cola. Jugadores esperando: ${this.waitingPlayers.length}. Necesitamos ${this.PLAYERS_PER_GAME - this.waitingPlayers.length} más.`,
            waitingCount: this.waitingPlayers.length,
            requiredPlayers: this.PLAYERS_PER_GAME,
            mode: this.PLAYERS_PER_GAME
        });
        this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
        if (this.waitingPlayers.length >= this.PLAYERS_PER_GAME) {
            const playersForGame = [];
            for (let i = 0; i < this.PLAYERS_PER_GAME; i++) {
                playersForGame.push(this.waitingPlayers.shift());
            }
            const gameId = uuidv4();
            let newGameInstance = null;
            const gamePlayersData = playersForGame.map(p => ({
                id: p.id,
                username: p.username
            }));

            if (this.PLAYERS_PER_GAME === 4) {
                newGameInstance = new Game2v2(gameId, gamePlayersData, this.ioEmitter);
            } else { // Asumimos 1v1 si no es 4 jugadores
                newGameInstance = new Game1v1(gameId, gamePlayersData, this.ioEmitter);
            }

            this.activeGames.set(gameId, { instance: newGameInstance, playersReady: new Set() });

            playersForGame.forEach((player) => {
                this.ioEmitter.joinRoom(gameId, player.id);
                
                // Calcular los IDs de los oponentes como un array para cualquier modo
                const opponentIds = newGameInstance.players
                    .filter(p => p.id !== player.id)
                    .map(p => p.id);

                let gameFoundData = {
                    gameId,
                    message: `Partida ${gameId.substring(0, 6)}... encontrada. ¡Coloca tus barcos!`,
                    playersInGame: newGameInstance.players.map(p => ({ id: p.id, teamId: p.team })),
                    currentPlayerTurn: newGameInstance.turn,
                    gamePhase: newGameInstance.phase,
                    opponentIds: opponentIds, // SIEMPRE enviamos un array de oponentes
                    teamId: player.team // Asegúrate de enviar el teamId para el jugador
                };

                if (this.PLAYERS_PER_GAME === 4) {
                    this.ioEmitter.to(player.id).emit('startPlacement', { gameId: gameId });
                }
                
                this.ioEmitter.to(player.id).emit('gameFound', gameFoundData);
            });

            console.log(`~ Partida emparejada: ${gameId.substring(0,6)}... con ${this.PLAYERS_PER_GAME} jugadores. Turno inicial: ${newGameInstance.turn ? newGameInstance.turn.substring(0,6) + '...' : 'N/A'}. Fase: ${newGameInstance.phase}.`);
            this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
        }
    }

    removePlayer(socketId) {
        const initialQueueLength = this.waitingPlayers.length;
        this.waitingPlayers = this.waitingPlayers.filter(playerInfo => playerInfo.id !== socketId);
        if (this.waitingPlayers.length !== initialQueueLength) {
            console.log(`- Jugador ${socketId.substring(0,6)}... fuera de cola.`);
            this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
            return;
        }
        for (const [gameId, gameData] of this.activeGames.entries()) {
            const gameInstance = gameData.instance;
            if (gameInstance.players.some(p => p.id === socketId)) {
                this.ioEmitter.leaveRoom(gameId, [socketId]);
                const gameEnded = gameInstance.handlePlayerDisconnect(socketId);
                if (gameEnded) {
                    this.activeGames.delete(gameId);
                    console.log(`--- Juego ${gameId.substring(0,6)}... eliminado de activeGames.`);
                } else {
                    gameData.playersReady.delete(socketId);
                }
                break;
            }
        }
    }

    handleAction(socketId, data) {
        let gameData = null;
        for (const gd of this.activeGames.values()) {
            if (gd.instance.players.some(p => p.id === socketId)) {
                gameData = gd;
                break;
            }
        }
        if (!gameData) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }
        const gameInstance = gameData.instance;
        gameInstance.handleAction(socketId, data);
        if (data.type === 'PLAYER_READY') {
            gameData.playersReady.add(socketId);
            console.log(`> Jugador ${socketId.substring(0,6)}... listo en juego ${gameInstance.id.substring(0,6)}... (${gameData.playersReady.size}/${gameInstance.players.filter(p => p.isActive).length} listos)`);
            if (gameData.playersReady.size === gameInstance.players.filter(p => p.isActive).length) {
                console.log(`>> Todos los jugadores en ${gameInstance.id.substring(0,6)}... están listos. Iniciando fase de BATALLA.`);
                gameInstance.phase = 'BATALLA';
                gameInstance.playerOrder = gameInstance.players.filter(p => p.isActive).map(p => p.id);
                if (gameInstance.playerOrder.length > 0) {
                    gameInstance.turnIndex = Math.floor(Math.random() * gameInstance.playerOrder.length);
                    gameInstance.turn = gameInstance.playerOrder[gameInstance.turnIndex];
                    console.log(`>> Primer turno asignado a: ${gameInstance.turn.substring(0,6)}...`);
                } else {
                    gameInstance.turn = null;
                    console.error(`ERROR: No hay jugadores activos para asignar el primer turno de batalla en ${gameInstance.id.substring(0,6)}...`);
                }
                this.ioEmitter.toRoom(gameInstance.id).emit('gameStarted', {
                    gameId: gameInstance.id,
                    startingPlayerId: gameInstance.turn,
                    message: '¡Batalla iniciada!'
                });
                gameInstance.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'WAITING_FOR_OTHERS', message: 'Esperando a que los demás jugadores estén listos...' } });
            }
        }
        if (gameInstance.phase === 'FINALIZADO') {
            this.activeGames.delete(gameInstance.id);
            console.log(`--- Juego ${gameInstance.id.substring(0,6)}... eliminado de activeGames.`);
        }
    }
}