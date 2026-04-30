import { GameValElement } from "./GameValElement";

export class Table extends GameValElement {
    constructor(name: string, id: number, public columns: TableColumn[] = [],) {
        super(name, id);
    }
}

export class TableColumn extends GameValElement {}
