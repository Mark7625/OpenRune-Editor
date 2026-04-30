import { Orientation, type AddPanelOptions, type DockviewApi, type SerializedDockview, type SerializedGridObject } from "dockview";

/** Leaf payload in `SerializedDockview.grid` (tab group with panel ids). */
interface SerializedTabGroupState {
    id: string;
    views: string[];
    activeView?: string;
}

export interface DockPanelRestoreSink {
    peekDockPanelRestore(panelId: string): AddPanelOptions | undefined;
    consumeDockPanelRestore(panelId: string): void;
}

function firstPanelIdInGridNode(node: SerializedGridObject<SerializedTabGroupState>): string | null {
    if (node.type === "leaf") {
        const g = node.data as SerializedTabGroupState;
        return g.views[0] ?? null;
    }
    const children = node.data as SerializedGridObject<SerializedTabGroupState>[];
    for (const c of children) {
        const id = firstPanelIdInGridNode(c);
        if (id) {
            return id;
        }
    }
    return null;
}

function findPanelPlacement(
    node: SerializedGridObject<SerializedTabGroupState>,
    panelId: string,
    parentBranch: SerializedGridObject<SerializedTabGroupState> | null,
    branchChildIndex: number,
): {
    groupViews: string[];
    tabIndex: number;
    parentBranch: SerializedGridObject<SerializedTabGroupState> | null;
    branchChildIndex: number;
} | null {
    if (node.type === "leaf") {
        const g = node.data as SerializedTabGroupState;
        const tabIndex = g.views.indexOf(panelId);
        if (tabIndex >= 0) {
            return { groupViews: [...g.views], tabIndex, parentBranch, branchChildIndex };
        }
        return null;
    }
    const children = node.data as SerializedGridObject<SerializedTabGroupState>[];
    for (let i = 0; i < children.length; i++) {
        const hit = findPanelPlacement(children[i]!, panelId, node, i);
        if (hit) {
            return hit;
        }
    }
    return null;
}

/**
 * Build `addPanel` options that approximate where the panel was in the grid (from a snapshot taken before close).
 */
export function extractDockPanelRestoreOptions(full: SerializedDockview, panelId: string): AddPanelOptions | null {
    const state = full.panels[panelId];
    if (!state?.contentComponent) {
        return null;
    }

    const loc = findPanelPlacement(
        full.grid.root as SerializedGridObject<SerializedTabGroupState>,
        panelId,
        null,
        0,
    );
    if (!loc) {
        return null;
    }

    const base = {
        id: state.id,
        component: state.contentComponent,
        tabComponent: state.tabComponent,
        title: state.title,
        params: state.params,
        minimumWidth: state.minimumWidth,
        minimumHeight: state.minimumHeight,
        maximumWidth: state.maximumWidth,
        maximumHeight: state.maximumHeight,
        inactive: true,
        floating: false as const,
    } satisfies Partial<AddPanelOptions>;

    if (loc.groupViews.length > 1) {
        const refId = loc.tabIndex === 0 ? loc.groupViews[1]! : loc.groupViews[loc.tabIndex - 1]!;
        return {
            ...base,
            position: { referencePanel: refId, direction: "within", index: loc.tabIndex },
        } as AddPanelOptions;
    }

    if (!loc.parentBranch || loc.parentBranch.type !== "branch") {
        return {
            ...base,
            position: { referencePanel: "editor-scene-editor", direction: "right" },
        } as AddPanelOptions;
    }

    const children = loc.parentBranch.data as SerializedGridObject<SerializedTabGroupState>[];
    const siblingIdx = loc.branchChildIndex === 0 ? 1 : loc.branchChildIndex - 1;
    const sib = children[siblingIdx];
    if (!sib) {
        return {
            ...base,
            position: { referencePanel: "editor-scene-editor", direction: "right" },
        } as AddPanelOptions;
    }

    const refPanel = firstPanelIdInGridNode(sib);
    if (!refPanel) {
        return {
            ...base,
            position: { referencePanel: "editor-scene-editor", direction: "right" },
        } as AddPanelOptions;
    }

    const orient = full.grid.orientation;
    const horizontal = orient === Orientation.HORIZONTAL;
    const dir = horizontal
        ? loc.branchChildIndex === 0
            ? "left"
            : "right"
        : loc.branchChildIndex === 0
          ? "above"
          : "below";

    return {
        ...base,
        position: { referencePanel: refPanel, direction: dir },
    } as AddPanelOptions;
}

export function stashedReferencePanelId(stash: AddPanelOptions): string | undefined {
    const pos = stash.position as { referencePanel?: string } | undefined;
    if (pos && typeof pos.referencePanel === "string") {
        return pos.referencePanel;
    }
    return undefined;
}

/** Add a panel using last stashed placement if present and still valid; otherwise `defaultAdd`. */
export function addMapEditorDockPanelRestoredOrDefault(
    api: DockviewApi,
    panelId: string,
    defaultAdd: AddPanelOptions,
    restore?: DockPanelRestoreSink,
): void {
    if (api.getPanel(panelId)) {
        return;
    }

    if (restore) {
        const stashed = restore.peekDockPanelRestore(panelId);
        if (stashed) {
            const ref = stashedReferencePanelId(stashed);
            if (ref && !api.getPanel(ref)) {
                restore.consumeDockPanelRestore(panelId);
            } else {
                try {
                    api.addPanel(stashed);
                    restore.consumeDockPanelRestore(panelId);
                    return;
                } catch {
                    restore.consumeDockPanelRestore(panelId);
                }
            }
        }
    }

    api.addPanel(defaultAdd);
}
