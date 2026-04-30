export class GameValGroupType {
    static readonly OBJTYPES = new GameValGroupType(0, "items");
    static readonly NPCTYPES = new GameValGroupType(1, "npcs");
    static readonly INVTYPES = new GameValGroupType(2, "inv");
    static readonly VARPTYPES = new GameValGroupType(3, "varp");
    static readonly VARBITTYPES = new GameValGroupType(4, "varbits");
    static readonly LOCTYPES = new GameValGroupType(6, "objects");
    static readonly SEQTYPES = new GameValGroupType(7, "sequences");
    static readonly SPOTTYPES = new GameValGroupType(8, "spotanims");
    static readonly ROWTYPES = new GameValGroupType(9, "dbrows");
    static readonly TABLETYPES = new GameValGroupType(10, "dbtables");
    static readonly SOUNDTYPES = new GameValGroupType(11, "jingles");
    static readonly SPRITETYPES = new GameValGroupType(12, "sprites");
    static readonly IFTYPES = new GameValGroupType(13, "components");
    static readonly IFTYPES_V2 = new GameValGroupType(14, "components", 232);
    static readonly VARCS = new GameValGroupType(15, "varcs", 232);

    static values(): GameValGroupType[] {
        return Object.values(GameValGroupType).filter((v) => v instanceof GameValGroupType);
    }

    static fromId(id: number): GameValGroupType {
        const found = GameValGroupType.values().find((t) => t.id === id);
        if (!found) throw new Error(`Unknown group type: ${id}`);
        return found;
    }

    constructor(
        public readonly id: number,
        public readonly groupName: string,
        public readonly revision: number = -1,
    ) {}
}
