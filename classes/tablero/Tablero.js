import CeldaClass from './Celda.js';

class Tablero {
constructor(size = 10) {
    this.size = size;
    this.grid = Array(size).fill(null).map((_, r) => Array(size).fill(null).map((_, c) => new CeldaClass(r, c)));
    this.ships = []; // Almacena instancias de barcos colocados
  }

  getShipCells(shipSize, startRow, startCol, orientation) {
    const cells = [];
    for (let i = 0; i < shipSize; i++) {
      let r = startRow;
      let c = startCol;
      if (orientation === 'horizontal') {
        c += i;
      } else {
        r += i;
      }
      cells.push({ row: r, col: c });
    }
    return cells;
  }

  canPlaceShip(shipSize, startRow, startCol, orientation) {
    if (shipSize <= 0) return false;
    const potentialCells = this.getShipCells(shipSize, startRow, startCol, orientation);
    for (const cellPos of potentialCells) {
      if (cellPos.row < 0 || cellPos.row >= this.size || cellPos.col < 0 || cellPos.col >= this.size) {
        return false; // Fuera de límites
      }
      if (this.grid[cellPos.row][cellPos.col].isOccupied) {
        return false; // Celda ya ocupada
      }
    }
    return true;
  }

  placeShip(shipInstance, startRow, startCol, orientation) {
    if (!this.canPlaceShip(shipInstance.size, startRow, startCol, orientation)) {
      return false;
    }
    const cellsToOccupy = this.getShipCells(shipInstance.size, startRow, startCol, orientation);
    cellsToOccupy.forEach(cellPos => {
      this.grid[cellPos.row][cellPos.col].isOccupied = true;
      this.grid[cellPos.row][cellPos.col].shipId = shipInstance.id;
      this.grid[cellPos.row][cellPos.col].shipName = shipInstance.name;
    });
    shipInstance.positions = cellsToOccupy;
    this.ships.push(shipInstance);
    return true;
  }

  attackCell(row, col) {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
      return { status: 'invalid', message: 'Ataque fuera de límites.' };
    }
    const cell = this.grid[row][col];
    if (cell.isHit) {
      return { status: 'miss', message: 'Celda ya atacada.' };
    }
    cell.isHit = true;
    if (cell.isOccupied && cell.shipId) {
      const ship = this.ships.find(s => s.id === cell.shipId);
      if (ship) {
        ship.hits += 1;
        if (ship.isSunk()) {
          return { status: 'sunk', shipName: ship.name, message: `¡Hundiste un ${ship.name}!` };
        }
        return { status: 'hit', shipName: ship.name, message: `¡Impacto en ${ship.name}!` };
      }
    }
    return { status: 'miss', message: '¡Agua!' };
  }

  areAllShipsSunk() {
    if (this.ships.length === 0) return false;
    return this.ships.every(ship => ship.isSunk());
  }

  reset() {
    this.grid = Array(this.size).fill(null).map((_, r) => Array(size).fill(null).map((_, c) => new CeldaClass(r, c)));
    this.ships = [];
  }
}

export default Tablero;