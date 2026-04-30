import { vec2 } from "gl-matrix";
import { IJoystickUpdateEvent } from "react-joystick-component/build/lib/Joystick";

export function getMousePos(container: HTMLElement, event: MouseEvent | Touch): vec2 {
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return [x, y];
}

function keyboardEventTargetIsEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
    }
    return target.isContentEditable;
}

/** Maps `PointerEvent.button` / `MouseEvent.button` to stable chord codes (same strings stored in `keys`). */
export function mouseButtonToChordCode(button: number): string | null {
    if (button === 0) {
        return "MouseLeft";
    }
    if (button === 1) {
        return "MouseMiddle";
    }
    if (button === 2) {
        return "MouseRight";
    }
    return null;
}

export function getAxisDeadzone(axis: number, zone: number): number {
    if (Math.abs(axis) < zone) {
        return 0;
    } else if (axis < 0) {
        return axis + zone;
    } else {
        return axis - zone;
    }
}

export class InputManager {
    element?: HTMLElement;

    keys: Map<string, boolean> = new Map();

    /** Non-repeating keydown codes this frame; cleared in `onFrameEnd`. */
    keysPressedThisFrame: Set<string> = new Set();

    mouseX: number = -1;
    mouseY: number = -1;

    lastMouseX: number = -1;
    lastMouseY: number = -1;

    dragX: number = -1;
    dragY: number = -1;
    dragButton: number = -1;

    deltaMouseX: number = 0;
    deltaMouseY: number = 0;
    mouseWheelDeltaY: number = 0;

    holdX: number = -1;
    holdY: number = -1;

    /** Per-frame wheel delta (map editor brush size). */
    scrollY: number = 0;

    isTouch: boolean = false;

    pickX: number = -1;
    pickY: number = -1;

    positionJoystickEvent?: IJoystickUpdateEvent;
    cameraJoystickEvent?: IJoystickUpdateEvent;

    gamepadIndex?: number;

    /**
     * When true, ignore hardware events (used while editor settings / blocking UI is open).
     * Clears accumulated key/button state when enabled.
     */
    private inputBlockedForUi = false;

    setInputBlockedForUi(blocked: boolean): void {
        this.inputBlockedForUi = blocked;
        if (blocked) {
            this.keys.clear();
            this.keysPressedThisFrame.clear();
            this.resetMouse();
            this.deltaMouseX = 0;
            this.deltaMouseY = 0;
            this.mouseWheelDeltaY = 0;
            this.scrollY = 0;
            this.pickX = -1;
            this.pickY = -1;
            this.positionJoystickEvent = undefined;
            this.cameraJoystickEvent = undefined;
            this.isTouch = false;
        }
    }

    isInputBlockedForUi(): boolean {
        return this.inputBlockedForUi;
    }

    init(element: HTMLElement) {
        if (!this.element) {
            this.cleanUp();
        }
        this.element = element;

        window.addEventListener("gamepadconnected", this.onGamepadConnected);
        window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);

        element.addEventListener("dblclick", this.onDoubleClick);

        // Window-level keys so Ctrl/Alt/Shift still work while React UI (overlay panel, etc.) has focus.
        window.addEventListener("keydown", this.onKeyDown, true);
        window.addEventListener("keyup", this.onKeyUp, true);
        window.addEventListener("blur", this.onWindowBlur);

        element.addEventListener("mousedown", this.onMouseDown);
        element.addEventListener("mousemove", this.onMouseMove);
        element.addEventListener("mouseup", this.onMouseUp);
        element.addEventListener("mouseleave", this.onMouseLeave);
        element.addEventListener("wheel", this.onWheel, { passive: false });

        element.addEventListener("touchstart", this.onTouchStart);
        element.addEventListener("touchmove", this.onTouchMove);
        element.addEventListener("touchend", this.onTouchEnd);

        element.addEventListener("contextmenu", this.onContextMenu);

