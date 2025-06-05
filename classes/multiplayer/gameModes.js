import { Tablero } from '../tablero/Tablero.js';

class Game {
    constructor(id, playersData, ioEmitter, playersPerGame) {
        this.id = id;
        this.players = playersData.map(p => ({
            id: p.id,
            isReady: false,
            board: null,
            isActive: true,
            team: p.team || null,
            allMyShipsSunk: false
        }));
        this.ioEmitter = ioEmitter;
        this.playersPerGame = playersPerGame;
        this.turnIndex = 0;
        this.turn = null;
        this.phase = 'placement';
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

    sendGameStateUpdateToAll() {
        this.players.forEach(player => {
            const myBoard = this.boards[player.id]?.toSimpleObject() || null;
            const opponentBoards = {};
            const playersInfoToSend = [];
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
}
class Game1v1 extends Game {
    constructor(id, playersData, ioEmitter) {
        super(id, playersData, ioEmitter, 2);
        this.playerOrder = this.players.map(p => p.id);
    }

    sendGameStateUpdateToAll() {
        this.players.forEach(player => {
            let myBoard = null;
            const opponentBoards = {};
            const playersInfoToSend = [];
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
        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }
        if (this.phase === 'placement') {
            if (data.type === 'PLAYER_READY') {
                const { placedPlayerShipsData } = data;
                if (this.boards[socketId] !== null) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                    return;
                }
                playerInGame.isReady = true;
                this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                const allActivePlayersPlacedShips = this.players.filter(p => p.isActive).every(p => p.isReady && this.boards[p.id] !== null);
                if (allActivePlayersPlacedShips) {
                    this.phase = 'BATALLA';
                    const eligiblePlayersForTurn = this.players.filter(p => p.isActive && !p.allMyShipsSunk).map(p => p.id);
                    if (eligiblePlayersForTurn.length > 0) {
                        this.turnIndex = Math.floor(Math.random() * eligiblePlayersForTurn.length);
                        this.turn = eligiblePlayersForTurn[this.turnIndex];
                    } else {
                        this.turn = null;
                    }
                    this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                        gameId: this.id,
                        startingPlayerId: this.turn,
                        message: '¡Batalla iniciada!'
                    });
                    this.sendGameStateUpdateToAll();
                    return;
                } else {
                    this.sendGameStateUpdateToAll();
                }
                return;
            }
        }
        if (this.phase === 'BATALLA') {
            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' } });
                return;
            }
            const attackingPlayerBoard = this.boards[socketId];
            if (attackingPlayerBoard && attackingPlayerBoard.areAllShipsSunk()) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No puedes atacar. ¡Todos tus barcos han sido hundidos!' } });
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
                    return;
                }
                const targetPlayerBoardInstance = this.boards[targetPlayerInfo.id];
                if (!targetPlayerBoardInstance || !(targetPlayerBoardInstance instanceof Tablero)) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto o no inicializado.' } });
                    return;
                }
                const attackResult = targetPlayerBoardInstance.attackCell(coordinates.row, coordinates.col);
                this.boards[targetPlayerInfo.id] = attackResult.newTablero;
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
                if (attackResult.newTablero.areAllShipsSunk()) {
                    targetPlayerInfo.allMyShipsSunk = true;
                    this.ioEmitter.toRoom(this.id).emit('playerAction', {
                        action: { type: 'PLAYER_ELIMINATED', playerId: targetPlayerInfo.id, eliminatedBy: socketId, message: `¡Todos los barcos de ${targetPlayerInfo.id.substring(0,6)}... han sido hundidos!` }
                    });
                }
                this.checkGameEndCondition();
                if (this.phase === 'FINALIZADO') {
                    this.sendGameStateUpdateToAll();
                    return;
                }
                this.advanceTurnBattle();
                this.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` } });
            }
        } else {
            this.ioEmitter.to(socketId).emit('playerAction', {
                action: {
                    type: 'ERROR',
                    message: `No se puede realizar la acción '${data.type}' en la fase actual: ${this.phase}`
                }
            });
        }
    }

    advanceTurnBattle() {
        const eligiblePlayers = this.players.filter(p => p.isActive && !p.allMyShipsSunk);
        if (eligiblePlayers.length === 0) {
            this.turn = null;
            this.checkGameEndCondition();
            return;
        }
        if (eligiblePlayers.length === 1) {
            this.turn = null;
            this.checkGameEndCondition();
            return;
        }
        let currentTurnIndex = eligiblePlayers.findIndex(p => p.id === this.turn);
        let nextIndex;
        if (currentTurnIndex === -1) {
            nextIndex = Math.floor(Math.random() * eligiblePlayers.length);
        } else {
            nextIndex = (currentTurnIndex + 1) % eligiblePlayers.length;
        }
        this.turn = eligiblePlayers[nextIndex].id;
        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
    }

    checkGameEndCondition() {
        if (this.phase === 'FINALIZADO') return;
        const activeAndAlivePlayers = this.players.filter(p => p.isActive && !p.allMyShipsSunk);
        if (activeAndAlivePlayers.length <= 1) {
            this.phase = 'FINALIZADO';
            const winnerPlayer = activeAndAlivePlayers[0] || null;
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: {
                    type: 'GAME_OVER',
                    winnerPlayerId: winnerPlayer?.id || null,
                    message: winnerPlayer ? `¡${winnerPlayer.id.substring(0,6)}... ha ganado la batalla!` : '¡La partida ha terminado sin ganador claro!'
                }
            });
        }
    }
}
class Game2v2 extends Game {
    constructor(id, playersData, ioEmitter) {
        super(id, playersData, ioEmitter, 4);
        this.playersData = playersData;
        this.boards = {};
        this.playerOrder = playersData.map(p => p.id);
        this.currentPlayerTurn = this.playerOrder[0] || null;
        this.assignInitialState();
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

    sendGameStateUpdateToAll() {
        this.players.forEach(player => {
            const myBoard = this.boards[player.id] ? this.boards[player.id].toSimpleObject() : null;
            const opponentBoards = {};
            const playersInfoToSend = [];
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
            this.players.forEach(op => {
                if (op.id !== player.id && op.isActive) {
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
                    playersInfo: playersInfoToSend,
                }
            });
        });
    }

    handlePlayerDisconnect(socketId) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (playerInGame && playerInGame.isActive) {
            playerInGame.isActive = false;
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: { type: 'PLAYER_DISCONNECTED', playerId: socketId, message: `¡${socketId.substring(0, 6)}... se ha desconectado!` }
            });
            this.checkGameEndCondition();
        }
        return super.handlePlayerDisconnect(socketId);
    }

    handleAction(socketId, data) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }
        if (this.phase === 'placement') {
            if (data.type === 'PLAYER_READY') {
                const { placedPlayerShipsData } = data;
                if (this.boards[socketId] !== null) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                    return;
                }
                playerInGame.isReady = true;
                this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                const allPlayersReady = this.players.filter(p => p.isActive).every(p => p.isReady);
                if (allPlayersReady) {
                    this.phase = 'BATALLA';
                    this.playerOrder = this.players.filter(p => p.isActive).map(p => p.id);
                    if (this.playerOrder.length > 0) {
                        this.turnIndex = Math.floor(Math.random() * this.playerOrder.length);
                        this.turn = this.playerOrder[this.turnIndex];
                    } else {
                        this.turn = null;
                    }
                    this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                        gameId: this.id,
                        startingPlayerId: this.turn,
                        message: '¡Batalla iniciada!'
                    });
                    this.sendGameStateUpdateToAll();
                    return;
                } else {
                    this.sendGameStateUpdateToAll();
                }
                return;
            }
        }
        if (this.phase === 'BATALLA') {
            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' } });
                return;
            }
            const attackingPlayerBoard = this.boards[socketId];
            if (attackingPlayerBoard && attackingPlayerBoard.areAllShipsSunk()) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No puedes atacar. ¡Todos tus barcos han sido hundidos!' } });
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
                    return;
                }
                if (attackingPlayer && targetPlayer && attackingPlayer.team && targetPlayer.team && attackingPlayer.team === targetPlayer.team) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: '¡No puedes atacar a un compañero de equipo!' } });
                    return;
                }
                const targetBoardInstance = this.boards[targetPlayerId];
                if (!targetBoardInstance || !(targetBoardInstance instanceof Tablero)) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto o no inicializado.' } });
                    return;
                }
                const attackResult = targetBoardInstance.attackCell(coordinates.row, coordinates.col);
                this.boards[targetPlayerId] = attackResult.newTablero;
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
                if (attackResult.newTablero.areAllShipsSunk()) {
                    targetPlayer.allMyShipsSunk = true;
                    this.ioEmitter.toRoom(this.id).emit('playerAction', {
                        action: { type: 'PLAYER_ELIMINATED', playerId: targetPlayerId, eliminatedBy: socketId, message: `¡Todos los barcos de ${targetPlayerId.substring(0, 6)}... han sido hundidos!` }
                    });
                }
                this.checkGameEndCondition();
                if (this.phase === 'FINALIZADO') {
                    this.sendGameStateUpdateToAll();
                    return;
                }
                this.advanceTurnBattle();
                this.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` } });
            }
        } else {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `No se puede realizar la acción '${data.type}' en la fase actual: ${this.phase}` } });
        }
    }

    advanceTurnBattle() {
        const activeAndNotSunkPlayers = this.players.filter(p => p.isActive && !p.allMyShipsSunk);
        const alivePlayerIds = activeAndNotSunkPlayers.map(p => p.id);
        if (alivePlayerIds.length <= 1) {
            this.turn = null;
            this.checkGameEndCondition();
            return;
        }
        let currentTurnIndex = alivePlayerIds.indexOf(this.turn);
        if (currentTurnIndex === -1) {
            currentTurnIndex = Math.floor(Math.random() * alivePlayerIds.length);
        }
        const nextIndex = (currentTurnIndex + 1) % alivePlayerIds.length;
        this.turn = alivePlayerIds[nextIndex];
        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
    }

    checkGameEndCondition() {
        if (this.phase === 'FINALIZADO') return;
        const activeTeams = new Set();
        this.players.filter(p => p.isActive && !p.allMyShipsSunk).forEach(p => {
            if (p.team) {
                activeTeams.add(p.team);
            }
        });
        if (activeTeams.size <= 1) {
            this.phase = 'FINALIZADO';
            const winnerTeamId = activeTeams.size === 1 ? Array.from(activeTeams)[0] : null;
            const winnerPlayer = winnerTeamId ? this.players.find(p => p.team === winnerTeamId && p.isActive && !p.allMyShipsSunk) : null;
            const winnerPlayerId = winnerPlayer?.id || null;
            const winnerMessageName = winnerPlayerId ? `El Equipo ${winnerTeamId} (representado por ${winnerPlayerId.substring(0,6)}...)` : '¡La partida ha terminado sin ganador claro!';
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: {
                    type: 'GAME_OVER',
                    winnerTeamId: winnerTeamId,
                    winnerPlayerId: winnerPlayerId,
                    message: winnerMessageName
                }
            });
        }
    }
}

export { Game, Game1v1, Game2v2 };