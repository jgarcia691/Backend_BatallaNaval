import Pieza from "./Pieza"

class Submarino extends Pieza{
    constructor(){
        super(3)
    }

    isSunk() {
        return this.hits >= this.size;
    }
}

export default Submarino