// src/classes/multiplayer/gameManager.js
import { v4 as uuidv4 } from 'uuid';
// Importa las nuevas clases de juego (asegúrate de que estas rutas sean correctas)
import { Game1v1, Game2v2 } from './gameModes.js';

export class GameManager {
    constructor(ioEmitter, playersPerGame = 2) {
        this.ioEmitter = ioEmitter; // Este es el objeto que el worker construyó para comunicarse con el Main Thread
        this.waitingPlayers = [];
        this.activeGames = new Map(); // Map<gameId, { instance: Game, playersReady: Set<playerId> }>
        this.PLAYERS_PER_GAME = playersPerGame; // Define para qué modo es este GameManager
        console.log(`GameManager inicializado para partidas de ${this.PLAYERS_PER_GAME} jugadores.`);
    }

    addPlayer(playerInfo) {
        const playerId = playerInfo.id;

        // Evita añadir el mismo jugador varias veces a la cola
        if (!this.waitingPlayers.some(p => p.id === playerId)) {
            this.waitingPlayers.push(playerInfo);
            console.log(`+ Jugador ${playerId.substring(0,6)}... en cola para ${this.PLAYERS_PER_GAME}p. Total: ${this.waitingPlayers.length} (Necesario: ${this.PLAYERS_PER_GAME})`);
        } else {
            console.log(`Jugador ${playerId.substring(0,6)}... ya está en la cola.`);
        }

        // Notifica al jugador sobre su estado en la cola
        this.ioEmitter.to(playerId).emit('statusUpdate', {
            status: 'waitingInQueue',
            message: `Estás en la cola. Jugadores esperando: ${this.waitingPlayers.length}. Necesitamos ${this.PLAYERS_PER_GAME - this.waitingPlayers.length} más.`,
            waitingCount: this.waitingPlayers.length,
            requiredPlayers: this.PLAYERS_PER_GAME,
            mode: this.PLAYERS_PER_GAME // Envía el modo de juego
        });
        // Emite una actualización general de la cola (para el frontend que muestra contadores)
        this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });

        // Si hay suficientes jugadores, inicia una partida
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
                username: p.username // Asegúrate de pasar el username si lo usas
            }));

            // Instancia la clase de juego correcta según el modo
            if (this.PLAYERS_PER_GAME === 4) {
                newGameInstance = new Game2v2(gameId, gamePlayersData, this.ioEmitter);
            } else { // Por defecto, es 1vs1
                newGameInstance = new Game1v1(gameId, gamePlayersData, this.ioEmitter);
            }

            this.activeGames.set(gameId, { instance: newGameInstance, playersReady: new Set() }); // Guarda la instancia de juego y un set para rastrear jugadores listos

            playersForGame.forEach((player, index) => {
                // Solicita al Main Thread que el socket se una a la sala de Socket.IO
                this.ioEmitter.joinRoom(gameId, player.id);

                let gameFoundData = {
                    gameId,
                    playerNumber: index + 1,
                    message: `Partida ${gameId.substring(0, 6)}... encontrada. ¡Coloca tus barcos!`,
                    playersInGame: newGameInstance.players.map(p => ({ id: p.id, teamId: p.team })), // Información completa de jugadores en el juego
                    // --- Información crucial para la inicialización del frontend ---
                    currentPlayerTurn: newGameInstance.turn,
                    // Para 2vs2, la fase inicial es colocación
                    gamePhase: this.PLAYERS_PER_GAME === 4 ? 'placement' : newGameInstance.phase
                    // -----------------------------------------------------------------
                };

                // Añade detalles específicos del modo 2vs2 (equipos, aliados, rivales)
                if (this.PLAYERS_PER_GAME === 4) {
                    const opponentIds = newGameInstance.players
                        .filter(p => p.id !== player.id)
                        .map(p => p.id);

                    gameFoundData = {
                        ...gameFoundData,
                        opponentIds: opponentIds,
                    };
                    // Emitir un evento específico para iniciar la fase de colocación en 2vs2
                    this.ioEmitter.to(player.id).emit('startPlacement', { gameId: gameId });

                } else { // Para 1vs1, solo un oponente
                    const opponent = playersForGame.find(p => p.id !== player.id);
                    gameFoundData = {
                        ...gameFoundData,
                        opponentId: opponent ? opponent.id : null,
                        gamePhase: newGameInstance.phase
                    };
                }
                this.ioEmitter.to(player.id).emit('gameFound', gameFoundData);
            });

            console.log(`~ Partida emparejada: ${gameId.substring(0,6)}... con ${this.PLAYERS_PER_GAME} jugadores. Turno inicial: ${newGameInstance.turn ? newGameInstance.turn.substring(0,6) + '...' : 'N/A'}. Fase: ${newGameInstance.phase}.`);
            // Actualiza el contador de la cola después de emparejar
            this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
        }
    }

    removePlayer(socketId) {
        // Elimina de la cola si está allí
        const initialQueueLength = this.waitingPlayers.length;
        this.waitingPlayers = this.waitingPlayers.filter(playerInfo => playerInfo.id !== socketId);
        if (this.waitingPlayers.length !== initialQueueLength) {
            console.log(`- Jugador ${socketId.substring(0,6)}... fuera de cola.`);
            this.ioEmitter.emit('waitingPlayersCountUpdate', { count: this.waitingPlayers.length, required: this.PLAYERS_PER_GAME, mode: this.PLAYERS_PER_GAME });
            return; // No es necesario buscar en juegos activos si ya estaba en cola
        }

        // Busca en juegos activos y delega la desconexión a la instancia de juego
        for (const [gameId, gameData] of this.activeGames.entries()) {
            const gameInstance = gameData.instance;
            // Comprueba si el jugador pertenece a este juego
            if (gameInstance.players.some(p => p.id === socketId)) {
                // Solicita al Main Thread que el socket deje la sala
                this.ioEmitter.leaveRoom(gameId, [socketId]);
                // Delega el manejo de la desconexión a la instancia de juego
                const gameEnded = gameInstance.handlePlayerDisconnect(socketId);
                if (gameEnded) { // Si el juego terminó debido a la desconexión
                    this.activeGames.delete(gameId);
                    console.log(`--- Juego ${gameId.substring(0,6)}... eliminado de activeGames.`);
                } else {
                    // Si el jugador se desconecta, también lo removemos del tracking de listos
                    gameData.playersReady.delete(socketId);
                }
                break; // El jugador solo puede estar en un juego activo
            }
        }
    }

    handleAction(socketId, data) {
        let gameData = null;
        // Encuentra la instancia de juego a la que pertenece el jugador que realizó la acción
        for (const gd of this.activeGames.values()) {
            if (gd.instance.players.some(p => p.id === socketId)) {
                gameData = gd;
                break;
            }
        }
        // Si el jugador no está en un juego activo, envía un error
        if (!gameData) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }

        const gameInstance = gameData.instance;

        // Delega la acción a la instancia de juego específica
        gameInstance.handleAction(socketId, data);

        // Si la acción es que el jugador está listo después de la colocación
        if (data.type === 'PLAYER_READY') {
            gameData.playersReady.add(socketId);
            console.log(`> Jugador ${socketId.substring(0,6)}... listo en juego ${gameInstance.id.substring(0,6)}... (${gameData.playersReady.size}/${gameInstance.players.filter(p => p.isActive).length} listos)`);

            // Verifica si todos los jugadores activos en el juego están listos
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
                // Si no todos están listos, puedes enviar una actualización al jugador que se acaba de listar
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'WAITING_FOR_OTHERS', message: 'Esperando a que los demás jugadores estén listos...' } });
            }
        }

        // Si el juego ha terminado después de la acción, elimínalo del registro
        if (gameInstance.phase === 'FINALIZADO') {
            this.activeGames.delete(gameInstance.id);
            console.log(`--- Juego ${gameInstance.id.substring(0,6)}... eliminado de activeGames.`);
        }
    }
}