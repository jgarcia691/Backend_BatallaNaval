import Pieza from "./Pieza"

class Buque extends Pieza{
    constructor() {
        super(2)
    }

    isSunk() {
        return this.hits >= this.size;
    }
}

export default Buque