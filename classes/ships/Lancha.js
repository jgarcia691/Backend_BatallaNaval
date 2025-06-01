import Pieza from '@/classes/ships/Pieza';

class Lancha extends Pieza{
    constructor() {
        super(1, "Lancha", 1);
    }

    getSize() {
        return this.size;
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

export default Lancha;