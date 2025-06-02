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
        this.phase = 'placement'; // Fase inicial ahora es placement
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

            // Si el jugador desconectado era el del turno, avanzar solo si el juego ya está en BATALLA
            // En placement, la lógica de "allPlayersReadyForPlacement" se encargará de reajustar si es necesario
            if (this.turn === socketId && this.phase === 'BATALLA') {
                this.advanceTurn();
            }
            this.sendGameStateUpdateToAll();
        }
        return false;
    }

    sendGameStateUpdateToAll() {
        this.players.filter(p => p.isActive).forEach(player => {
            let myBoard = null;
            let opponentBoard = null;
            let allyBoard = null;
            let secondOpponentBoard = null;
            let rival1Id = null;
            let rival2Id = null;
            let allyId = null;


            if (this.playersPerGame === 2) {
                myBoard = this.boards[player.id]?.toSimpleObject() || null;
                const opponentPlayer = this.players.find(p => p.id !== player.id && p.isActive);
                if (opponentPlayer) {
                    opponentBoard = this.boards[opponentPlayer.id]?.toSimpleObject(true) || null; // Ocultar barcos del oponente
                    rival1Id = opponentPlayer.id; // Asignar el ID del rival para 1v1
                }
            } else if (this.playersPerGame === 4) { // Lógica para 2vs2 (tablero por equipo)
                const currentPlayerTeamId = player.team;
                // El tablero propio en 2vs2 es el tablero del equipo del jugador, que se muestra a sí mismo
                myBoard = this.boards[currentPlayerTeamId]?.toSimpleObject(false) || null;

                const opponentTeamId = currentPlayerTeamId === 'A' ? 'B' : 'A';
                if (this.boards[opponentTeamId]) {
                    opponentBoard = this.boards[opponentTeamId].toSimpleObject(true); // Siempre ocultar barcos del oponente

                }

                // Para 2vs2, necesitamos enviar los IDs de los rivales y aliados específicos
                const teamA = this.teams ? this.teams['A'] : null;
                const teamB = this.teams ? this.teams['B'] : null;

                if (teamA && teamB) {
                    if (currentPlayerTeamId === 'A') {
                        rival1Id = teamB.players ? teamB.players[0] : null;
                        rival2Id = teamB.players ? teamB.players[1] : null;
                        allyId = teamA.players ? teamA.players.find(id => id !== player.id) : null;
                    } else if (currentPlayerTeamId === 'B') { // Team B
                        rival1Id = teamA.players ? teamA.players[0] : null;
                        rival2Id = teamA.players ? teamA.players[1] : null;
                        allyId = teamB.players ? teamB.players.find(id => id !== player.id) : null;
                    }
                }
            }

            this.ioEmitter.to(player.id).emit('playerAction', {
                action: {
                    type: 'GAME_STATE_UPDATE',
                    myBoard: myBoard,
                    opponentBoard: opponentBoard,
                    allyBoard: allyBoard, // Podría ser el tablero del compañero en 2vs2 si se muestra individualmente
                    secondOpponentBoard: secondOpponentBoard, // Podría ser el segundo oponente en 2vs2 si se muestra individualmente
                    playersInfo: this.players.filter(p => p.isActive).map(p => ({ id: p.id, teamId: p.team, isReady: p.isReady, allMyShipsSunk: p.allMyShipsSunk })),
                    message: this.phase === 'BATALLA' ? '¡Batalla en curso!' : `Fase actual: ${this.phase}`,
                    currentPlayerTurn: this.turn,
                    gamePhase: this.phase, // ¡IMPORTANTE! Envía la fase actual
                    rival1Id: rival1Id, // Para que el frontend sepa quién es el rival 1
                    rival2Id: rival2Id, // Para que el frontend sepa quién es el rival 2 (en 2vs2)
                    allyId: allyId // Para que el frontend sepa quién es el aliado (en 2vs2)
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

    handleAction(socketId, data) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }

        // --- Transición de placement a BATALLA ---
        if (this.phase === 'placement') {
            if (data.type === 'PLAYER_READY') {
                const { placedPlayerShipsData } = data;
                if (this.boards[socketId] !== null) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                    return;
                }

                playerInGame.isReady = true;
                this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                console.log(`> Jugador ${socketId.substring(0,6)}... ha colocado sus barcos en ${this.id.substring(0,6)}.`);

                const allActivePlayersPlacedShips = this.players.filter(p => p.isActive).every(p => p.isReady && this.boards[p.id] !== null);

                if (allActivePlayersPlacedShips) {
                    console.log(`>> Todos los jugadores activos en ${this.id.substring(0,6)}... han colocado barcos. Transicionando a fase de BATALLA.`);
                    this.phase = 'BATALLA';

                    if (this.playerOrder.length > 0) {
                        this.turnIndex = Math.floor(Math.random() * this.playerOrder.length);
                        this.turn = this.playerOrder[this.turnIndex];
                        console.log(`>> Primer turno de batalla asignado a: ${this.turn.substring(0,6)}...`);
                    } else {
                        this.turn = null;
                        console.error(`ERROR: No hay jugadores activos en playerOrder para asignar el primer turno de batalla en ${this.id.substring(0,6)}...`);
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

        // << LÓGICA DE BATALLA PARA 1V1 >>
        if (this.phase === 'BATALLA') {
            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' } });
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
                    console.log(`Jugador ${targetPlayerInfo.id.substring(0,6)}... ha sido hundido por ${socketId.substring(0,6)}.`);
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
        const eligiblePlayers = this.playerOrder.filter(pId => {
            const p = this.players.find(player => player.id === pId);
            return p && p.isActive && !p.allMyShipsSunk;
        });

        if (eligiblePlayers.length === 0) {
            this.turn = null;
            this.checkGameEndCondition();
            console.log(`### checkGameEndCondition 1vs1 - Phase: ${this.phase}, Active Alive Players: ${this.players.filter(p => p.isActive && !p.allMyShipsSunk).length}`);
            return;
        }

        let currentTurnIndex = eligiblePlayers.indexOf(this.turn);
        if (currentTurnIndex === -1) {
            currentTurnIndex = -1;
        }

        let nextIndex = (currentTurnIndex + 1) % eligiblePlayers.length;
        let nextPlayerId = eligiblePlayers[nextIndex];
        let attempts = 0;

        while (attempts < eligiblePlayers.length &&
               (
                !eligiblePlayers.includes(nextPlayerId) ||
                !this.players.find(p => p.id === nextPlayerId)?.isActive ||
                this.players.find(p => p.id === nextPlayerId)?.allMyShipsSunk
               )
        ) {
            nextIndex = (nextIndex + 1) % eligiblePlayers.length;
            nextPlayerId = eligiblePlayers[nextIndex];
            attempts++;
        }

        if (attempts >= eligiblePlayers.length) {
            this.turn = null;
            this.checkGameEndCondition();
            console.log(`> No se encontró un siguiente jugador válido para la batalla en ${this.id.substring(0,6)}...`);
            return;
        }

        this.turn = nextPlayerId;
        console.log(`> Turno de batalla avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);

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
            console.log(`### Juego 1vs1 ${this.id.substring(0,6)}... FINALIZADO.`);
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
        this.playersData = playersData; // Store initial players data for easy access
        this.boards = {}; // Tableros individuales para cada jugador
        this.playerOrder = playersData.map(p => p.id);
        this.currentPlayerTurn = this.playerOrder[0] || null; // Inicializar el turno al primer jugador
        this.eliminatedPlayers = {}; // Para rastrear jugadores eliminados
        this.assignInitialState();
        this.teams = this.assignTeams(playersData);
        console.log(`Juego 2vs2 ${id.substring(0, 6)}... inicializado con equipos. Fase: ${this.phase}`);
        this.sendGameStateUpdateToAll();
    }

    assignTeams(playersData) {
        const teamA = { id: 'A', players: [playersData[0].id, playersData[1].id] };
        const teamB = { id: 'B', players: [playersData[2].id, playersData[3].id] };
        this.players[0].team = 'A';
        this.players[1].team = 'A';
        this.players[2].team = 'B';
        this.players[3].team = 'B';
        return { 'A': teamA, 'B': teamB };
    }

    assignInitialState() {
        this.players.forEach(player => {
            player.isReady = false;
            player.allMyShipsSunk = false;
            this.boards[player.id] = null; // Inicializar tablero como nulo, se actualizará al colocar barcos
        });
    }

    advanceTurn() {
        this.advanceTurnBattle();
    }

    sendGameStateUpdateToAll() {
        this.players.forEach(player => {
            const myBoard = this.boards[player.id] ? this.boards[player.id].toSimpleObject() : null;
            const opponentBoards = {};
            let rival1Id = null;
            let rival2Id = null;
            let allyId = null;

            const currentPlayerTeamId = player.team;
            const opponentTeamId = currentPlayerTeamId === 'A' ? 'B' : 'A';

            const teamA = this.teams['A'];
            const teamB = this.teams['B'];

            if (teamA && teamB) {
                if (currentPlayerTeamId === 'A') {
                    rival1Id = teamB.players[0];
                    rival2Id = teamB.players[1];
                    allyId = teamA.players.find(id => id !== player.id);
                } else { // Team B
                    rival1Id = teamA.players[0];
                    rival2Id = teamA.players[1];
                    allyId = teamB.players.find(id => id !== player.id);
                }
            }

            const opponentTeam = this.players.filter(p => p.team === opponentTeamId && p.isActive);
            opponentTeam.forEach(opponent => {
                opponentBoards[opponent.id] = this.boards[opponent.id] ? this.boards[opponent.id].toSimpleObject(true) : null;
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
                    playersInfo: this.players.map(p => ({ id: p.id, isActive: p.isActive, isReady: p.isReady, allMyShipsSunk: p.allMyShipsSunk, teamId: p.team })),
                    rival1Id: rival1Id,
                    rival2Id: rival2Id,
                    allyId: allyId
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

        // --- Transición: placement -> BATALLA ---
        if (this.phase === 'placement') {
            if (data.type === 'PLAYER_READY') {
                const { placedPlayerShipsData } = data;

                if (this.boards[socketId] !== null) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                    return;
                }

                playerInGame.isReady = true;
                this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                console.log(`> Jugador ${socketId.substring(0, 6)}... ha colocado sus barcos en juego ${this.id.substring(0, 6)}.`);

                const allPlayersReady = this.players.filter(p => p.isActive).every(p => p.isReady);

                if (allPlayersReady) {
                    console.log(`>> Todos los jugadores en ${this.id.substring(0, 6)}... han colocado barcos. Transicionando a fase de BATALLA.`);
                    this.phase = 'BATALLA';
                    this.playerOrder = this.players.map(p => p.id);
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
                    this.sendGameStateUpdateToAll();
                }
                return;
            }
        }

        // --- Manejo de la fase BATALLA ---
        if (this.phase === 'BATALLA') {
            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno.' } });
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

                const targetBoardInstance = this.boards[targetPlayerId];
                if (!targetBoardInstance || !(targetBoardInstance instanceof Tablero)) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto o no inicializado.' } });
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
                    console.log(`Jugador ${targetPlayerId.substring(0, 6)}... ha perdido todos sus barcos.`);
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
            currentTurnIndex = -1;
        }

        let nextIndex = (currentTurnIndex + 1) % alivePlayerIds.length;
        this.turn = alivePlayerIds[nextIndex];

        console.log(`> Turno de batalla avanzado a: ${this.turn.substring(0, 6)}... en juego ${this.id.substring(0, 6)}.`);

        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
    }

    checkGameEndCondition() {
        if (this.phase === 'FINALIZADO') return;

        const activePlayersAlive = this.players.filter(p => p.isActive && !p.allMyShipsSunk).length;
        const teamsAlive = {};
        this.players.filter(p => p.isActive && !p.allMyShipsSunk).forEach(p => {
            teamsAlive[p.team] = true;
        });

        if (Object.keys(teamsAlive).length <= 1) {
            this.phase = 'FINALIZADO';
            const winningTeamId = Object.keys(teamsAlive)[0] || null;
            const winnerTeamPlayers = this.players.filter(p => p.team === winningTeamId && p.isActive);
            const winnerNames = winnerTeamPlayers.map(p => p.id.substring(0, 6)).join(' y ') + (winnerTeamPlayers.length > 1 ? ' han' : ' ha');
            const message = winningTeamId ? `¡El equipo ${winningTeamId} (${winnerNames}... ganado la batalla!` : '¡La partida ha terminado sin ganador claro!';

            console.log(`### Juego 2vs2 ${this.id.substring(0, 6)}... FINALIZADO. Ganador: Equipo ${winningTeamId || 'Nadie'}`);
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: {
                    type: 'GAME_OVER',
                    winnerTeamId: winningTeamId,
                    message: message
                }
            });
        }
    }
}

export { Game1v1, Game2v2, Game};