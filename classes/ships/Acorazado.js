import Pieza from "./Pieza"

class Acorazado extends Pieza {
    constructor() {
        super(4, "Acorazado", 4);
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
            positions: this.positions ? this.positions.map(p => ({ row: p.row, col: p.col })) : [],
            isSunk: this.isSunk(),
        };
    }
}

export default Acorazado