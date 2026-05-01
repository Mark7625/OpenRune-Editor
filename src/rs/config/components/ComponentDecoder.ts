import { CacheSystem } from "../../cache/CacheSystem";
import { ByteBuffer } from "../../io/ByteBuffer";
import { GameVals } from "../gameval/GameVals";
import { ComponentType } from "./ComponentType";
import { InterfaceType } from "./InterfaceType";


export class ComponentDecoder {
    private index3;
    private supportsModels = true;

    constructor(
        private cache: CacheSystem,
        private gamevals: GameVals,
    ) {
        this.index3 = cache.getIndex(3);
    }

    private getArchive(group: number) {
        return this.index3.getArchive(group);
    }

    supportsExtendedComponentModels(): boolean {
        return this.supportsModels;
    }

    /* =========================
     * LEGACY MAP (OPTIMIZED)
     * ========================= */
    loadLegacyMap(): Record<number, boolean> {
        const result: Record<number, boolean> = {};

        const index3 = this.index3;
        const groups = index3.getArchiveIds() ?? new Int32Array(0);

        for (let gi = 0; gi < groups.length; gi++) {
            const group = groups[gi];
            const archive = index3.getArchive(group);

            const files = archive.fileIds;

            for (let fi = 0; fi < files.length; fi++) {
                const file = files[fi];
                const combinedId = (group << 16) | file;

                const buf = archive.getFile(file)!.getDataAsBuffer();

                result[combinedId] = buf.peekByte() !== -1;
            }
        }

        return result;
    }

    /* =========================
     * LOAD ALL INTERFACES
     * ========================= */
    load(): Record<number, InterfaceType> {
        const result: Record<number, InterfaceType> = {};

        const index3 = this.index3;
        const groups = index3.getArchiveIds() ?? new Int32Array(0);

        for (const group of groups) {
            const archive = index3.getArchive(group);
            const files = archive.fileIds;

            const components: Record<number, ComponentType> = {};

            for (const file of files) {
                const buf = archive.getFile(file)!.getDataAsBuffer();
                const component = this.readFast(file, buf);

                const combinedId = (group << 16) | file;
                const childID = combinedId & 0xFFFF;

                const layerID = (group << 16) | component.layer;

                component.layer = layerID;
                component.internalId = combinedId;
                component.id = childID;

                components[file] = component;
            }

            result[group] = {
                id: group,
                components
            };
        }
        console.log(JSON.stringify(result[523], null, 2));
        return result;
    }

    /* =========================
     * FAST DISPATCH
     * ========================= */
    private readFast(id: number, data: ByteBuffer): ComponentType {
        const v3 = data.peekByte() === -1;

        if (v3) {
            data.readByte();
            return this.decodeV3Fast(id, data);
        }

        return this.decodeV1Fast(id, data);
    }

