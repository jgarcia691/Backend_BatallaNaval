import { Tablero } from '../tablero/Tablero.js';

class Game {
    constructor(id, playersData, ioEmitter, playersPerGame) {
        this.id = id;
        this.players = playersData.map(p => ({
            id: p.id,
            isReady: false,
            board: null,
            isActive: true,
            team: p.team || null, // Asegurar que 'team' se inicialice
            allMyShipsSunk: false
        }));
        this.ioEmitter = ioEmitter;
        this.playersPerGame = playersPerGame;
        this.turnIndex = 0;
        this.turn = null;
        this.phase = 'placement'; // Fase inicial
        this.boards = {};
        this.playerOrder = [];
        this.players.forEach(p => {
            this.boards[p.id] = null;
        });
    }

    handleAction(socketId, data) {
        throw new Error('handleAction must be implemented by subclasses');
    }

    advanceTurn() {
        throw new Error('advanceTurn must be implemented by subclasses');
    }

    checkGameEndCondition() {
        throw new Error('checkGameEndCondition must be implemented by subclasses');
    }

    handlePlayerDisconnect(socketId) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (playerInGame) {
            console.log(`- Jugador ${socketId.substring(0,6)}... desconectado de juego ${this.id.substring(0,6)}.`);
            playerInGame.isActive = false;

            this.players.filter(p => p.isActive).forEach(p => {
                this.ioEmitter.to(p.id).emit('playerAction', {
                    action: { type: 'OPPONENT_LEFT', opponentId: socketId, message: `El jugador ${socketId.substring(0, 6)}... ha abandonado la partida.` }
                });
            });

            this.checkGameEndCondition();

            if (this.phase === 'FINALIZADO') {
                return true;
            }

            if (this.turn === socketId && this.phase === 'BATALLA') {
                this.advanceTurn();
            }
            this.sendGameStateUpdateToAll();
        }
        return false;
    }

    // Esta función será sobrescrita en Game1v1 y Game2v2 para lógicas específicas
    sendGameStateUpdateToAll() {
        // Implementación base. Las subclases la sobrescribirán.
        this.players.forEach(player => {
            const myBoard = this.boards[player.id]?.toSimpleObject() || null;
            const opponentBoards = {};
            const playersInfoToSend = [];

            // Incluir al jugador actual en playersInfo
            const currentPlayerInfo = this.players.find(p => p.id === player.id);
            if (currentPlayerInfo) {
                playersInfoToSend.push({ 
                    id: currentPlayerInfo.id, 
                    isReady: currentPlayerInfo.isReady, 
                    allMyShipsSunk: currentPlayerInfo.allMyShipsSunk, 
                    isActive: currentPlayerInfo.isActive,
                    team: currentPlayerInfo.team 
                });
            }

            // Lógica genérica para oponentes: filtra activos y diferentes al jugador actual
            this.players.forEach(op => {
                if (op.id !== player.id && op.isActive) {
                    opponentBoards[op.id] = this.boards[op.id]?.toSimpleObject(true) || null;
                    playersInfoToSend.push({ 
                        id: op.id, 
                        isReady: op.isReady, 
                        allMyShipsSunk: op.allMyShipsSunk, 
                        isActive: op.isActive,
                        team: op.team 
                    });
                }
            });

            this.ioEmitter.to(player.id).emit('playerAction', {
                action: {
                    type: 'GAME_STATE_UPDATE',
                    gameId: this.id, // Añadir gameId explícitamente aquí si no está en todas las versiones
                    myBoard: myBoard,
                    opponentBoards: opponentBoards,
                    playersInfo: playersInfoToSend, 
                    message: this.phase === 'BATALLA' ? '¡Batalla en curso!' : `Fase actual: ${this.phase}`,
                    currentPlayerTurn: this.turn,
                    gamePhase: this.phase
                }
            });
        });
    }
}
class Game1v1 extends Game {
    constructor(id, playersData, ioEmitter) {
        super(id, playersData, ioEmitter, 2);
        console.log(`Juego 1vs1 ${id.substring(0,6)}... inicializado. Fase: ${this.phase}`);
        this.playerOrder = this.players.map(p => p.id);
    }

