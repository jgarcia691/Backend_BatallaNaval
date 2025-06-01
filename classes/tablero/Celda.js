class Celda {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.isHit = false;
        this.isOccupied = false;
        this.shipId = null;
        this.shipName = null;
        this.ownerId = null;
    }

    toSimpleObject() {
        return {
            row: this.row,
            col: this.col,
            isHit: this.isHit,
            isOccupied: this.isOccupied,
            shipId: this.shipId,
            shipName: this.shipName,
            ownerId: this.ownerId 
        };
    }

    static fromObject(obj) {
        const cell = new Celda(obj.row, obj.col);
        cell.isHit = obj.isHit;
        cell.isOccupied = obj.isOccupied;
        cell.shipId = obj.shipId;
        cell.shipName = obj.shipName;
        cell.ownerId = obj.ownerId; 
        return cell;
    }
}

export default Celda