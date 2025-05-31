import Pieza from "./Pieza"

class Acorazado extends Pieza {
    constructor() {
        super(4, "Acorazado", 4);
    }

    isSunk() {
        return this.hits >= this.size;
    }
}

export default Acorazado