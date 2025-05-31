// Pieza.js (o tu clase Barco)
import { v4 as uuidv4 } from 'uuid'; // Si usas UUID para IDs de barcos

class Pieza {
    // El constructor ahora recibe las propiedades de un objeto plano para la reconstrucción
    constructor(id = uuidv4(), name, size, hits = 0, orientation, positions = []) {
        this.id = id;
        this.name = name;
        this.size = size;
        this.hits = hits;
        this.orientation = orientation;
        // Almacena las posiciones de las celdas que ocupa el barco (objetos {row, col})
        this.positions = positions; 
    }

    isSunk() {
        return this.hits >= this.size;
    }

    // Serializa la instancia de Pieza a un objeto plano
    toSimpleObject() {
        return {
            id: this.id,
            name: this.name,
            size: this.size,
            hits: this.hits,
            orientation: this.orientation,
            positions: this.positions.map(p => ({ row: p.row, col: p.col })), // Asegura que las posiciones sean objetos planos
            isSunk: this.isSunk(), // Incluye el estado de hundimiento
        };
    }

    // Reconstruye una instancia de Pieza desde un objeto plano
    static fromObject(obj) {
        // Usa las propiedades del objeto plano para construir una nueva instancia
        const pieza = new Pieza(
            obj.id, 
            obj.name, 
            obj.size, 
            obj.hits, 
            obj.orientation, 
            obj.positions.map(p => ({ row: p.row, col: p.col })) // Reconstruye posiciones
        );
        // Asegúrate de que el estado de hundimiento se mantenga
        // (aunque `isSunk()` lo calcula, tenerlo en el objeto original puede ser útil)
        return pieza;
    }
}

export default Pieza;