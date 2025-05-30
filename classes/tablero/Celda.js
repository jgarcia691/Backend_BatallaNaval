class Celda {
    constructor(fila, columna) {
        this.posicion = { fila, columna }; // Posición de la celda en el tablero
        this.fila = fila; // Fila de la celda
        this.columna = columna; // Columna de la celda
        this.hasShip = false; // Indica si la celda tiene un barco
        this.isHit = false; // Indica si la celda ha sido golpeada
        this.shipId = null; // ID del barco si la celda tiene uno
        this.shipPartIndex = null; // Índice de la parte del barco si la celda tiene uno
        this.active = true; // Indica si la celda está activa (puede ser golpeadas)
    }
}

export default Celda