import { CacheSystem } from "../../cache/CacheSystem";
import { ByteBuffer } from "../../io/ByteBuffer";
import { GameValGroupType } from "./GameValGroupType";
import { GameValElement } from "./impl/GameValElement";
import { Interface, InterfaceComponent } from "./impl/Interface";
import { Sprite } from "./impl/Sprite";
import { Table, TableColumn } from "./impl/Table";

const GAMEVALS_INDEX = 24;

export class GameVals {
    private readonly cache: CacheSystem;

    private readonly typeCache = new Map<number, GameValElement[]>();
    private readonly indexCache = new Map<number, Map<number, GameValElement>>();

    constructor(cache: CacheSystem) {
        this.cache = cache;
    }

    get(type: GameValGroupType): GameValElement[] {
        const cached = this.typeCache.get(type.id);
        if (cached) return cached;

        const loaded = this.load(type);

        this.typeCache.set(type.id, loaded);
        this.buildIndex(type.id, loaded);

        return loaded;
    }

    getById<T extends GameValElement>(type: GameValGroupType, id: number): T | undefined {
        return this.get(type).find((e) => e.id === id) as T | undefined;
    }

    getFast(type: GameValGroupType, id: number): GameValElement | undefined {
        return this.indexCache.get(type.id)?.get(id);
    }

    getFastAs<T extends GameValElement>(type: GameValGroupType, id: number): T | undefined {
        return this.getFast(type, id) as T | undefined;
    }

    private load(type: GameValGroupType): GameValElement[] {
        const resolvedType = this.resolveType(type);

        const index = this.cache.getIndex(GAMEVALS_INDEX);
        const fileIds = index.getFileIds(resolvedType.id) ?? new Int32Array(0);
        const archive = index.getArchive(resolvedType.id);

        const out: GameValElement[] = [];

        for (const fileId of fileIds) {
            const buf = archive.getFile(fileId)?.getDataAsBuffer();
            if (!buf) continue;

            out.push(...this.unpack(resolvedType, fileId, buf));
        }

        return out;
    }

    private resolveType(type: GameValGroupType): GameValGroupType {
        if (type !== GameValGroupType.IFTYPES) return type;

        const index = this.cache.getIndex(GAMEVALS_INDEX);
        const hasFiles = index.getFileCount(type.id) > 0;

        return hasFiles ? type : GameValGroupType.IFTYPES_V2;
    }

    private unpack(type: GameValGroupType, id: number, buf: ByteBuffer): GameValElement[] {
        switch (type) {
            case GameValGroupType.TABLETYPES:
                return [this.readTable(id, buf)];

            case GameValGroupType.IFTYPES:
                return [this.readInterface(id, buf, false)];

            case GameValGroupType.IFTYPES_V2:
                return [this.readInterface(id, buf, true)];

            default:
                return [this.readGeneric(type, id, buf)];
        }
    }

    private readTable(id: number, buf: ByteBuffer): Table {
        buf.readUnsignedByte();

        const tableName = buf.readString();
        const columns: TableColumn[] = [];

        let columnId = 0;

        while (true) {
            const flag = buf.readUnsignedByte();
            if (flag === 0) break;

            const name = buf.readString();
            columns.push(new TableColumn(name, columnId++));
        }

        return new Table(tableName, id, columns);
    }

    private readInterface(id: number, buf: ByteBuffer, v2: boolean): Interface {
        const name = buf.readString();
        const components: InterfaceComponent[] = [];

        while (true) {
            const child = v2 ? buf.readUnsignedShort() : buf.readUnsignedByte();
            if (v2 ? child === 0xffff : child === 0xff && buf.peek() === 0) break;

            const compName = buf.readString();
            if (!compName) break;

            components.push(new InterfaceComponent(compName, child, id));
        }

        return new Interface(name, id, components);
    }

    private readGeneric(type: GameValGroupType, id: number, buf: ByteBuffer): GameValElement {
        const raw = Buffer.from(buf.readRemaining()).toString("utf8");

        if (type === GameValGroupType.SPRITETYPES) {
            const [name, idx] = raw.split(",");
            return new Sprite(name, Number(idx ?? -1), id);
        }

        return new GameValElement(raw, id);
    }

    private buildIndex(typeId: number, list: GameValElement[]): void {
        const map = new Map<number, GameValElement>();

        for (const e of list) {
            map.set(e.id, e);
        }

        this.indexCache.set(typeId, map);
    }

    clearCache(): void {
        this.typeCache.clear();
        this.indexCache.clear();
    }
}
