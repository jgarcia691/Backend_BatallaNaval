import { v4 as uuidv4 } from 'uuid'; 

export class Pieza {
    // El constructor ahora recibe las propiedades de un objeto plano para la reconstrucción
    constructor(id = uuidv4(), name, size, hits = 0, orientation, positions = [], ownerId = null) {
        this.id = id;
        this.name = name;
        this.size = size;
        this.hits = hits;
        this.orientation = orientation;
        this.positions = positions;
        this.ownerId = ownerId; 
    }
     
    isSunk() {
        return this.hits >= this.size;
    }

    toSimpleObject() {
        return {
            id: this.id,
            name: this.name,
            size: this.size,
            hits: this.hits,
            orientation: this.orientation,
            positions: [...this.positions],
            ownerId: this.ownerId
        };
    }

    static fromObject(obj) {
        return new Pieza(
            obj.id,
            obj.name,
            obj.size,
            obj.hits || [],
            obj.orientation,
            obj.positions || [],
            obj.ownerId
        );
    }
}

export default Pieza;