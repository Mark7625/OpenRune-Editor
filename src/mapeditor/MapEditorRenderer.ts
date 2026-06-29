import { Schema } from "leva/dist/declarations/src/types";

import { Renderer } from "../components/renderer/Renderer";
import { ProjectionType } from "../mapviewer/Camera";
import { MapManager, MapSquare } from "../mapviewer/MapManager";
import { clamp } from "../util/MathUtil";
import {
    getActivePaintModifiers,
    isEditorToolKeybindHeld,
    isEditorToolBindingSuppressedThisFrame,
    runEditorToolKeyBindings,
} from "./editor-tool-input";
import { coreViewerBindingKey, coreViewerDefaultChords } from "./plugins/builtins/core-viewer-keybinds.builtin";
import type { IEditorPluginHost } from "./plugins/editor-plugin-host";

export abstract class MapEditorRenderer<T extends MapSquare = MapSquare> extends Renderer {
    mapManager: MapManager<T>;

    constructor(public readonly host: IEditorPluginHost) {
        super();
        this.mapManager = new MapManager(
            host.workerPool.size * 2,
            this.queueLoadMap.bind(this),
        );
    }

    override async init() {
        this.host.inputManager.init(this.canvas);
    }

    override cleanUp(): void {
        this.host.inputManager.cleanUp();
    }

    initCache(): void {
        this.mapManager.init(this.host.mapFileIndex,false);
        this.mapManager.update(
            this.host.camera,
            this.stats.frameCount,
            this.host.renderDistance,
            this.host.unloadDistance,
        );
    }

    getControls(): Schema {
        return {};
    }

    queueLoadMap(mapX: number, mapY: number): void {}

    handleInput(deltaTime: number) {
        if (this.host.isEditorInputSuspended()) {
            return;
        }
        this.handleKeyInput(deltaTime);
        this.handleMouseInput();
        this.handleJoystickInput(deltaTime);
    }

    handleKeyInput(deltaTime: number) {
        const deltaTimeSec = deltaTime / 1000;

        const host = this.host;
        const camera = host.camera;
        const suppressedCameraKeys = runEditorToolKeyBindings(host);
        const vc = host.getViewerControlSettings();

        let cameraSpeedMult = 1.0;
        if (
            isEditorToolKeybindHeld(
                host,
                coreViewerBindingKey("speed-boost"),
                coreViewerDefaultChords("speed-boost"),
            )
        ) {
            cameraSpeedMult = 10.0;
        }
        if (
            isEditorToolKeybindHeld(
                host,
                coreViewerBindingKey("speed-slow"),
                coreViewerDefaultChords("speed-slow"),
            )
        ) {
            cameraSpeedMult = 0.1;
        }

        const deltaPitch = 64 * 5 * deltaTimeSec;
        const deltaYaw = 64 * 5 * deltaTimeSec;

        const kb = coreViewerBindingKey;
        const def = coreViewerDefaultChords;

        const lookSup = (id: string) =>
            isEditorToolBindingSuppressedThisFrame(host, kb(id), def(id), suppressedCameraKeys);

        if (isEditorToolKeybindHeld(host, kb("look-up"), def("look-up")) && !lookSup("look-up")) {
            camera.updatePitch(camera.pitch, deltaPitch);
        }
        if (isEditorToolKeybindHeld(host, kb("look-down"), def("look-down")) && !lookSup("look-down")) {
            camera.updatePitch(camera.pitch, -deltaPitch);
        }
        if (isEditorToolKeybindHeld(host, kb("look-right"), def("look-right")) && !lookSup("look-right")) {
            camera.updateYaw(camera.yaw, deltaYaw);
        }
        if (isEditorToolKeybindHeld(host, kb("look-left"), def("look-left")) && !lookSup("look-left")) {
            camera.updateYaw(camera.yaw, -deltaYaw);
        }

        let deltaX = 0;
        let deltaY = 0;
        let deltaZ = 0;

        const kMul = vc.keyboardMoveSpeed;
        const deltaPos = 16 * cameraSpeedMult * kMul * deltaTimeSec;
        const deltaHeight = 8 * cameraSpeedMult * kMul * deltaTimeSec;

        const moveSup = (id: string) =>
            isEditorToolBindingSuppressedThisFrame(host, kb(id), def(id), suppressedCameraKeys);

        if (isEditorToolKeybindHeld(host, kb("move-forward"), def("move-forward")) && !moveSup("move-forward")) {
            deltaZ -= deltaPos;
        }
        if (isEditorToolKeybindHeld(host, kb("move-back"), def("move-back")) && !moveSup("move-back")) {
            deltaZ += deltaPos;
        }
        if (isEditorToolKeybindHeld(host, kb("move-left"), def("move-left")) && !moveSup("move-left")) {
            deltaX += deltaPos;
        }
        if (isEditorToolKeybindHeld(host, kb("move-right"), def("move-right")) && !moveSup("move-right")) {
            deltaX -= deltaPos;
        }
        if (isEditorToolKeybindHeld(host, kb("move-up"), def("move-up")) && !moveSup("move-up")) {
            deltaY -= deltaHeight;
        }
        if (isEditorToolKeybindHeld(host, kb("move-down"), def("move-down")) && !moveSup("move-down")) {
            deltaY += deltaHeight;
        }

        if (deltaX !== 0 || deltaZ !== 0) {
            camera.move(deltaX, 0, deltaZ);
        }
        if (deltaY !== 0) {
            camera.move(0, deltaY, 0);
        }

        const zoomSup = (id: string) =>
            isEditorToolBindingSuppressedThisFrame(host, kb(id), def(id), suppressedCameraKeys);
        let zoomed = false;
        const zoomMul = vc.mouseWheelZoomSensitivity;
        if (isEditorToolKeybindHeld(host, kb("zoom-in"), def("zoom-in")) && !zoomSup("zoom-in")) {
            if (camera.projectionType === ProjectionType.PERSPECTIVE) {
                camera.fov = clamp(camera.fov - 90 * deltaTimeSec * zoomMul, 30, 140);
            } else {
                camera.orthoZoom = clamp(camera.orthoZoom + 18 * deltaTimeSec * zoomMul, 1, 60);
            }
            zoomed = true;
        }
        if (isEditorToolKeybindHeld(host, kb("zoom-out"), def("zoom-out")) && !zoomSup("zoom-out")) {
            if (camera.projectionType === ProjectionType.PERSPECTIVE) {
                camera.fov = clamp(camera.fov + 90 * deltaTimeSec * zoomMul, 30, 140);
            } else {
                camera.orthoZoom = clamp(camera.orthoZoom - 18 * deltaTimeSec * zoomMul, 1, 60);
            }
            zoomed = true;
        }
        if (zoomed) {
            camera.updated = true;
        }
    }

