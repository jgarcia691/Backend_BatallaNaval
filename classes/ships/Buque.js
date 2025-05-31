import Pieza from "./Pieza"

class Buque extends Pieza{
    constructor() {
        super(2, "Buque", 2);
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

export default Buque