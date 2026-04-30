import { GameValElement } from "./GameValElement";

export class Sprite extends GameValElement {
    constructor(name: string, public index: number, id: number,) {
        super(name, id);
    }

    override toFullString(): string {
        return this.index === -1
            ? `${this.name}:${this.id}`
            : `${this.name},${this.index}:${this.id}`;
    }
}
