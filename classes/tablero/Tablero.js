import CeldaClass from './Celda.js'; 
import Pieza from '../ships/Pieza.js';

export class Tablero {
  constructor(size = 10, initialGrid = null, initialShips = null) {
    this.size = size;
        
    this.grid = initialGrid 
      ? initialGrid.map(row => row.map(cellData => CeldaClass.fromObject(cellData)))
      : Array(size).fill(null).map((_, r) => Array(size).fill(null).map((_, c) => new CeldaClass(r, c)));
    
    this.ships = initialShips 
      ? initialShips.map(s => Pieza.fromObject(s)) 
      : []; 
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
        return false; 
      }
      if (this.grid[cellPos.row][cellPos.col].isOccupied) { 
        return false; 
      }
    }
    return true;
  }

  placeShip(shipInstance, startRow, startCol, orientation, ownerId = null) {
      if (!shipInstance || !shipInstance.id) {
          console.error("Error: shipInstance debe tener un ID para ser colocado.");
          return { success: false, newTablero: this };
      }

      if (!this.canPlaceShip(shipInstance.size, startRow, startCol, orientation)) {
          return { success: false, newTablero: this }; 
      }

      if (this.ships.some(s => s.id === shipInstance.id)) {
          console.warn(`Barco con ID ${shipInstance.id} ya existe en el tablero.`);
          return { success: false, newTablero: this };
      }

      const newGrid = this.grid.map(row => 
          row.map(cell => CeldaClass.fromObject(cell.toSimpleObject()))
      );
      
      const cellsToOccupy = this.getShipCells(shipInstance.size, startRow, startCol, orientation);

      cellsToOccupy.forEach(cellPos => {
          const cellInNewGrid = newGrid[cellPos.row][cellPos.col];
          cellInNewGrid.isOccupied = true;
          cellInNewGrid.shipId = shipInstance.id;
          cellInNewGrid.shipName = shipInstance.name;
          cellInNewGrid.ownerId = ownerId; 
      });

      const updatedShipInstance = Pieza.fromObject({
          id: shipInstance.id,
          name: shipInstance.name,
          size: shipInstance.size,
          hits: shipInstance.hits,
          orientation: orientation,
          positions: cellsToOccupy,
          ownerId: ownerId 
      });

      const newShips = this.ships.map(s => Pieza.fromObject(s.toSimpleObject()));
      newShips.push(updatedShipInstance);

      const newTablero = new Tablero(this.size, newGrid, newShips);

      console.log(`Barco ${updatedShipInstance.name} (ID: ${updatedShipInstance.id}${ownerId ? `, Owner: ${ownerId}` : ''}) colocado en el tablero.`);

      return { 
          success: true, 
          newTablero: newTablero,
          placedShip: updatedShipInstance 
      };
}


  attackCell(row, col) {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
      return { status: 'invalid', message: 'Ataque fuera de límites.', newTablero: this };
    }

    const newGrid = this.grid.map(r => 
        r.map(c => CeldaClass.fromObject(c.toSimpleObject()))
    );
    
    const newCell = newGrid[row][col];
  
    if (newCell.isHit) { 
      return { status: 'already_hit', message: 'Celda ya atacada.', newTablero: this };
    }

    newCell.isHit = true;

    let attackStatus = 'miss';
    let attackMessage = '¡Agua!';
    let shipName = null;
    let sunkShip = null;

    const newShips = this.ships.map(s => Pieza.fromObject(s.toSimpleObject()));

    if (newCell.isOccupied && newCell.shipId) {
      const shipIndex = newShips.findIndex(s => s.id === newCell.shipId);
      
      if (shipIndex !== -1) {
        const updatedShip = newShips[shipIndex]; 

        updatedShip.hits += 1; 

        shipName = updatedShip.name; 

        if (updatedShip.isSunk()) {
          attackStatus = 'sunk';
          attackMessage = `¡Hundiste un ${updatedShip.name}!`;
          sunkShip = updatedShip;

          if (updatedShip.positions && updatedShip.positions.length > 0) {
            updatedShip.positions.forEach(pos => {
              if (newGrid[pos.row] && newGrid[pos.row][pos.col]) {
                const sunkCell = newGrid[pos.row][pos.col]; 
                sunkCell.isSunkShipPart = true; 
                sunkCell.isHit = true; 
              }
            });
          }  

        } else {
          attackStatus = 'hit';
          attackMessage = `¡Impacto en ${updatedShip.name}!`;
        }
      }
    }

    const finalNewTablero = new Tablero(this.size, newGrid, newShips);

    console.log(`DEBUG: [Backend Tablero.js] Celda [${row},${col}] en el finalNewTablero antes de retornar:`, finalNewTablero.grid[row][col].toSimpleObject());
    console.log(`DEBUG: [Backend Tablero.js] Objeto completo retornado de attackCell:`, { 
      status: attackStatus, 
      message: attackMessage, 
      shipName: shipName, 
      sunkShip: sunkShip, 
      newTablero: finalNewTablero.toSimpleObject() 
    });

    return { 
        status: attackStatus, 
        message: attackMessage, 
        shipName: shipName, 
        sunkShip: sunkShip, 
        newTablero: finalNewTablero 
    };
  }

  areAllShipsSunk() {
    if (this.ships.length === 0) return false;
    return this.ships.every(ship => ship instanceof Pieza && ship.isSunk());
  }

  reset() {
    return new Tablero(this.size);
  }

  toSimpleObject() {
    return {
      size: this.size,
      grid: this.grid.map(row => 
        row.map(cell => 
          cell.toSimpleObject()
        )
      ),
      ships: this.ships.map(ship => 
        ship.toSimpleObject()
      ),
    };
  }

  static fromSimpleObject(obj) {
    if (!obj || !obj.grid || !obj.ships || typeof obj.size === 'undefined') {
      console.error("Error: Objeto simple de tablero incompleto para reconstrucción.", obj);
      return new Tablero(10); 
    }
    const reconstructedGrid = obj.grid.map(row => row.map(cellData => 
      CeldaClass.fromObject(cellData)
    ));
    const reconstructedShips = obj.ships.map(shipData => {
        return Pieza.fromObject(shipData);
    });
    return new Tablero(obj.size, reconstructedGrid, reconstructedShips);
  }
}

export default Tablero;