        element.addEventListener("focusout", this.onFocusOut);
    }

    cleanUp() {
        if (!this.element) {
            return;
        }

        window.removeEventListener("gamepadconnected", this.onGamepadConnected);
        window.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);

        this.element.removeEventListener("dblclick", this.onDoubleClick);

        window.removeEventListener("keydown", this.onKeyDown, true);
        window.removeEventListener("keyup", this.onKeyUp, true);
        window.removeEventListener("blur", this.onWindowBlur);

        this.element.removeEventListener("mousedown", this.onMouseDown);
        this.element.removeEventListener("mousemove", this.onMouseMove);
        this.element.removeEventListener("mouseup", this.onMouseUp);
        this.element.removeEventListener("mouseleave", this.onMouseLeave);
        this.element.removeEventListener("wheel", this.onWheel);

        this.element.removeEventListener("touchstart", this.onTouchStart);
        this.element.removeEventListener("touchmove", this.onTouchMove);
        this.element.removeEventListener("touchend", this.onTouchEnd);

        this.element.removeEventListener("contextmenu", this.onContextMenu);

        this.element.removeEventListener("focusout", this.onFocusOut);
    }

    isShiftDown(): boolean {
        return this.isKeyDown("ShiftLeft") || this.isKeyDown("ShiftRight");
    }

    isControlDown(): boolean {
        return this.isKeyDown("ControlLeft") || this.isKeyDown("ControlRight");
    }

    isAltDown(): boolean {
        return this.isKeyDown("AltLeft") || this.isKeyDown("AltRight");
    }

    isKeyDown(key: string): boolean {
        return this.keys.has(key);
    }

    isKeyDownEvent(key: string): boolean {
        return !!this.keys.get(key);
    }

    isDragging(): boolean {
        return this.dragX !== -1 && this.dragY !== -1;
    }

    isHolding(): boolean {
        return this.holdX !== -1 && this.holdY !== -1;
    }

    isMiddleDragging(): boolean {
        return this.isDragging() && this.dragButton === 1;
    }

    isPointerLock(): boolean {
        return document.pointerLockElement === this.element;
    }

    isFocused(): boolean {
        return this.mouseX !== -1 && this.mouseY !== -1;
    }

    hasMovedMouse(): boolean {
        return this.lastMouseX !== this.mouseX || this.lastMouseY !== this.mouseY;
    }

    getDeltaMouseX(): number {
        if (this.isPointerLock()) {
            return this.deltaMouseX;
        }
        if (this.isDragging()) {
            return this.dragX - this.mouseX;
        }
        return 0;
    }

    getDeltaMouseY(): number {
        if (this.isPointerLock()) {
            return this.deltaMouseY;
        }
        if (this.isDragging()) {
            return this.dragY - this.mouseY;
        }
        return 0;
    }

    getGamepad(): Gamepad | null {
        let gamepad: Gamepad | null = null;
        if (this.gamepadIndex !== undefined) {
            const gamepads = navigator.getGamepads();
            if (gamepads) {
                gamepad = gamepads[this.gamepadIndex];
            }
        }
        return gamepad;
    }

    private onGamepadConnected = (event: GamepadEvent) => {
        this.gamepadIndex = event.gamepad.index;
    };

    private onGamepadDisconnected = (event: GamepadEvent) => {
        this.gamepadIndex = undefined;
    };

    private onDoubleClick = (event: MouseEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (!document.pointerLockElement && this.element) {
            this.element.requestPointerLock();
        }
    };

    private onKeyDown = (event: KeyboardEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        this.keys.set(event.code, true);
        if (!event.repeat) {
            this.keysPressedThisFrame.add(event.code);
        }
        if (!keyboardEventTargetIsEditable(event.target)) {
            event.preventDefault();
        }
    };

    private onKeyUp = (event: KeyboardEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        this.keys.delete(event.code);
        if (!keyboardEventTargetIsEditable(event.target)) {
            event.preventDefault();
        }
    };

    private onWindowBlur = () => {
        this.keys.clear();
        this.keysPressedThisFrame.clear();
    };

    private onMouseDown = (event: MouseEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (!this.element) {
            return;
        }
        const [x, y] = getMousePos(this.element, event);
        if (event.button === 0 || event.button === 1) {
            this.dragX = x;
            this.dragY = y;
            this.dragButton = event.button;
        } else if (event.button === 2) {
            this.holdX = x;
            this.holdY = y;
        }
        this.mouseX = x;
        this.mouseY = y;
        const buttonCode = mouseButtonToChordCode(event.button);
        if (buttonCode) {
            this.keys.set(buttonCode, true);
            this.keysPressedThisFrame.add(buttonCode);
        }
    };

    private onMouseMove = (event: MouseEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (!this.element) {
            return;
        }
        const [x, y] = getMousePos(this.element, event);
        this.mouseX = x;
        this.mouseY = y;

        if (this.isPointerLock()) {
            this.deltaMouseX -= event.movementX;
            this.deltaMouseY -= event.movementY;
        }
        this.isTouch = false;
    };

    private onMouseUp = (event: MouseEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (event.button === 0 || event.button === 1) {
            if (this.dragButton !== -1 && event.button !== this.dragButton) {
                return;
            }
            this.dragX = -1;
            this.dragY = -1;
            this.dragButton = -1;
        } else if (event.button === 2) {
            this.holdX = -1;
            this.holdY = -1;
        }
        const buttonCode = mouseButtonToChordCode(event.button);
        if (buttonCode) {
            this.keys.delete(buttonCode);
        }
    };

    private onMouseLeave = (event: MouseEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        this.resetMouse();
    };

    private onWheel = (event: WheelEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        event.preventDefault();
        this.mouseWheelDeltaY += event.deltaY;
        this.scrollY += event.deltaY;
    };

    private onTouchStart = (event: TouchEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (!this.element) {
            return;
        }
        const [x, y] = getMousePos(this.element, event.touches[0]);
        this.dragX = x;
        this.dragY = y;
        this.mouseX = x;
        this.mouseY = y;
        this.isTouch = true;
    };

    private onTouchMove = (event: TouchEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (!this.element) {
            return;
        }
        const [x, y] = getMousePos(this.element, event.touches[0]);
        this.mouseX = x;
        this.mouseY = y;
    };

    private onTouchEnd = (event: TouchEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        this.dragX = -1;
        this.dragY = -1;
    };

    private onContextMenu = (event: MouseEvent) => {
        if (this.inputBlockedForUi) {
            return;
        }
        if (!this.element) {
            return;
        }
        event.preventDefault();
        const [x, y] = getMousePos(this.element, event);
        this.pickX = x;
        this.pickY = y;
    };

    onPositionJoystickMove = (event: IJoystickUpdateEvent) => {
        this.positionJoystickEvent = event;
    };

    onPositionJoystickStop = (event: IJoystickUpdateEvent) => {
        this.positionJoystickEvent = undefined;
    };

    onCameraJoystickMove = (event: IJoystickUpdateEvent) => {
        this.cameraJoystickEvent = event;
    };

    onCameraJoystickStop = (event: IJoystickUpdateEvent) => {
        this.cameraJoystickEvent = undefined;
    };

    private onFocusOut = () => {
        this.resetMouse();
    };

    resetMouse() {
        this.mouseX = -1;
        this.mouseY = -1;
        this.dragX = -1;
        this.dragY = -1;
        this.dragButton = -1;
        this.holdX = -1;
        this.holdY = -1;
    }

    onFrameEnd() {
        this.keysPressedThisFrame.clear();
        for (const key of this.keys.keys()) {
            this.keys.set(key, false);
        }
        if (this.isDragging() && !this.isTouch) {
            this.dragX = this.mouseX;
            this.dragY = this.mouseY;
        }
        this.deltaMouseX = 0;
        this.deltaMouseY = 0;
        this.mouseWheelDeltaY = 0;
        this.scrollY = 0;
        this.pickX = -1;
        this.pickY = -1;
        this.lastMouseX = this.mouseX;
        this.lastMouseY = this.mouseY;
    }
}
