export class GameManager {
  constructor(io) {
    this.io = io;
    this.waitingPlayers = [];
    this.activeGames = new Map(); // Map de partidaID => { players, turnoActual }
  }

  addPlayer(socket) {
    this.waitingPlayers.push(socket);

    if (this.waitingPlayers.length >= 2) {
      const [player1, player2] = this.waitingPlayers.splice(0, 2);
      const gameId = `game-${player1.id}-${player2.id}`;

      this.activeGames.set(gameId, {
        players: [player1, player2],
        turno: 0,
      });

      player1.join(gameId);
      player2.join(gameId);

      this.io.to(gameId).emit('start-game', {
        gameId,
        players: [player1.id, player2.id],
        turn: player1.id,
      });

      console.log(`Juego iniciado: ${gameId}`);
    }
  }

  removePlayer(socketId) {
    for (const [gameId, game] of this.activeGames.entries()) {
      const playerIndex = game.players.findIndex(p => p.id === socketId);
      if (playerIndex !== -1) {
        const remainingPlayer = game.players.find(p => p.id !== socketId);
        if (remainingPlayer) {
          remainingPlayer.emit('opponent-left');
        }
        this.activeGames.delete(gameId);
        break;
      }
    }

    this.waitingPlayers = this.waitingPlayers.filter(p => p.id !== socketId);
  }

  handleAction(socketId, data) {
    const game = [...this.activeGames.values()].find(g =>
      g.players.some(p => p.id === socketId)
    );

    if (!game) return;

    const currentPlayer = game.players[game.turno];
    if (currentPlayer.id !== socketId) {
      this.io.to(socketId).emit('error', { message: 'No es tu turno' });
      return;
    }

    const nextPlayer = game.players[(game.turno + 1) % 2];
    nextPlayer.emit('receive-action', data);

    game.turno = (game.turno + 1) % 2;
  }
}
