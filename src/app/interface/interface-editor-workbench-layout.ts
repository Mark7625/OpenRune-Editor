import type { DockviewApi } from "dockview";

/** Default draggable layout for the interface editor (dockview). */
export function applyInterfaceEditorWorkbenchLayout(api: DockviewApi): void {
  if (api.getPanel("iface-preview")) {
    return;
  }

  api.addPanel({
    id: "iface-preview",
    component: "ifacePreview",
    title: "Client preview",
  });

  api.addPanel({
    id: "iface-interfaces",
    component: "ifaceInterfaces",
    title: "Interfaces",
    position: { referencePanel: "iface-preview", direction: "left" },
    initialWidth: 268,
    minimumWidth: 180,
  });

  api.addPanel({
    id: "iface-component-tree",
    component: "ifaceComponentTree",
    title: "Component view",
    position: { referencePanel: "iface-preview", direction: "right" },
    initialWidth: 480,
    minimumWidth: 220,
  });

  api.addPanel({
    id: "iface-client-script",
    component: "ifaceClientScript",
    title: "Client script",
    position: { referencePanel: "iface-component-tree", direction: "within" },
    inactive: true,
  });

  api.addPanel({
    id: "iface-component-editor",
    component: "ifaceComponentEditor",
    title: "Component editor",
    position: { referencePanel: "iface-component-tree", direction: "below" },
    initialHeight: 320,
    minimumHeight: 160,
  });
}
