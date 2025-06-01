import { Tablero } from '../tablero/Tablero.js';

class Game {
    constructor(id, playersData, ioEmitter, playersPerGame) {
        this.id = id;
        this.players = playersData.map(p => ({
            id: p.id,
            isReady: false, // Indica si ha confirmado listo en la fase actual
            board: null,
            isActive: true,
            team: p.team || null,
            allMyShipsSunk: false
        }));
        this.ioEmitter = ioEmitter;
        this.playersPerGame = playersPerGame;
        this.turnIndex = 0;
        this.turn = null;
        this.phase = 'LOBBY'; // Fase inicial de la partida
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
            // En COLOCACION, la lógica de "allPlayersReadyForPlacement" se encargará de reajustar si es necesario
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
    }

    handleAction(socketId, data) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }

        // --- Transición: LOBBY -> COLOCACION ---
        if (data.type === 'PLAYER_JOIN_READY') {
            if (this.phase !== 'LOBBY') {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `La partida ya no está en fase de lobby. Fase actual: ${this.phase}` } });
                return;
            }
            playerInGame.isReady = true; // Marcar al jugador como listo en el lobby
            console.log(`> Jugador ${socketId.substring(0,6)}... marcado como listo en lobby de ${this.id.substring(0,6)}.`);

            const allPlayersInLobbyReady = this.players.filter(p => p.isActive).every(p => p.isReady);
            if (allPlayersInLobbyReady && this.players.filter(p => p.isActive).length === this.playersPerGame) {
                console.log(`>> Todos los jugadores en lobby de ${this.id.substring(0,6)}... listos. Transicionando a fase de COLOCACION.`);
                this.phase = 'COLOCACION'; // ¡CAMBIO DE FASE CLAVE!
                // Al pasar a colocación, los jugadores aún no han colocado barcos,
                // así que su estado 'isReady' debe reiniciarse para esta nueva fase.
                this.players.forEach(p => p.isReady = false); 

                this.playerOrder = this.players.filter(p => p.isActive).map(p => p.id); // Definir el orden aquí
                this.turnIndex = Math.floor(Math.random() * this.playerOrder.length); // Elegir un turno inicial para la colocación
                this.turn = this.playerOrder[this.turnIndex];

                this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                    gameId: this.id,
                    startingPlayerId: this.turn,
                    message: '¡Partida encontrada! ¡Coloca tus barcos!'
                });
            } else {
                 // Si no están todos listos, se le da un feedback al jugador
                 this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'waitingPlayersUpdate', message: `Esperando al otro jugador para iniciar la colocación...` } });
            }
            this.sendGameStateUpdateToAll();
            return;
        }


        // --- Transición: COLOCACION -> BATALLA ---
        if (this.phase === 'COLOCACION' && data.type === 'PLAYER_READY') {
            if (this.turn !== socketId) { // Es el turno de este jugador para colocar
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno para colocar barcos.' } });
                return;
            }

            const { placedPlayerShipsData } = data;
            if (this.boards[socketId] !== null) { // Evitar que envíe los barcos dos veces
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Ya has colocado tus barcos.' } });
                return;
            }
            
            playerInGame.isReady = true; // Marcar que este jugador ya colocó sus barcos
            this.boards[socketId] = Tablero.fromSimpleObject(placedPlayerShipsData);
            console.log(`> Jugador ${socketId.substring(0,6)}... ha colocado sus barcos en ${this.id.substring(0,6)}.`);

            const allActivePlayersPlacedShips = this.players.filter(p => p.isActive).every(p => p.isReady && this.boards[p.id] !== null);

            if (allActivePlayersPlacedShips) {
                console.log(`>> Todos los jugadores activos en ${this.id.substring(0,6)}... han colocado barcos. Transicionando a fase de BATALLA.`);
                this.phase = 'BATALLA'; // ¡CAMBIO DE FASE CLAVE!
                this.turnIndex = Math.floor(Math.random() * this.playerOrder.length); // Elige quién inicia la batalla
                this.turn = this.playerOrder[this.turnIndex];

                this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                    gameId: this.id,
                    startingPlayerId: this.turn,
                    message: '¡Batalla iniciada!'
                });
            } else {
                // Si no todos han colocado barcos, se avanza el turno para el siguiente jugador que debe colocar
                this.advanceTurnPlacement(); // Un método específico para avanzar turno en colocación
            }
            this.sendGameStateUpdateToAll();
            return;
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
                        newTableroTarget: attackResult.newTablero.toSimpleObject(true) // Enviar el tablero del oponente actualizado (oculto)
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
                        newTableroPlayer: this.boards[targetPlayerInfo.id].toSimpleObject() // Enviar el tablero del jugador actualizado (visible)
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

                this.advanceTurnBattle(); // Método específico para avanzar turno en batalla
                this.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` } });
            }
        } else {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `No se puede realizar la acción '${data.type}' en la fase actual: ${this.phase}` } });
        }
    }

    // Método para avanzar turno durante la COLOCACION (entre jugadores que aún no han colocado barcos)
    advanceTurnPlacement() {
        const playersToPlace = this.players.filter(p => p.isActive && !p.isReady);
        if (playersToPlace.length === 0) {
            // Todos han colocado, esto no debería llamarse si la fase ya cambió a BATALLA
            this.turn = null; 
            return;
        }

        let currentIndex = playersToPlace.findIndex(p => p.id === this.turn);
        if (currentIndex === -1) { // El jugador actual ya colocó o se desconectó
            currentIndex = -1; // Buscar desde el inicio
        }

        let nextIndex = (currentIndex + 1) % playersToPlace.length;
        let nextPlayerId = playersToPlace[nextIndex].id;
        this.turn = nextPlayerId;

        console.log(`> Turno de colocación avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);
        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `Turno de ${this.turn.substring(0,6)}... para colocar barcos.` }
        });
    }

    // Método para avanzar turno durante la BATALLA (entre jugadores vivos)
    advanceTurnBattle() {
        const eligiblePlayers = this.playerOrder.filter(pId => {
            const p = this.players.find(player => player.id === pId);
            return p.isActive && !p.allMyShipsSunk;
        });

        if (eligiblePlayers.length === 0) {
            this.turn = null;
            this.checkGameEndCondition();
            return;
        }

        let currentTurnIndex = eligiblePlayers.indexOf(this.turn);
        // Si el jugador actual no está en la lista de elegibles (ej. fue hundido),
        // buscamos el siguiente desde el inicio de la lista.
        if (currentTurnIndex === -1) {
            currentTurnIndex = -1; 
        }

        let nextIndex = (currentTurnIndex + 1) % eligiblePlayers.length;
        let nextPlayerId = eligiblePlayers[nextIndex];
        let attempts = 0;

        while (attempts < eligiblePlayers.length &&
               (!eligiblePlayers.includes(nextPlayerId) ||
               !this.players.find(p => p.id === nextPlayerId).isActive ||
               this.players.find(p => p.id === nextPlayerId).allMyShipsSunk)
        ) {
            nextIndex = (nextIndex + 1) % eligiblePlayers.length;
            nextPlayerId = eligiblePlayers[nextIndex];
            attempts++;
        }

        if (attempts >= eligiblePlayers.length) { // No se encontró un jugador válido
            this.turn = null;
            this.checkGameEndCondition();
            return;
        }

        this.turn = nextPlayerId;
        console.log(`> Turno de batalla avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);

        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
    }

    advanceTurn() { // Redefinir para que llame al correcto según la fase
        if (this.phase === 'COLOCACION') {
            this.advanceTurnPlacement();
        } else if (this.phase === 'BATALLA') {
            this.advanceTurnBattle();
        }
        // En LOBBY y FINALIZADO no hay turnos que avanzar automáticamente así.
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
        this.teams = {
            A: { players: [], activePlayers: [], boardReady: false, allShipsSunk: false, id: 'A' },
            B: { players: [], activePlayers: [], boardReady: false, allShipsSunk: false, id: 'B' }
        };
        this.assignTeams(playersData);
        this.boards[this.teams.A.id] = null;
        this.boards[this.teams.B.id] = null;
        console.log(`Juego 2vs2 ${id.substring(0,6)}... inicializado. Fase: ${this.phase}`);

        // Asegurarse de que el `playerOrder` se inicialice correctamente con todos los jugadores
        this.playerOrder = playersData.map(p => p.id);
    }

    assignTeams(playersData) {
        playersData.sort(() => Math.random() - 0.5); // Mezclar jugadores
        this.teams.A.players = [playersData[0].id, playersData[1].id];
        this.teams.B.players = [playersData[2].id, playersData[3].id];

        this.teams.A.activePlayers = [...this.teams.A.players];
        this.teams.B.activePlayers = [...this.teams.B.players];

        this.players.forEach(p => {
            if (this.teams.A.players.includes(p.id)) {
                p.team = 'A';
            } else if (this.teams.B.players.includes(p.id)) {
                p.team = 'B';
            }
        });

        console.log(`Equipo A: ${this.teams.A.players.map(id => id.substring(0,6) + '...')}, Equipo B: ${this.teams.B.players.map(id => id.substring(0,6) + '...')}`);
    }

    handlePlayerDisconnect(socketId) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (playerInGame && playerInGame.team) {
            const team = this.teams[playerInGame.team];
            team.activePlayers = team.activePlayers.filter(pId => pId !== socketId);
            if (team.activePlayers.length === 0) {
                team.allShipsSunk = true;
                console.log(`Equipo ${playerInGame.team} pierde en juego ${this.id.substring(0,6)}... por desconexión de todos sus jugadores activos.`);
                this.ioEmitter.toRoom(this.id).emit('playerAction', {
                    action: { type: 'TEAM_ELIMINATED_DISCONNECT', team: playerInGame.team, message: `¡El Equipo ${playerInGame.team} ha perdido porque todos sus jugadores se desconectaron!` }
                });
            }
        }
        // Llamar al método base de Game para manejar el estado del jugador y notificar
        return super.handlePlayerDisconnect(socketId);
    }

    handleAction(socketId, data) {
        const playerInGame = this.players.find(p => p.id === socketId);
        if (!playerInGame || !playerInGame.isActive) {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No estás en un juego activo.' } });
            return;
        }

        // --- Transición: LOBBY -> COLOCACION ---
        if (this.phase === 'LOBBY') {
            if (data.type === 'PLAYER_JOIN_READY') {
                playerInGame.isReady = true; // Marcar al jugador como listo en el lobby
                console.log(`> Jugador ${socketId.substring(0,6)}... listo en lobby de ${this.id.substring(0,6)}.`);

                const activePlayersCount = this.players.filter(p => p.isActive).length;
                const allPlayersInLobbyReady = activePlayersCount === this.playersPerGame && this.players.filter(p => p.isActive).every(p => p.isReady);

                if (allPlayersInLobbyReady) {
                    console.log(`>> Todos los 4 jugadores activos en ${this.id.substring(0,6)}... listos. Transicionando a fase de COLOCACION.`);
                    this.phase = 'COLOCACION'; // ¡CAMBIO DE FASE CLAVE!
                    this.players.forEach(p => p.isReady = false); // Resetear 'isReady' para la fase de colocación

                    this.turnIndex = Math.floor(Math.random() * this.playerOrder.length); // Elegir un turno inicial aleatorio para la colocación
                    this.turn = this.playerOrder[this.turnIndex];

                    this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                        gameId: this.id,
                        startingPlayerId: this.turn,
                        message: '¡Partida encontrada! ¡Coloca tus barcos!'
                    });
                    this.sendGameStateUpdateToAll();
                } else {
                    this.ioEmitter.to(socketId).emit('playerAction', {
                        action: { type: 'waitingPlayersUpdate', message: `Esperando a los demás jugadores en el lobby (${activePlayersCount}/${this.playersPerGame})...` }
                    });
                    this.sendGameStateUpdateToAll(); // Actualizar el estado de readiness de los jugadores en el lobby
                }
                return;
            }
        }

        // --- Transición: COLOCACION -> BATALLA ---
        if (this.phase === 'COLOCACION') {
            if (this.turn !== socketId) {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'No es tu turno para colocar barcos.' } });
                return;
            }

            if (data.type === 'PLAYER_READY') { // Esta acción ahora significa "equipo ha colocado barcos"
                const { placedPlayerShipsData } = data;
                const teamId = playerInGame.team;
                const team = this.teams[teamId];

                if (team.boardReady) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Tu equipo ya ha colocado los barcos.' } });
                    return;
                }

                this.boards[teamId] = Tablero.fromSimpleObject(placedPlayerShipsData);
                team.boardReady = true; // Marca que el tablero del equipo está listo
                playerInGame.isReady = true; // Marca al jugador individual como listo (ha completado su tarea de colocación)

                console.log(`> Jugador ${socketId.substring(0,6)}... de equipo ${teamId} ha colocado los barcos.`);
                this.ioEmitter.toRoom(this.id).emit('playerAction', {
                    action: { type: 'TEAM_BOARD_PLACED', teamId: teamId, message: `¡El Equipo ${teamId} ha colocado sus barcos!` }
                });

                const allTeamsReadyForBattle = Object.values(this.teams).every(t => t.boardReady);

                if (allTeamsReadyForBattle) {
                    console.log(`>> Todos los equipos en ${this.id.substring(0,6)}... han colocado barcos. Transicionando a fase de BATALLA.`);
                    this.phase = 'BATALLA'; // ¡CAMBIO DE FASE CLAVE!
                    this.playerOrder = this.players.filter(p => p.isActive).map(p => p.id); // Re-establecer el orden para la batalla
                    this.turnIndex = Math.floor(Math.random() * this.playerOrder.length);
                    this.turn = this.playerOrder[this.turnIndex];

                    this.ioEmitter.toRoom(this.id).emit('gameStarted', {
                        gameId: this.id,
                        startingPlayerId: this.turn,
                        message: '¡Batalla iniciada!'
                    });
                } else {
                    this.advanceTurnPlacement(); // Avanza el turno al siguiente jugador para colocar
                }
                this.sendGameStateUpdateToAll();
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
                const { targetPlayerId, coordinates } = data; // En 2vs2 se ataca a un jugador específico de un equipo rival
                const playerTeam = playerInGame.team;

                const targetPlayerInfo = this.players.find(p => p.id === targetPlayerId && p.isActive);
                if (!targetPlayerInfo || targetPlayerInfo.id === socketId || targetPlayerInfo.team === playerTeam) {
                     this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Objetivo de ataque inválido (no puedes atacarte a ti mismo o a tu equipo).' } });
                     return;
                }
                const targetTeamId = targetPlayerInfo.team;

                const targetTeam = this.teams[targetTeamId];
                if (!targetTeam || targetTeam.allShipsSunk) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Objetivo inválido o equipo ya eliminado.' } });
                    return;
                }

                const targetBoardInstance = this.boards[targetTeamId]; // Se ataca el tablero del equipo
                if (!targetBoardInstance || !(targetBoardInstance instanceof Tablero)) {
                    this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: 'Error interno del servidor: Tablero oponente corrupto o no inicializado.' } });
                    return;
                }

                const attackResult = targetBoardInstance.attackCell(coordinates.row, coordinates.col);
                this.boards[targetTeamId] = attackResult.newTablero;

                console.log(`> ${socketId.substring(0,6)}... (Team ${playerTeam}) ataca [${coordinates.row},${coordinates.col}] en el tablero del equipo ${targetTeamId}. Resultado: ${attackResult.message}`);

                // Notificar al atacante y a su compañero de equipo
                this.ioEmitter.to(socketId).emit('playerAction', {
                    action: {
                        type: 'ATTACK_RESULT',
                        targetPlayerId: targetPlayerInfo.id, // Enviar el ID del jugador atacado para el frontend
                        coordinates,
                        status: attackResult.status,
                        message: attackResult.message,
                        sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                        newTableroTarget: attackResult.newTablero.toSimpleObject(true) // Enviar el tablero del equipo oponente actualizado (oculto)
                    }
                });
                // Notificar al compañero de equipo del atacante para que vea el resultado
                const allyPlayer = this.players.find(p => p.team === playerTeam && p.id !== socketId && p.isActive);
                if (allyPlayer) {
                    this.ioEmitter.to(allyPlayer.id).emit('playerAction', {
                        action: {
                            type: 'ALLY_ATTACK_RESULT',
                            attackingPlayerId: socketId,
                            targetPlayerId: targetPlayerInfo.id, // Enviar el ID del jugador atacado
                            coordinates,
                            status: attackResult.status,
                            message: attackResult.message,
                            sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                            newTableroTarget: attackResult.newTablero.toSimpleObject(true)
                        }
                    });
                }

                // Notificar al equipo defensor (ambos jugadores)
                this.teams[targetTeamId].players.forEach(pId => {
                    const defendingPlayer = this.players.find(p => p.id === pId && p.isActive);
                    if (defendingPlayer) {
                        this.ioEmitter.to(defendingPlayer.id).emit('playerAction', {
                            action: {
                                type: 'ATTACK_RECEIVED',
                                attackingPlayerId: socketId,
                                coordinates,
                                status: attackResult.status,
                                message: attackResult.message,
                                sunkShip: attackResult.sunkShip ? attackResult.sunkShip.toSimpleObject() : null,
                                newTableroPlayer: this.boards[targetTeamId].toSimpleObject() // Enviar el tablero del equipo actualizado (visible para el equipo)
                            }
                        });
                    }
                });

                if (attackResult.newTablero.areAllShipsSunk()) {
                    console.log(`¡Todos los barcos del Equipo ${targetTeamId} han sido hundidos por ${socketId.substring(0,6)}...!`);
                    targetTeam.allShipsSunk = true;

                    this.ioEmitter.toRoom(this.id).emit('playerAction', {
                        action: { type: 'TEAM_ELIMINATED', team: targetTeamId, message: `¡El Equipo ${targetTeamId} ha perdido todos sus barcos!` }
                    });
                }

                this.checkGameEndCondition();
                if (this.phase === 'FINALIZADO') {
                    this.sendGameStateUpdateToAll();
                    return;
                }

                this.advanceTurnBattle(); // Avanza el turno de batalla
                this.sendGameStateUpdateToAll();
            } else {
                this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `Acción no reconocida: ${data.type}` } });
            }
        } else {
            this.ioEmitter.to(socketId).emit('playerAction', { action: { type: 'ERROR', message: `No se puede realizar la acción '${data.type}' en la fase actual: ${this.phase}` } });
        }
    }

    // Método para avanzar turno durante la COLOCACION (entre jugadores que aún no han colocado barcos de su equipo)
    advanceTurnPlacement() {
        const playersToPlace = this.players.filter(p => p.isActive && !this.teams[p.team].boardReady);
        if (playersToPlace.length === 0) {
            this.turn = null; 
            return;
        }

        let currentIndex = playersToPlace.findIndex(p => p.id === this.turn);
        if (currentIndex === -1) { 
            currentIndex = -1; 
        }

        let nextIndex = (currentIndex + 1) % playersToPlace.length;
        let nextPlayerId = playersToPlace[nextIndex].id;
        this.turn = nextPlayerId;

        console.log(`> Turno de colocación avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);
        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `Turno de ${this.turn.substring(0,6)}... para colocar barcos.` }
        });
    }

    // Método para avanzar turno durante la BATALLA (entre jugadores vivos)
    advanceTurnBattle() {
        const eligiblePlayers = this.playerOrder.filter(pId => {
            const p = this.players.find(player => player.id === pId);
            return p.isActive && !this.teams[p.team].allShipsSunk;
        });

        if (eligiblePlayers.length === 0) {
            this.turn = null;
            this.checkGameEndCondition();
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
               (!eligiblePlayers.includes(nextPlayerId) ||
               !this.players.find(p => p.id === nextPlayerId).isActive ||
               this.teams[this.players.find(p => p.id === nextPlayerId).team].allShipsSunk)
        ) {
            nextIndex = (nextIndex + 1) % eligiblePlayers.length;
            nextPlayerId = eligiblePlayers[nextIndex];
            attempts++;
        }

        if (attempts >= eligiblePlayers.length) {
            this.turn = null;
            this.checkGameEndCondition();
            return;
        }

        this.turn = nextPlayerId;
        console.log(`> Turno de batalla avanzado a: ${this.turn.substring(0,6)}... en juego ${this.id.substring(0,6)}.`);

        this.ioEmitter.toRoom(this.id).emit('playerAction', {
            action: { type: 'TURN_CHANGE', nextPlayerId: this.turn, message: `¡Es tu turno!` }
        });
    }

    advanceTurn() { // Redefinir para que llame al correcto según la fase
        if (this.phase === 'COLOCACION') {
            this.advanceTurnPlacement();
        } else if (this.phase === 'BATALLA') {
            this.advanceTurnBattle();
        }
    }

    checkGameEndCondition() {
        if (this.phase === 'FINALIZADO') return;

        const activeTeams = Object.values(this.teams).filter(team => !team.allShipsSunk && team.activePlayers.length > 0);

        if (activeTeams.length <= 1) {
            this.phase = 'FINALIZADO';
            const winnerTeam = activeTeams[0] || null;
            console.log(`### Juego 2vs2 ${this.id.substring(0,6)}... FINALIZADO.`);
            this.ioEmitter.toRoom(this.id).emit('playerAction', {
                action: {
                    type: 'GAME_OVER',
                    winnerTeamId: winnerTeam?.id || null,
                    message: winnerTeam ? `¡El Equipo ${winnerTeam.id} ha ganado la batalla!` : '¡La partida ha terminado sin ganador claro!'
                }
            });
        }
    }
}

export { Game, Game1v1, Game2v2 };