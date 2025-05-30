class Pieza {
    constructor (size) {
        this.size = size; // Tamaño de la pieza, número de partes que la componen
        this.hits = 0; // Número de partes de la pieza por golpar
        this.posicion = []; // Posición de la pieza en el tablero, [{fila, columna}, ...]
        this.orientacion = null; // 'horizontal' o 'vertical'
        this.sunk = false; // Indica si la pieza ha sido hundida
        this.skin = null; // URL de la imagen del skin
    }

    hit() {
        this.hits++;
        if (this.hits >= this.length) {
            this.sunk = true;
        }
    }

    isSunk() {
        return this.sunk;
    }
    
    setSize(size) {
        this.size = size;
    }

    getSize() {
        return this.size;
    }

    setHits(hits) {
        this.hits = hits;
    }

    getHits() {
        return this.hits;
    }

    setPosicion(posicion) {
        this.posicion = posicion;
    }

    getPosicion() {
        return this.posicion;
    }

    setOrientacion(orientacion) {
        this.orientacion = orientacion;
    }

    getOrientacion() {
        return this.orientacion;
    }

    setSkin(skin) {
        this.skin = skin;
    }

    getSkin() {
        return this.skin;
    }
}

export default Pieza;