    handleMouseInput() {
        const h = this.host;
        const inputManager = h.inputManager;
        const camera = h.camera;
        const vc = h.getViewerControlSettings();

        const wheelDelta = inputManager.mouseWheelDeltaY;
        const paintMods = getActivePaintModifiers(h);
        const ctrlReservesWheelForBrush =
            paintMods.controlWheelAdjustsBrushSize && inputManager.isControlDown();
        if (vc.mouseWheelZoomEnabled && wheelDelta !== 0 && !ctrlReservesWheelForBrush) {
            const zoomDirection = Math.sign(wheelDelta);
            const zoomSteps = clamp(Math.round(Math.abs(wheelDelta) / 80), 1, 6) * vc.mouseWheelZoomSensitivity;
            if (camera.projectionType === ProjectionType.PERSPECTIVE) {
                camera.fov = clamp(camera.fov + zoomDirection * zoomSteps * 2, 30, 140);
            } else {
                camera.orthoZoom = clamp(camera.orthoZoom + zoomDirection * zoomSteps, 1, 60);
            }
            camera.updated = true;
        }

        const deltaMouseX = inputManager.getDeltaMouseX();
        const deltaMouseY = inputManager.getDeltaMouseY();

        const tileFlagsLeftPaint =
            h.getEditorTool() === "tile-flags" &&
            h.isEditorToolPluginEnabled("tile-flags") &&
            inputManager.isKeyDown("MouseLeft");

        if (vc.mouseCameraEnabled && !tileFlagsLeftPaint && (deltaMouseX !== 0 || deltaMouseY !== 0)) {
            if (inputManager.isTouch) {
                camera.move(0, clamp(-deltaMouseY, -100, 100) * 0.004, 0);
            } else if (h.viewMode === "2d" && camera.projectionType === ProjectionType.ORTHO) {
                const panScale = camera.orthoZoom * 0.035 * vc.mousePanSensitivity;
                camera.move(deltaMouseX * panScale, 0, deltaMouseY * panScale);
            } else {
                const sens = 0.9 * vc.mouseLookSensitivity;
                camera.updatePitch(camera.pitch, deltaMouseY * sens);
                camera.updateYaw(camera.yaw, deltaMouseX * -sens);
            }
        }
    }

    handleJoystickInput(deltaTime: number) {
        const deltaTimeSec = deltaTime / 1000;

        const inputManager = this.host.inputManager;
        const camera = this.host.camera;

        const deltaPitch = 64 * 5 * deltaTimeSec;
        const deltaYaw = 64 * 5 * deltaTimeSec;

        // joystick controls
        const positionJoystickEvent = inputManager.positionJoystickEvent;
        const cameraJoystickEvent = inputManager.cameraJoystickEvent;

        if (positionJoystickEvent) {
            const moveX = positionJoystickEvent.x ?? 0;
            const moveY = positionJoystickEvent.y ?? 0;

            camera.move(moveX * 32 * -deltaTimeSec, 0, moveY * 32 * -deltaTimeSec);
        }

        if (cameraJoystickEvent) {
            const moveX = cameraJoystickEvent.x ?? 0;
            const moveY = cameraJoystickEvent.y ?? 0;
            camera.updatePitch(camera.pitch, deltaPitch * 1.5 * moveY);
            camera.updateYaw(camera.yaw, deltaYaw * 1.5 * moveX);
        }
    }

    override onFrameEnd(): void {
        super.onFrameEnd();

        if (window.wallpaperFpsLimit !== undefined) {
            this.fpsLimit = window.wallpaperFpsLimit;
        }

        if (this.host.camera.updated) {
            this.host.updateSearchParams();
        }

        this.host.inputManager.onFrameEnd();
        this.host.camera.onFrameEnd();
    }
}
