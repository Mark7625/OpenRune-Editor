import { ComponentType } from "./ComponentType";
import { InterfaceParentsRaw } from "../../../lib/interfaces/InterfaceManager";


export interface InterfaceType {
    id: number;
    components: Record<number, ComponentType>;
    interfaceParents?: InterfaceParentsRaw;
}