    // Sobreescribimos sendGameStateUpdateToAll para manejar la lógica específica de 1v1
    sendGameStateUpdateToAll() {
        this.players.forEach(player => { // Itera por cada jugador que recibirá el update
            let myBoard = null;
            const opponentBoards = {};
            const playersInfoToSend = [];
            
            // Incluir al jugador actual en playersInfo
            const currentPlayerInfo = this.players.find(p => p.id === player.id);
            if (currentPlayerInfo) {
                playersInfoToSend.push({ 
                    id: currentPlayerInfo.id, 
                    isReady: currentPlayerInfo.isReady, 
                    allMyShipsSunk: currentPlayerInfo.allMyShipsSunk,
                    isActive: currentPlayerInfo.isActive,
                    team: currentPlayerInfo.team
                });
            }

            myBoard = this.boards[player.id]?.toSimpleObject() || null;

            const opponentPlayer = this.players.find(p => p.id !== player.id);
            if (opponentPlayer) {
                opponentBoards[opponentPlayer.id] = this.boards[opponentPlayer.id]?.toSimpleObject(true) || null;
                playersInfoToSend.push({ 
                    id: opponentPlayer.id, 
                    isReady: opponentPlayer.isReady, 
                    allMyShipsSunk: opponentPlayer.allMyShipsSunk,
                    isActive: opponentPlayer.isActive,
                    team: opponentPlayer.team
                });
            }

            this.ioEmitter.to(player.id).emit('playerAction', {
                action: {
                    type: 'GAME_STATE_UPDATE',
                    gameId: this.id,
                    myBoard: myBoard,
                    opponentBoards: opponentBoards,
                    playersInfo: playersInfoToSend, 
                    message: this.phase === 'BATALLA' ? '¡Batalla en curso!' : `Fase actual: ${this.phase}`,
                    currentPlayerTurn: this.turn,
                    gamePhase: this.phase
                }
            });
        });
    }

