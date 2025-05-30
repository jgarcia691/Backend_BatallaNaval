import Pieza from '@/classes/Pieza';

class Lancha extends Pieza{
    constructor() {
        super(1)
        this.skin = '/public/piezas/lancha.png'
    }

    getSize() {
        return this.size;
    }

    isSunk() {
        return this.hits >= this.size;
    }
}

export default Lancha;