    private decodeV3Fast(id: number, data: ByteBuffer): ComponentType {
        const b: any = { internalId: id, v3: true };

        const type = data.readUnsignedByte();
        b.type = type;

        b.contentType = data.readUnsignedShort();
        b.x = data.readShort();
        b.y = data.readShort();
        b.width = data.readUnsignedShort();

        b.height =
            type === 9
                ? data.readShort()
                : data.readUnsignedShort();

        b.widthMode = data.readByte();
        b.heightMode = data.readByte();
        b.xMode = data.readByte();
        b.yMode = data.readByte();

        let layer = data.readUnsignedShortOrNull();
        b.layer = layer != null ? layer + (id & -65536) : null;

        b.hide = data.readBoolean();

        // ---- TYPE FAST SWITCH (NO STRING OPS)
        switch (type) {
            case 0:
                b.scrollWidth = data.readUnsignedShort();
                b.scrollHeight = data.readUnsignedShort();
                b.noClickThrough = data.readBoolean();
                break;

            case 5:
                b.graphic = data.readInt();
                b.angle2d = data.readUnsignedShort();
                b.tiling = data.readBoolean();
                b.trans1 = data.readUnsignedByte();
                b.outline = data.readUnsignedByte();
                b.graphicShadow = data.readInt();
                b.vFlip = data.readBoolean();
                b.hFlip = data.readBoolean();
                break;

            case 6:
                b.modelKind = 1;
                b.model = this.supportsModels
                    ? data.readInt()
                    : data.readUnsignedShortOrNull();

                b.modelX = data.readShort();
                b.modelY = data.readShort();
                b.modelAngleX = data.readUnsignedShort();
                b.modelAngleY = data.readUnsignedShort();
                b.modelAngleZ = data.readUnsignedShort();
                b.modelZoom = data.readUnsignedShort();
                b.modelAnim = data.readUnsignedShortOrNull();
                b.modelOrthog = data.readBoolean();

                data.readUnsignedShort();

                if (b.widthMode) data.readUnsignedShort();
                if (b.heightMode) data.readUnsignedShort();
                break;

            case 4:
                b.textFont = data.readUnsignedShortOrNull();
                b.text = data.readString();
                b.textLineHeight = data.readUnsignedByte();
                b.textAlignH = data.readUnsignedByte();
                b.textAlignV = data.readUnsignedByte();
                b.textShadow = data.readBoolean();
                b.colour1 = data.readInt();
                break;

            case 3:
                b.colour1 = data.readInt();
                b.fill = data.readBoolean();
                b.trans1 = data.readUnsignedByte();
                break;

            case 9:
                b.lineWid = data.readUnsignedByte();
                b.colour1 = data.readInt();
                b.lineDirection = data.readBoolean();
                break;
        }

        b.events = data.readUnsignedMedium();
        b.opBase = data.readString();

        const opCount = data.readUnsignedByte();
        if (opCount) {
            const ops = new Array(opCount);
            for (let i = 0; i < opCount; i++) {
                ops[i] = data.readString();
            }
            b.op = ops;
        }

        b.dragDeadZone = data.readUnsignedByte();
        b.dragDeadTime = data.readUnsignedByte();
        b.draggableBehavior = data.readBoolean();
        b.targetVerb = data.readString();

        // hooks (unchanged but fast)
        b.onLoad = this.decodeHook(data);
        b.onMouseOver = this.decodeHook(data);
        b.onMouseLeave = this.decodeHook(data);
        b.onTargetLeave = this.decodeHook(data);
        b.onTargetEnter = this.decodeHook(data);

        b.onVarTransmitList = this.decodeHookList(data);
        b.onInvTransmitList = this.decodeHookList(data);
        b.onStatTransmitList = this.decodeHookList(data);

        return b as ComponentType;
    }

    /* =========================
     * V1 FAST PATH
     * ========================= */
    private decodeV1Fast(id: number, data: ByteBuffer): ComponentType {
        const b: any = { internalId: id, v3: false };

        b.type = data.readUnsignedByte();
        b.buttonType = data.readUnsignedByte();
        b.contentType = data.readUnsignedShort();

        b.x = data.readShort();
        b.y = data.readShort();
        b.width = data.readUnsignedShort();
        b.height = data.readUnsignedShort();

        b.trans1 = data.readUnsignedByte();

        let layer = data.readUnsignedShortOrNull();
        b.layer = layer != null ? layer + (id & -65536) : null;

        b.mouseOverRedirect = data.readUnsignedShortOrNull();

        const cs1 = data.readUnsignedByte();
        if (cs1) {
            b.cs1Comparisons = new Array(cs1);
            b.cs1ComparisonValues = new Array(cs1);

            for (let i = 0; i < cs1; i++) {
                b.cs1Comparisons[i] = data.readUnsignedByte();
                b.cs1ComparisonValues[i] = data.readUnsignedShort();
            }
        }

        const instr = data.readUnsignedByte();
        if (instr) {
            const out = new Array(instr);
            for (let i = 0; i < instr; i++) {
                const inner = data.readUnsignedShort();
                const arr = new Array(inner);

                for (let j = 0; j < inner; j++) {
                    arr[j] = data.readUnsignedShortOrNull() ?? -1;
                }

                out[i] = arr;
            }
            b.cs1Instructions = out;
        }

        if (b.type === 4) {
            b.text = data.readString();
            b.secondaryText = data.readString();
        }

        if (b.type === 5) {
            b.graphic = data.readInt();
            b.secondaryGraphic = data.readInt();
        }

        if (b.type === 6) {
            b.model = this.supportsModels
                ? data.readInt()
                : data.readUnsignedShortOrNull();
        }

        if (b.type === 8) {
            b.text = data.readString();
        }

        return b as ComponentType;
    }

    /* =========================
     * HOT PATH HELPERS
     * ========================= */
    private decodeHook(data: ByteBuffer): any[] | null {
        const count = data.readUnsignedByte();
        if (!count) return null;

        const arr = new Array(count);

        for (let i = 0; i < count; i++) {
            arr[i] =
                data.readUnsignedByte() === 0
                    ? data.readInt()
                    : data.readString();
        }

        return arr;
    }

    private decodeHookList(data: ByteBuffer): number[] | null {
        const count = data.readUnsignedByte();
        if (!count) return null;

        const arr = new Array(count);
        for (let i = 0; i < count; i++) {
            arr[i] = data.readInt();
        }

        return arr;
    }
}