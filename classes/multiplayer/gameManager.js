// src/classes/multiplayer/gameManager.js
import { v4 as uuidv4 } from 'uuid';
// Importa las nuevas clases de juego
import { Game1v1, Game2v2 } from './gameModes.js'; 

export class GameManager {
    constructor(ioEmitter, playersPerGame = 2) {
        this.ioEmitter = ioEmitter; // Este es el objeto que el worker construyó para comunicarse con el Main Thread
        this.waitingPlayers = [];
        this.activeGames = new Map(); // Map<gameId, Game (Game1v1 o Game2v2)>
        this.PLAYERS_PER_GAME = playersPerGame; // Define para qué modo es este GameManager
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

        // Notificar al jugador sobre su estado en la cola
        this.ioEmitter.to(playerId).emit('statusUpdate', {
            status: 'waitingInQueue',
            message: `Estás en la cola. Jugadores esperando: ${this.waitingPlayers.length}. Necesitamos ${this.PLAYERS_PER_GAME - this.waitingPlayers.length} más.`,
            waitingCount: this.waitingPlayers.length,
            requiredPlayers: this.PLAYERS_PER_GAME,
            mode: this.PLAYERS_PER_GAME // Envía el modo de juego
        });
        // Emitir actualización general de la cola (para el frontend que muestra contadores)
        this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });

        // Si hay suficientes jugadores, iniciar una partida
        if (this.waitingPlayers.length >= this.PLAYERS_PER_GAME) {
            const playersForGame = [];
            for (let i = 0; i < this.PLAYERS_PER_GAME; i++) {
                playersForGame.push(this.waitingPlayers.shift()); // Saca jugadores de la cola
            }

            const gameId = uuidv4();
            let newGameInstance = null;

            // Prepara los datos básicos de los jugadores para la instancia de juego
            const gamePlayersData = playersForGame.map(p => ({
                id: p.id,
                username: p.username // Asegurarse de pasar el username si lo usas
            }));

            // Instanciar la clase de juego correcta según el modo
            if (this.PLAYERS_PER_GAME === 4) {
                newGameInstance = new Game2v2(gameId, gamePlayersData, this.ioEmitter);
            } else { // Por defecto, es 1vs1
                newGameInstance = new Game1v1(gameId, gamePlayersData, this.ioEmitter);
            }

            this.activeGames.set(gameId, newGameInstance); // Guardar la instancia de juego

            playersForGame.forEach((player, index) => {
                // Solicitar al Main Thread que el socket se una a la sala de Socket.IO
                this.ioEmitter.joinRoom(gameId, player.id); 

                let gameFoundData = {
                    gameId,
                    playerNumber: index + 1,
                    message: `Partida ${gameId.substring(0, 6)}... encontrada. ¡Coloca tus barcos!`,
                    playersInGame: newGameInstance.players.map(p => ({ id: p.id, teamId: p.team })) // Info completa de jugadores en el juego
                };

                if (this.PLAYERS_PER_GAME === 4) {
                    const currentPlayerGameData = newGameInstance.players.find(gp => gp.id === player.id);
                    const currentPlayerTeam = currentPlayerGameData ? currentPlayerGameData.team : null;
                    
                    const teamMates = newGameInstance.players
                        .filter(p => p.team === currentPlayerTeam && p.id !== player.id)
                        .map(p => p.id);

                    const opponents = newGameInstance.players
                        .filter(p => p.team !== currentPlayerTeam)
                        .map(p => p.id);

                    gameFoundData = {
                        ...gameFoundData,
                        teamId: currentPlayerTeam, 
                        teamMates: teamMates,
                        opponentIds: opponents,
                    };
                } else { // Para 1vs1, solo un oponente
                    gameFoundData = {
                        ...gameFoundData,
                        opponentId: playersForGame.filter(p => p.id !== player.id)[0]?.id, 
                    };
                }
                this.ioEmitter.to(player.id).emit('gameFound', gameFoundData);
            });

            console.log(`~ Partida emparejada: ${gameId.substring(0,6)}... con ${this.PLAYERS_PER_GAME} jugadores.`);
            // Actualizar el contador de la cola después de emparejar
            this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
        }
    }

    removePlayer(socketId) {
        // Eliminar de la cola si está allí
        const initialQueueLength = this.waitingPlayers.length;
        this.waitingPlayers = this.waitingPlayers.filter(playerInfo => playerInfo.id !== socketId);
        if (this.waitingPlayers.length !== initialQueueLength) {
            console.log(`- Jugador ${socketId.substring(0,6)}... fuera de cola.`);
            this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
            return; // No es necesario buscar en juegos activos si ya estaba en cola
        }

        // Buscar en juegos activos y delegar la desconexión a la instancia de juego
        for (const [gameId, gameInstance] of this.activeGames.entries()) {
            if (gameInstance.players.some(p => p.id === socketId)) {
                // Solicitar al Main Thread que el socket deje la sala
                this.ioEmitter.leaveRoom(gameId, [socketId]); 
                const gameEnded = gameInstance.handlePlayerDisconnect(socketId);
                if (gameEnded) { // Si el juego terminó debido a la desconexión
                    this.activeGames.delete(gameId);
                    console.log(`--- Juego ${gameId.substring(0,6)}... eliminado de activeGames.`);
                }
                break; // El jugador solo puede estar en un juego
            }
        }
    }

    handleAction(socketId, data) {
        let gameInstance = null;
        // Encuentra la instancia de juego a la que pertenece el jugador
        for (const game of this.activeGames.values()) {
            if (game.players.some(p => p.id === socketId)) {
                gameInstance = game;
                break;
            }
        }
        if (!gameInstance) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }

        // Delega la acción a la instancia de juego específica
        gameInstance.handleAction(socketId, data);

        // Si el juego ha terminado después de la acción, limpialo
        if (gameInstance.phase === 'FINALIZADO') {
            this.activeGames.delete(gameInstance.id);
            console.log(`--- Juego ${gameInstance.id.substring(0,6)}... eliminado de activeGames.`);
        }
    }
}