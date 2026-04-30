export class GameValElement {
    constructor(public name: string, public id: number) {}

    toFullString(): string {
        return `${this.name}:${this.id}`;
    }
}