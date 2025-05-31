import Pieza from '@/classes/Pieza';

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
}

export default Lancha;