    handleAction(socketId, data) {
        console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Recibida acción de ${socketId.substring(0,6)}...:`, data);

        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: Jugador ${socketId.substring(0,6)}... no está en un juego activo.`);
            return;
        }

        if (this.phase === 'placement') {
            if (data.type === 'PLAYER_READY') {
                const { placedPlayerShipsData } = data;
                if (this.boards[socketId] !== null) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                    console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: ${socketId.substring(0,6)}... ya colocó sus barcos.`);
                    return;
                }

                playerInGame.isReady = true;
                this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                console.log(`> Jugador ${socketId.substring(0,6)}... ha colocado sus barcos en ${this.id.substring(0,6)}.`);
                if (this.boards[socketId] instanceof Tablero) {
                    console.log(`[DEBUG] Tablero de ${socketId.substring(0,6)}... inicializado correctamente. Tamaño: ${this.boards[socketId].grid.length}x${this.boards[socketId].grid[0].length}`);
                } else {
                    console.error(`[ERROR FATAL] Tablero de ${socketId.substring(0,6)}... NO se inicializó correctamente. Tipo: ${typeof this.boards[socketId]}. Datos recibidos:`, placedPlayerShipsData);
                }

                const allActivePlayersPlacedShips = this.players.filter(p => p.isActive).every(p => p.isReady && this.boards[p.id] !== null);

                if (allActivePlayersPlacedShips) {
                    console.log(`>> Todos los jugadores activos en ${this.id.substring(0,6)}... han colocado barcos. Transicionando a fase de BATALLA.`);
                    this.phase = 'BATALLA';

                    const eligiblePlayersForTurn = this.players.filter(p => p.isActive && !p.allMyShipsSunk).map(p => p.id);
                    if (eligiblePlayersForTurn.length > 0) {
                        this.turnIndex = Math.floor(Math.random() * eligiblePlayersForTurn.length);
                        this.turn = eligiblePlayersForTurn[this.turnIndex];
                        console.log(`>> Primer turno de batalla asignado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);
                    } else {
                        this.turn = null;
                        console.error(`ERROR: No hay jugadores activos para asignar el primer turno de batalla en ${this.id.substring(0,6)}...`);
                    }

                    this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                        gameId: this.id,
                        startingPlayerId: this.turn,
                        message: '¡Batalla iniciada!'
                    });
                    this.sendGameStateUpdateToAll();
                    return;
                } else {
                    console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Esperando a que todos los jugadores coloquen barcos. Jugadores listos: ${this.players.filter(p => p.isActive && p.isReady).length}/${this.players.filter(p => p.isActive).length}`);
                    this.sendGameStateUpdateToAll();
                }
                return;
            }
        }

        if (this.phase === 'BATALLA') {
            console.log(`[DEBUG] Fase actual: ${this.phase}. Se intenta acción de tipo: ${data.type}`);

            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' } });
                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: No es el turno de ${socketId.substring(0,6)}... Turno actual: ${this.turn?.substring(0,6)}...`);
                return;
            }

            const attackingPlayerBoard = this.boards[socketId];
            if (attackingPlayerBoard && attackingPlayerBoard.areAllShipsSunk()) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No puedes atacar. ¡Todos tus barcos han sido hundidos!' } });
                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: ${socketId.substring(0,6)}... intentó atacar con barcos hundidos.`);
                this.checkGameEndCondition();
                if (this.phase !== 'FINALIZADO') {
                    this.advanceTurnBattle();
                }
                this.sendGameStateUpdateToAll();
                return;
            }

            if (data.type === 'ATTACK') {
                const { targetPlayerId, coordinates } = data;

                const targetPlayerInfo = this.players.find(p => p.id === targetPlayerId && p.isActive);
                if (!targetPlayerInfo || targetPlayerInfo.id === socketId) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Objetivo inválido o inactivo.' } });
                    console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: Objetivo inválido para ${socketId.substring(0,6)}... Target: ${targetPlayerId}.`);
                    return;
                }

                const targetPlayerBoardInstance = this.boards[targetPlayerInfo.id];
                console.log(`[DEBUG - ATTACK] Jugador atacante: ${socketId.substring(0,6)}... Objetivo: ${targetPlayerInfo.id.substring(0,6)}...`);
                console.log(`[DEBUG - ATTACK] Tipo de targetPlayerBoardInstance: ${targetPlayerBoardInstance ? targetPlayerBoardInstance.constructor.name : 'null/undefined'}`);

                if (!targetPlayerBoardInstance || !(targetPlayerBoardInstance instanceof Tablero)) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto o no inicializado.' } });
                    console.error(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: Tablero oponente corrupto o no inicializado para ${targetPlayerInfo.id.substring(0,6)}...`);
                    return;
                }

                const attackResult = targetPlayerBoardInstance.attackCell(coordinates.row, coordinates.col);
                this.boards[targetPlayerInfo.id] = attackResult.newTablero;

                console.log(`> ${socketId.substring(0,6)}... ataca [${coordinates.row},${coordinates.col}] en el tablero de ${targetPlayerInfo.id.substring(0,6)}... Resultado: ${attackResult.message}`);

                this.ioEmitter.to(socketId).emit('playerAction', {
                    action: {
                        type: 'ATTACK_RESULT',
                        targetPlayerId: targetPlayerInfo.id,
                        coordinates,
                        status: attackResult.status,
                        message: attackResult.message,
                        sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                        newTableroTarget: attackResult.newTablero.toSimpleObject(true)
                    }
                });
                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Emitido ATTACK_RESULT a ${socketId.substring(0,6)}...`);

                this.ioEmitter.to(targetPlayerInfo.id).emit('playerAction', {
                    action: {
                        type: 'ATTACK_RECEIVED',
                        attackingPlayerId: socketId,
                        coordinates,
                        status: attackResult.status,
                        message: attackResult.message,
                        sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                        newTableroPlayer: this.boards[targetPlayerInfo.id].toSimpleObject()
                    }
                });
                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Emitido ATTACK_RECEIVED a ${targetPlayerInfo.id.substring(0,6)}...`);

                if (attackResult.newTablero.areAllShipsSunk()) {
                    console.log(`Jugador ${targetPlayerInfo.id.substring(0,6)}... ha sido hundido por ${socketId.substring(0,6)}.`);
                    targetPlayerInfo.allMyShipsSunk = true;

                    this.ioEmitter.toRoom(this.id).emit('playerAction', {
                        action: { type: 'PLAYER_ELIMINATED', playerId: targetPlayerInfo.id, eliminatedBy: socketId, message: `¡Todos los barcos de ${targetPlayerInfo.id.substring(0,6)}... han sido hundidos!` }
                    });
                    console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Emitido PLAYER_ELIMINATED para ${targetPlayerInfo.id.substring(0,6)}...`);
                }

                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Verificando condición de fin de juego...`);
                this.checkGameEndCondition();
                if (this.phase === 'FINALIZADO') {
                    console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] El juego ha finalizado. Enviando estado final.`);
                    this.sendGameStateUpdateToAll();
                    return;
                }

                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Avanzando turno...`);
                this.advanceTurnBattle();
                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Enviando actualización de estado general a todos.`);
                this.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` } });
                console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: Acción no reconocida de ${socketId.substring(0,6)}... Tipo: ${data.type}`);
            }
        } else {
            this.ioEmitter.to(socketId).emit('playerAction', {
                action: {
                    type: 'ERROR',
                    message: `No se puede realizar la acción '${data.type}' en la fase actual: ${this.phase}`
                }
            });
            console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] ERROR: Acción ${data.type} no permitida en fase ${this.phase} para ${socketId.substring(0,6)}...`);
        }
    }

    advanceTurnBattle() {
        const eligiblePlayers = this.players.filter(p => p.isActive && !p.allMyShipsSunk);
        console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] advanceTurnBattle: Jugadores elegibles (${eligiblePlayers.length}):`, eligiblePlayers.map(p => p.id.substring(0,6)));

        if (eligiblePlayers.length === 0) {
            this.turn = null;
            console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] No hay jugadores elegibles. Llamando a checkGameEndCondition.`);
            this.checkGameEndCondition();
            return;
        }

        if (eligiblePlayers.length === 1) {
            this.turn = null;
            console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Un solo jugador restante. Llamando a checkGameEndCondition para finalizar.`);
            this.checkGameEndCondition();
            return;
        }

        let currentTurnIndex = eligiblePlayers.findIndex(p => p.id === this.turn);
        let nextIndex;

        if (currentTurnIndex === -1) {
            console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Jugador de turno actual (${this.turn?.substring(0,6)}...) no encontrado en elegibles. Asignando siguiente turno aleatoriamente.`);
            nextIndex = Math.floor(Math.random() * eligiblePlayers.length);
        } else {
            nextIndex = (currentTurnIndex + 1) % eligiblePlayers.length;
        }

        this.turn = eligiblePlayers[nextIndex].id;
        console.log(`> Turno de batalla avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);

        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
        console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Emitido TURN_CHANGE a la sala ${this.id.substring(0,6)}... para ${this.turn.substring(0,6)}...`);
    }

    checkGameEndCondition() {
        if (this.phase === 'FINALIZADO') return;

        const activeAndAlivePlayers = this.players.filter(p => p.isActive && !p.allMyShipsSunk);
        console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] checkGameEndCondition: Jugadores activos y vivos: ${activeAndAlivePlayers.length}`);

        if (activeAndAlivePlayers.length <= 1) {
            this.phase = 'FINALIZADO';
            const winnerPlayer = activeAndAlivePlayers[0] || null;
            console.log(`### Juego 1vs1 ${this.id.substring(0,6)}... FINALIZADO. Ganador: ${winnerPlayer?.id?.substring(0,6)}...`);
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: {
                    type: 'GAME_OVER',
                    winnerPlayerId: winnerPlayer?.id || null,
                    message: winnerPlayer ? `¡${winnerPlayer.id.substring(0,6)}... ha ganado la batalla!` : '¡La partida ha terminado sin ganador claro!'
                }
            });
            console.log(`[BACKEND - Game1v1 - ${this.id.substring(0,6)}] Emitido GAME_OVER a la sala ${this.id.substring(0,6)}...`);
        }
    }
}

