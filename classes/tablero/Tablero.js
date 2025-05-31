// Tablero.js (Backend)

import CeldaClass from './Celda.js'; // Asegúrate de que esta ruta sea correcta para el backend
import Pieza from './Pieza.js';     // Asumo que Pieza es tu clase Barco y su ruta es correcta

class Tablero {
  constructor(size = 10, initialGrid = null, initialShips = null) {
    this.size = size;
        
    // --- CORRECCIÓN CRÍTICA: Inmutabilidad al construir el grid ---
    // Si se proporciona un initialGrid, ASUME que contiene objetos planos de celdas
    // (resultado de toSimpleObject) y los reconstruye como instancias de CeldaClass.
    this.grid = initialGrid 
      ? initialGrid.map(row => row.map(cellData => CeldaClass.fromObject(cellData)))
      : Array(size).fill(null).map((_, r) => Array(size).fill(null).map((_, c) => new CeldaClass(r, c)));
    
    // --- CORRECCIÓN CRÍTICA: Inmutabilidad al construir los ships ---
    // Siempre reconstruye instancias de Pieza a partir de los datos iniciales,
    // o inicializa un array vacío si no hay barcos.
    this.ships = initialShips 
      ? initialShips.map(s => Pieza.fromObject(s)) // Usa un método fromObject en Pieza
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
      cells.push({ row: r, col: c }); // Devuelve objetos planos con row/col
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
      // Accede a la instancia de CeldaClass en la cuadrícula para verificar 'isOccupied'
      if (this.grid[cellPos.row][cellPos.col].isOccupied) { 
        return false; // Celda ya ocupada por otro barco
      }
    }
    return true;
  }

  placeShip(shipInstance, startRow, startCol, orientation) {
    // Verificar si la instancia del barco tiene el ID para referencia
    if (!shipInstance || !shipInstance.id) {
      console.error("Error: shipInstance debe tener un ID para ser colocado.");
      return { success: false, newTablero: this };
    }

    if (!this.canPlaceShip(shipInstance.size, startRow, startCol, orientation)) {
      return { success: false, newTablero: this }; 
    }

    // --- CRÍTICO: COPIA PROFUNDA para inmutabilidad del grid ---
    // Crea una nueva cuadrícula donde se aplicarán los cambios.
    const newGrid = this.grid.map(row => 
        row.map(cell => CeldaClass.fromObject(cell.toSimpleObject())) // Copia cada celda creando una nueva instancia
    );
    
    const cellsToOccupy = this.getShipCells(shipInstance.size, startRow, startCol, orientation);

    cellsToOccupy.forEach(cellPos => {
      // Modifica la celda CORRESPONDIENTE en la *nueva* cuadrícula.
      const cellInNewGrid = newGrid[cellPos.row][cellPos.col];
      cellInNewGrid.isOccupied = true;
      cellInNewGrid.shipId = shipInstance.id; 
      cellInNewGrid.shipName = shipInstance.name; 
    });

    // Actualiza la instancia del barco con sus posiciones REALES en el tablero.
    // Esto es vital para `attackCell` después.
    const updatedShipInstance = Pieza.fromObject({ // Crea una nueva instancia de Pieza
      id: shipInstance.id,
      name: shipInstance.name,
      size: shipInstance.size,
      hits: shipInstance.hits,
      orientation: orientation, // Asigna la orientación real
      positions: cellsToOccupy // Asigna las posiciones reales de las celdas
    });

    // --- CRÍTICO: COPIA PROFUNDA para inmutabilidad de los ships ---
    const newShips = this.ships.map(s => Pieza.fromObject(s.toSimpleObject())); // Copia cada barco
    newShips.push(updatedShipInstance); // Añade el nuevo barco actualizado

    // Devuelve un NUEVO tablero con la nueva cuadrícula y la nueva lista de barcos.
    return { success: true, newTablero: new Tablero(this.size, newGrid, newShips) };
  }

  attackCell(row, col) {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
      return { status: 'invalid', message: 'Ataque fuera de límites.', newTablero: this };
    }

    // --- CRÍTICO: COPIA PROFUNDA para inmutabilidad del grid antes de modificar ---
    // Siempre trabaja en una nueva cuadrícula para no mutar el estado original.
    const newGrid = this.grid.map(r => 
        r.map(c => CeldaClass.fromObject(c.toSimpleObject()))
    );
    
    // Obtiene la celda MODIFICABLE de la nueva cuadrícula.
    const newCell = newGrid[row][col];
  
    // Verifica si la celda ya fue golpeada antes de intentar marcarla.
    if (newCell.isHit) { // Usa newCell para el chequeo de "ya atacada"
      return { status: 'already_hit', message: 'Celda ya atacada.', newTablero: this };
    }

    // ¡CRÍTICO!: Marca la celda como golpeada en la NUEVA celda.
    newCell.isHit = true;

    let attackStatus = 'miss';
    let attackMessage = '¡Agua!';
    let shipName = null;
    let sunkShip = null;

    // --- CRÍTICO: COPIA PROFUNDA para inmutabilidad de los ships ---
    // Trabaja con una nueva lista de barcos para evitar mutar el original.
    const newShips = this.ships.map(s => Pieza.fromObject(s.toSimpleObject()));

    // Verifica si la celda golpeada contiene parte de un barco
    // `newCell.isOccupied` debe ser true si un barco fue colocado allí.
    if (newCell.isOccupied && newCell.shipId) {
      const shipIndex = newShips.findIndex(s => s.id === newCell.shipId);
      
      if (shipIndex !== -1) {
        const updatedShip = newShips[shipIndex]; // Esta es la instancia modificable (copia)

        updatedShip.hits += 1; // Incrementa los hits en la COPIA del barco

        shipName = updatedShip.name; // Obtén el nombre del barco

        if (updatedShip.isSunk()) { // isSunk() debe ser un método de Pieza que verifica hits >= size
          attackStatus = 'sunk';
          attackMessage = `¡Hundiste un ${updatedShip.name}!`;
          sunkShip = updatedShip.toSimpleObject(); // Envía la versión simple del barco hundido

          // Marcar *todas* las celdas de este barco como parte de un barco hundido en la nueva cuadrícula.
          // Esto es CLAVE para la visualización de barcos hundidos en el frontend.
          // Las posiciones del barco deben estar en `updatedShip.positions`
          if (updatedShip.positions && updatedShip.positions.length > 0) {
            updatedShip.positions.forEach(pos => {
              if (newGrid[pos.row] && newGrid[pos.row][pos.col]) {
                const sunkCell = newGrid[pos.row][pos.col]; 
                sunkCell.isSunkShipPart = true; // Nueva propiedad para indicar que es parte de un barco hundido
                sunkCell.isHit = true; // Asegura que también esté marcada como golpeada
              }
            });
          }  

          // Log de depuración para hundimiento
          console.log(`------------------------------------`);
          console.log(`BARCO HUNDIDO DETECTADO:`);
          console.log(`Nombre/ID: ${updatedShip.name || updatedShip.id}`);
          console.log(`Hits: ${updatedShip.hits} / Tamaño: ${updatedShip.size}`);
          console.log(`Posiciones del barco:`, JSON.parse(JSON.stringify(updatedShip.positions)));
          console.log(`------------------------------------`);

        } else {
          attackStatus = 'hit';
          attackMessage = `¡Impacto en ${updatedShip.name}!`;
        }
      }
    }

    // Crea una nueva instancia de Tablero con la cuadrícula y barcos actualizados.
    const finalNewTablero = new Tablero(this.size, newGrid, newShips);

    // console.log para depuración de la celda atacada
    console.log(`DEBUG: [Backend Tablero.js] Celda [${row},${col}] en el finalNewTablero antes de retornar:`, finalNewTablero.grid[row][col].toSimpleObject());
    console.log(`DEBUG: [Backend Tablero.js] Objeto completo retornado de attackCell:`, { 
      status: attackStatus, 
      message: attackMessage, 
      shipName: shipName, 
      sunkShip: sunkShip, 
      newTablero: finalNewTablero.toSimpleObject() // Asegúrate de enviar la versión simple
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
    // Asegúrate de que todos los barcos sean instancias válidas y se pueda llamar a isSunk()
    return this.ships.every(ship => ship instanceof Pieza && ship.isSunk());
  }

  reset() {
    return new Tablero(this.size);
  }

  // --- CRÍTICO: Serialización a objeto simple ---
  toSimpleObject() {
    return {
      size: this.size,
      grid: this.grid.map(row => 
        row.map(cell => 
          cell.toSimpleObject() // Llama al toSimpleObject() de CeldaClass
        )
      ),
      ships: this.ships.map(ship => 
        ship.toSimpleObject() // Llama al toSimpleObject() de Pieza
      ),
    };
  }

  // --- CRÍTICO: Deserialización desde objeto simple ---
  static fromSimpleObject(obj) {
    if (!obj || !obj.grid || !obj.ships || typeof obj.size === 'undefined') {
      console.error("Error: Objeto simple de tablero incompleto para reconstrucción.", obj);
      // Devuelve un tablero por defecto para evitar errores.
      return new Tablero(10); 
    }
    
    // Reconstruir la cuadrícula con instancias de CeldaClass a partir de los datos simples
    const reconstructedGrid = obj.grid.map(row => row.map(cellData => 
      CeldaClass.fromObject(cellData) // Usa el método fromObject en CeldaClass
    ));
    
    // Reconstruir las naves con instancias de Pieza a partir de los datos simples
    const reconstructedShips = obj.ships.map(shipData => {
        return Pieza.fromObject(shipData); // Usa el método fromObject en Pieza
    });

    // Retorna una nueva instancia de Tablero con la cuadrícula y naves reconstruidas.
    return new Tablero(obj.size, reconstructedGrid, reconstructedShips);
  }
}

export default Tablero;