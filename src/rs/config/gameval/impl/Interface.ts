import { GameValElement } from "./GameValElement";

export class Interface extends GameValElement {
    constructor(name: string, id: number, public components: InterfaceComponent[] = [],) {
        super(name, id);
    }
}

export class InterfaceComponent extends GameValElement {
    constructor(name: string, id: number, public linkedInterfaceID: number,) {
        super(name, id);
    }

    get packed(): number {
        return ((this.linkedInterfaceID & 0xffff) << 16) | (this.id & 0xffff);
    }

    toFullString(mode: "default" | "packed" = "default"): string {
        if (mode === "packed") {
            return `${this.name}:${this.packed}`;
        }
        return `${this.name}:${this.id}`;
    }
}