// Clase Game2v2
class Game2v2 extends Game {
    constructor(id, playersData, ioEmitter) {
        super(id, playersData, ioEmitter, 4);
        this.playersData = playersData;
        this.boards = {};
        this.playerOrder = playersData.map(p => p.id);
        this.currentPlayerTurn = this.playerOrder[0] || null;
        this.assignInitialState();
        console.log(`Juego 2vs2 ${id.substring(0, 6)}... inicializado con 4 tableros independientes. Fase: ${this.phase}`);
        this.sendGameStateUpdateToAll();
    }

    assignInitialState() {
        this.players.forEach(player => {
            player.isReady = false;
            player.allMyShipsSunk = false;
            this.boards[player.id] = null;
        });
    }

    advanceTurn() {
        this.advanceTurnBattle();
    }

    // Sobrescribimos sendGameStateUpdateToAll para manejar la lógica específica de 2v2 (equipos)
    sendGameStateUpdateToAll() {
        this.players.forEach(player => {
            const myBoard = this.boards[player.id] ? this.boards[player.id].toSimpleObject() : null;
            const opponentBoards = {};
            const playersInfoToSend = [];

            // Incluir al jugador actual en playersInfo
            const currentPlayerInfo = this.players.find(p => p.id === player.id);
            if (currentPlayerInfo) {
                playersInfoToSend.push({ 
                    id: currentPlayerInfo.id, 
                    isReady: currentPlayerInfo.isReady, 
                    allMyShipsSunk: currentPlayerInfo.allMyShipsSunk, 
                    isActive: currentPlayerInfo.isActive,
                    team: currentPlayerInfo.team 
                });
            }

            // Para 2v2, los "oponentes" son todos los demás jugadores activos, incluyendo los del propio equipo
            // si el cliente necesita ver los tableros de sus compañeros (visibilidad completa para ambos equipos)
            // o solo de los oponentes si solo se ataca al equipo contrario.
            // Dada la lógica actual de ataque, se ataca a cualquier jugador, por lo que es más fácil
            // enviar todos los tableros no propios, pero ocultando los barcos.
            this.players.forEach(op => {
                if (op.id !== player.id && op.isActive) { // Aquí filtramos solo jugadores activos
                    // La lógica 'true' en toSimpleObject(true) oculta los barcos del oponente
                    opponentBoards[op.id] = this.boards[op.id] ? this.boards[op.id].toSimpleObject(true) : null;
                    playersInfoToSend.push({ 
                        id: op.id, 
                        isReady: op.isReady, 
                        allMyShipsSunk: op.allMyShipsSunk, 
                        isActive: op.isActive,
                        team: op.team 
                    });
                }
            });

            this.ioEmitter.to(player.id).emit('playerAction', {
                action: {
                    type: 'GAME_STATE_UPDATE',
                    gameId: this.id,
                    myBoard: myBoard,
                    opponentBoards: opponentBoards,
                    message: this.message,
                    currentPlayerTurn: this.turn,
                    gamePhase: this.phase,
                    playersInfo: playersInfoToSend, // Usa la lista construida
                }
            });
        });
    }

