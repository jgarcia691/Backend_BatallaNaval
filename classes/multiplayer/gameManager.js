export class GameManager {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = []; // Array de objetos socket de jugadores esperando
    this.activeGames = new Map(); // Map de partidaID => { players: [socket1, socket2], turnoActual: 0 (o ID del jugador) }
  }

  addPlayer(socket) {
    const playerId = socket.id;

    // 1. Notificar al jugador que se ha conectado exitosamente
    socket.emit('connectionSuccess', {
      playerId: playerId,
      message: '¡Bienvenido! Conectado al servidor. Buscando oponente...',
    });

    this.waitingPlayers.push(socket);

    // 2. Informar al jugador que está en la cola y actualizar el contador global de espera
    socket.emit('statusUpdate', {
      status: 'waitingInQueue',
      message: `Estás en la cola. Hay ${this.waitingPlayers.length} jugador(es) esperando en total.`,
      waitingCount: this.waitingPlayers.length,
    });

    // Emitir a todos los clientes (o a un lobby específico si lo implementas) el número actualizado de jugadores esperando.
    // Esto ayuda a que otros jugadores (quizás también esperando) vean actividad.
    this.io.emit('waitingPlayersCountUpdate', {
      count: this.waitingPlayers.length,
    });

    console.log(`Jugador ${playerId} añadido a la cola. Jugadores esperando: ${this.waitingPlayers.length}`);

    // Si hay suficientes jugadores, iniciar una partida
    if (this.waitingPlayers.length >= 2) {
      const player1Socket = this.waitingPlayers.shift(); // Saca el primero que entró
      const player2Socket = this.waitingPlayers.shift(); // Saca el segundo
      
      const gameId = `game-${player1Socket.id}-${player2Socket.id}`;

      this.activeGames.set(gameId, {
        players: [player1Socket, player2Socket], // Almacena los objetos socket completos
        turn: player1Socket.id, // El primer jugador inicia
        //###############################################
        ///IMPORTANTE: Aquí añadir más estado del juego, como el tablero, etc.
        //###############################################
      });

      // Unir ambos sockets a la sala (room) del juego
      player1Socket.join(gameId);
      player2Socket.join(gameId);

      // Notificar a los jugadores en la sala que el juego ha comenzado
      this.io.to(gameId).emit('gameStarted', {
        gameId,
        players: [
          { id: player1Socket.id, name: `Jugador 1` },
          { id: player2Socket.id, name: `Jugador 2` }
        ],
        yourPlayerId: player1Socket.id, // Para P1
        opponentPlayerId: player2Socket.id, // Para P1
        turn: player1Socket.id, // Indica de quién es el turno
      });
      // Necesitas enviar un mensaje ligeramente diferente o un identificador para P2
       this.io.to(player2Socket.id).emit('gameStarted', { // Emitir específicamente a P2 para su perspectiva
        gameId,
        players: [
          { id: player1Socket.id, name: `Jugador 1` },
          { id: player2Socket.id, name: `Jugador 2` }
        ],
        yourPlayerId: player2Socket.id, // Para P2
        opponentPlayerId: player1Socket.id, // Para P2
        turn: player1Socket.id,
      });


      console.log(`Juego iniciado: ${gameId} entre ${player1Socket.id} y ${player2Socket.id}`);
      
      // Actualizar el contador de jugadores en espera para todos después de iniciar un juego
      this.io.emit('waitingPlayersCountUpdate', {
        count: this.waitingPlayers.length,
      });
    }
  }

  removePlayer(socketId) {
    let playerWasInQueue = false;
    const initialQueueLength = this.waitingPlayers.length;

    // Eliminar de la cola de espera
    this.waitingPlayers = this.waitingPlayers.filter(socket => {
      if (socket.id === socketId) {
        playerWasInQueue = true;
        return false;
      }
      return true;
    });

    if (playerWasInQueue) {
      console.log(`Jugador ${socketId} eliminado de la cola de espera.`);
      // Si el jugador estaba en la cola y la longitud cambió, actualizar el contador
      if (this.waitingPlayers.length !== initialQueueLength) {
        this.io.emit('waitingPlayersCountUpdate', {
          count: this.waitingPlayers.length,
        });
      }
    }

    // Manejar desconexión de un juego activo
    for (const [gameId, game] of this.activeGames.entries()) {
      const playerIndex = game.players.findIndex(pSocket => pSocket.id === socketId);
      
      if (playerIndex !== -1) {
        const disconnectedPlayerSocket = game.players[playerIndex];
        console.log(`Jugador ${socketId} desconectado del juego ${gameId}.`);

        // Notificar al jugador restante
        const remainingPlayerSocket = game.players.find(pSocket => pSocket.id !== socketId);
        if (remainingPlayerSocket) {
          remainingPlayerSocket.emit('opponentLeft', {
            message: 'Tu oponente ha abandonado la partida.',
            gameId: gameId,
          });
          // Aquí podrías darle la victoria al jugador restante o terminar el juego
        }
        
        // Limpiar la sala del juego y eliminar el juego
        // Asegúrate de que los sockets abandonen la sala
        game.players.forEach(pSocket => {
            if (pSocket) pSocket.leave(gameId); // pSocket puede ser undefined si ya se desconectó
        });
        this.activeGames.delete(gameId);
        console.log(`Juego ${gameId} finalizado y eliminado debido a desconexión.`);
        break; 
      }
    }
  }

  handleAction(socketId, data) {
    let gameIdFound = null;
    let gameInstance = null;

    // Encontrar el juego al que pertenece el jugador
    for (const [gameId, game] of this.activeGames.entries()) {
      if (game.players.some(pSocket => pSocket.id === socketId)) {
        gameIdFound = gameId;
        gameInstance = game;
        break;
      }
    }

    if (!gameInstance) {
      console.log(`Acción de ${socketId} pero no se encontró juego activo.`);
      this.io.to(socketId).emit('actionError', { message: 'No estás en un juego activo.' });
      return;
    }

    const currentPlayerSocket = gameInstance.players.find(p => p.id === socketId);
    
    // Validar si es el turno del jugador
    if (gameInstance.turn !== socketId) {
      console.log(`Acción de ${socketId} pero no es su turno. Turno de: ${gameInstance.turn}`);
      this.io.to(socketId).emit('actionError', { message: 'No es tu turno.' });
      return;
    }

    // Determinar el oponente
    const opponentPlayerSocket = gameInstance.players.find(pSocket => pSocket.id !== socketId);

    if (opponentPlayerSocket) {
      // Enviar la acción al oponente
      this.io.to(opponentPlayerSocket.id).emit('actionReceived', {
        action: data, // Los datos de la acción enviados por el jugador
        sender: socketId,
      });
      console.log(`Acción de ${socketId} reenviada a ${opponentPlayerSocket.id} en juego ${gameIdFound}:`, data);

      // Cambiar el turno
      gameInstance.turn = opponentPlayerSocket.id;

      // Notificar a ambos jugadores del cambio de turno
      this.io.to(gameIdFound).emit('turnUpdate', {
        gameId: gameIdFound,
        nextTurn: gameInstance.turn,
      });

    } else {
      console.log(`Error: Oponente no encontrado para ${socketId} en juego ${gameIdFound}.`);
      this.io.to(socketId).emit('actionError', { message: 'Error al procesar la acción, oponente no encontrado.' });
    }
  }
}