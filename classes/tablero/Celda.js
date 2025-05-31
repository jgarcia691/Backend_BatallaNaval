// Celda.js
class Celda {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.isOccupied = false; // Indica si tiene parte de un barco
        this.shipId = null;      // ID del barco que ocupa esta celda
        this.shipName = null;    // Nombre del barco que ocupa esta celda
        this.isHit = false;      // Indica si la celda ha sido atacada
        this.isSunkShipPart = false; // Indica si la celda es parte de un barco hundido
    }

    // Serializa la instancia de Celda a un objeto plano
    toSimpleObject() {
        return {
            row: this.row,
            col: this.col,
            isOccupied: this.isOccupied,
            shipId: this.shipId,
            shipName: this.shipName,
            isHit: this.isHit,
            isSunkShipPart: this.isSunkShipPart,
        };
    }

    // Reconstruye una instancia de Celda desde un objeto plano
    static fromObject(obj) {
        const celda = new Celda(obj.row, obj.col);
        celda.isOccupied = obj.isOccupied || false;
        celda.shipId = obj.shipId || null;
        celda.shipName = obj.shipName || null;
        celda.isHit = obj.isHit || false;
        celda.isSunkShipPart = obj.isSunkShipPart || false;
        return celda;
    }
}

export default Celda;