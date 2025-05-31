import Pieza from "./Pieza"

class Portaaviones extends Pieza {
    constructor() {
        super(5, "Portaaviones", 5);
    }

    isSunk() {
        return this.hits >= this.size;
    }
}

export default Portaaviones