    handlePlayerDisconnect(socketId) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (playerInGame && playerInGame.isActive) {
            playerInGame.isActive = false;
            console.log(`Jugador ${socketId.substring(0, 6)}... se ha desconectado del juego ${this.id.substring(0, 6)}.`);
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: { type: 'PLAYER_DISCONNECTED', playerId: socketId, message: `¡${socketId.substring(0, 6)}... se ha desconectado!` }
            });
            this.checkGameEndCondition(); // Re-chequear condición de fin de juego
        }
        // Llamamos a la implementación de la clase base para que maneje la emisión de OPPONENT_LEFT
        // y el avance de turno si el desconectado era el turno y el juego no ha finalizado.
        return super.handlePlayerDisconnect(socketId);
    }

    handleAction(socketId, data) {
        console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Recibida acción de ${socketId.substring(0,6)}...:`, data);

        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: Jugador ${socketId.substring(0,6)}... no está en un juego activo.`);
            return;
        }

        if (this.phase === 'placement') {
            if (data.type === 'PLAYER_READY') {
                const { placedPlayerShipsData } = data;

                if (this.boards[socketId] !== null) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                    console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: ${socketId.substring(0,6)}... ya colocó sus barcos.`);
                    return;
                }

                playerInGame.isReady = true;
                this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                console.log(`> Jugador ${socketId.substring(0, 6)}... ha colocado sus barcos en juego ${this.id.substring(0, 6)}.`);
                if (this.boards[socketId] instanceof Tablero) {
                    console.log(`[DEBUG] Tablero de ${socketId.substring(0,6)}... inicializado correctamente. Tamaño: ${this.boards[socketId].grid.length}x${this.boards[socketId].grid[0].length}`);
                } else {
                    console.error(`[ERROR FATAL] Tablero de ${socketId.substring(0,6)}... NO se inicializó correctamente. Tipo: ${typeof this.boards[socketId]}. Datos recibidos:`, placedPlayerShipsData);
                }

                const allPlayersReady = this.players.filter(p => p.isActive).every(p => p.isReady);

                if (allPlayersReady) {
                    console.log(`>> Todos los jugadores en ${this.id.substring(0, 6)}... han colocado barcos. Transicionando a fase de BATALLA.`);
                    this.phase = 'BATALLA';
                    this.playerOrder = this.players.filter(p => p.isActive).map(p => p.id);
                    if (this.playerOrder.length > 0) {
                        this.turnIndex = Math.floor(Math.random() * this.playerOrder.length);
                        this.turn = this.playerOrder[this.turnIndex];
                        console.log(`>> Primer turno de batalla asignado a: ${this.turn.substring(0, 6)}...`);
                    } else {
                        this.turn = null;
                        console.error(`ERROR: No hay jugadores activos para asignar el primer turno de batalla en ${this.id.substring(0, 6)}...`);
                    }
                    this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                        gameId: this.id,
                        startingPlayerId: this.turn,
                        message: '¡Batalla iniciada!'
                    });
                    this.sendGameStateUpdateToAll();
                    return;
                } else {
                    console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Esperando a que todos los jugadores coloquen barcos. Jugadores listos: ${this.players.filter(p => p.isActive && p.isReady).length}/${this.players.filter(p => p.isActive).length}`);
                    this.sendGameStateUpdateToAll();
                }
                return;
            }
        }

        if (this.phase === 'BATALLA') {
            console.log(`[DEBUG] Fase actual: ${this.phase}. Se intenta acción de tipo: ${data.type}`);

            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' } });
                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: No es el turno de ${socketId.substring(0,6)}... Turno actual: ${this.turn?.substring(0,6)}...`);
                return;
            }

            const attackingPlayerBoard = this.boards[socketId];
            if (attackingPlayerBoard && attackingPlayerBoard.areAllShipsSunk()) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No puedes atacar. ¡Todos tus barcos han sido hundidos!' } });
                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: ${socketId.substring(0,6)}... intentó atacar con barcos hundidos.`);
                this.advanceTurnBattle();
                this.sendGameStateUpdateToAll();
                return;
            }

            if (data.type === 'ATTACK') {
                const { targetPlayerId, coordinates } = data;
                const attackingPlayer = this.players.find(p => p.id === socketId);
                const targetPlayer = this.players.find(p => p.id === targetPlayerId && p.isActive);

                if (!targetPlayer || targetPlayer.id === socketId) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Objetivo de ataque inválido.' } });
                    console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: Objetivo inválido para ${socketId.substring(0,6)}... Target: ${targetPlayerId}.`);
                    return;
                }

                if (attackingPlayer && targetPlayer && attackingPlayer.team && targetPlayer.team && attackingPlayer.team === targetPlayer.team) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: '¡No puedes atacar a un compañero de equipo!' } });
                    console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: ${socketId.substring(0,6)}... intentó atacar a su propio equipo (${targetPlayerId}).`);
                    return;
                }


                const targetBoardInstance = this.boards[targetPlayerId];
                console.log(`[DEBUG - ATTACK] Jugador atacante: ${socketId.substring(0,6)}... Objetivo: ${targetPlayerId.substring(0,6)}...`);
                console.log(`[DEBUG - ATTACK] Tipo de targetPlayerBoardInstance: ${targetBoardInstance ? targetBoardInstance.constructor.name : 'null/undefined'}`);

                if (!targetBoardInstance || !(targetBoardInstance instanceof Tablero)) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto o no inicializado.' } });
                    console.error(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: Tablero oponente corrupto o no inicializado para ${targetPlayerId.substring(0,6)}...`);
                    return;
                }

                const attackResult = targetBoardInstance.attackCell(coordinates.row, coordinates.col);
                this.boards[targetPlayerId] = attackResult.newTablero;

                console.log(`> ${socketId.substring(0, 6)}... ataca [${coordinates.row},${coordinates.col}] a ${targetPlayerId.substring(0, 6)}... Resultado: ${attackResult.message}`);

                this.ioEmitter.to(socketId).emit('playerAction', {
                    action: {
                        type: 'ATTACK_RESULT',
                        targetPlayerId: targetPlayerId,
                        coordinates,
                        status: attackResult.status,
                        message: attackResult.message,
                        sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                        newTableroTarget: attackResult.newTablero.toSimpleObject(true)
                    }
                });
                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Emitido ATTACK_RESULT a ${socketId.substring(0,6)}...`);

                this.ioEmitter.to(targetPlayerId).emit('playerAction', {
                    action: {
                        type: 'ATTACK_RECEIVED',
                        attackingPlayerId: socketId,
                        coordinates,
                        status: attackResult.status,
                        message: attackResult.message,
                        sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                        newTableroPlayer: this.boards[targetPlayerId].toSimpleObject()
                    }
                });
                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Emitido ATTACK_RECEIVED a ${targetPlayerId.substring(0,6)}...`);

                if (attackResult.newTablero.areAllShipsSunk()) {
                    console.log(`Jugador ${targetPlayerId.substring(0, 6)}... ha perdido todos sus barcos.`);
                    targetPlayer.allMyShipsSunk = true;
                    this.ioEmitter.toRoom(this.id).emit('playerAction', {
                        action: { type: 'PLAYER_ELIMINATED', playerId: targetPlayerId, eliminatedBy: socketId, message: `¡Todos los barcos de ${targetPlayerId.substring(0, 6)}... han sido hundidos!` }
                    });
                    console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Emitido PLAYER_ELIMINATED para ${targetPlayerId.substring(0,6)}...`);
                }

                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Verificando condición de fin de juego...`);
                this.checkGameEndCondition();
                if (this.phase === 'FINALIZADO') {
                    console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] El juego ha finalizado. Enviando estado final.`);
                    this.sendGameStateUpdateToAll();
                    return;
                }

                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Avanzando turno...`);
                this.advanceTurnBattle();
                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Enviando actualización de estado general a todos.`);
                this.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` } });
                console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: Acción no reconocida de ${socketId.substring(0,6)}... Tipo: ${data.type}`);
            }
        } else {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `No se puede realizar la acción '${data.type}' en la fase actual: ${this.phase}` } });
            console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] ERROR: Acción ${data.type} no permitida en fase ${this.phase} para ${socketId.substring(0,6)}...`);
        }
    }

    advanceTurnBattle() {
        const activeAndNotSunkPlayers = this.players.filter(p => p.isActive && !p.allMyShipsSunk);
        const alivePlayerIds = activeAndNotSunkPlayers.map(p => p.id);
        console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] advanceTurnBattle: Jugadores activos y no hundidos (${alivePlayerIds.length}):`, alivePlayerIds.map(id => id.substring(0,6)));

        if (alivePlayerIds.length <= 1) {
            this.turn = null;
            console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Menos de dos jugadores activos y no hundidos. Llamando a checkGameEndCondition.`);
            this.checkGameEndCondition();
            return;
        }

        let currentTurnIndex = alivePlayerIds.indexOf(this.turn);
        if (currentTurnIndex === -1) {
            console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Jugador de turno actual (${this.turn?.substring(0,6)}...) no encontrado en jugadores activos y no hundidos. Asignando siguiente turno aleatoriamente.`);
            currentTurnIndex = Math.floor(Math.random() * alivePlayerIds.length); // Asigna un índice aleatorio si no se encuentra
        }

        const nextIndex = (currentTurnIndex + 1) % alivePlayerIds.length;
        this.turn = alivePlayerIds[nextIndex];
        console.log(`> Turno de batalla avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);

        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
        console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Emitido TURN_CHANGE a la sala ${this.id.substring(0,6)}... para ${this.turn.substring(0,6)}...`);
    }

    checkGameEndCondition() {
        if (this.phase === 'FINALIZADO') return;

        // En 2v2, la condición de fin de juego se basa en si solo queda un equipo activo
        const activeTeams = new Set();
        this.players.filter(p => p.isActive && !p.allMyShipsSunk).forEach(p => {
            if (p.team) { // Asegúrate de que los jugadores tienen una propiedad 'team'
                activeTeams.add(p.team);
            }
        });
        console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] checkGameEndCondition: Equipos activos: ${activeTeams.size}`);

        if (activeTeams.size <= 1) {
            this.phase = 'FINALIZADO';
            const winnerTeamId = activeTeams.size === 1 ? Array.from(activeTeams)[0] : null;
            
            // Encuentra un jugador del equipo ganador para el mensaje, si existe
            const winnerPlayer = winnerTeamId ? this.players.find(p => p.team === winnerTeamId && p.isActive && !p.allMyShipsSunk) : null;
            const winnerPlayerId = winnerPlayer?.id || null;
            const winnerMessageName = winnerPlayerId ? `El Equipo ${winnerTeamId} (representado por ${winnerPlayerId.substring(0,6)}...)` : '¡La partida ha terminado sin ganador claro!';

            console.log(`### Juego 2vs2 ${this.id.substring(0, 6)}... FINALIZADO. Ganador: ${winnerMessageName}`);
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: {
                    type: 'GAME_OVER',
                    winnerTeamId: winnerTeamId, // Añadir el ID del equipo ganador
                    winnerPlayerId: winnerPlayerId, // ID de un jugador del equipo ganador (opcional)
                    message: winnerMessageName
                }
            });
            console.log(`[BACKEND - Game2v2 - ${this.id.substring(0,6)}] Emitido GAME_OVER a la sala ${this.id.substring(0,6)}...`);
        }
    }
}

export { Game, Game1v1, Game2v2 };