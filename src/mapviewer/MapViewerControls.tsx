import { vec3 } from "gl-matrix";
import { ReactNode, memo, useEffect, useMemo, useState } from "react";

import { lerp, slerp } from "../util/MathUtil";
import { CameraView, ProjectionType } from "./Camera";
import { MapViewerRenderer } from "./MapViewerRenderer";
import {
    MapViewerRendererType,
    createRenderer,
    getAvailableRenderers,
    getRendererName,
} from "./MapViewerRenderers";

interface MapViewerControlsProps {
    renderer: MapViewerRenderer;
    hideUi: boolean;
    setRenderer: (renderer: MapViewerRenderer) => void;
    setHideUi: (hideUi: boolean | ((hideUi: boolean) => boolean)) => void;
}

enum VarType {
    VARP = 0,
    VARBIT = 1,
}

type SectionKey = "camera" | "render" | "vars" | "record";

export const MapViewerControls = memo(
    ({ renderer, hideUi: hidden, setRenderer, setHideUi }: MapViewerControlsProps): JSX.Element => {
        const mapViewer = renderer.mapViewer;
        const [projectionType, setProjectionType] = useState<ProjectionType>(mapViewer.camera.projectionType);
        const [fov, setFov] = useState(mapViewer.camera.fov);
        const [orthoZoom, setOrthoZoom] = useState(mapViewer.camera.orthoZoom);
        const [cameraSpeed, setCameraSpeed] = useState(mapViewer.cameraSpeed);
        const [renderDistance, setRenderDistance] = useState(mapViewer.renderDistance);
        const [unloadDistance, setUnloadDistance] = useState(mapViewer.unloadDistance);
        const [lodDistance, setLodDistance] = useState(mapViewer.lodDistance);
        const [varType, setVarType] = useState<VarType>(VarType.VARBIT);
        const [varId, setVarId] = useState(0);
        const [varValue, setVarValue] = useState(0);
        const [animationDuration, setAnimationDuration] = useState(10);
        const [cameraPoints, setCameraPoints] = useState<CameraView[]>([]);
        const [isCameraRunning, setCameraRunning] = useState(false);
        const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
            camera: true,
            render: false,
            vars: false,
            record: false,
        });

        const rendererOptions = useMemo(() => {
            const options: { label: string; value: MapViewerRendererType }[] = [];
            for (const type of getAvailableRenderers()) {
                options.push({ label: getRendererName(type), value: type });
            }
            return options;
        }, [renderer.type]);

        useEffect(() => {
            setProjectionType(mapViewer.camera.projectionType);
            setFov(mapViewer.camera.fov);
            setOrthoZoom(mapViewer.camera.orthoZoom);
            setCameraSpeed(mapViewer.cameraSpeed);
            setRenderDistance(mapViewer.renderDistance);
            setUnloadDistance(mapViewer.unloadDistance);
            setLodDistance(mapViewer.lodDistance);
        }, [mapViewer]);

        useEffect(() => {
            const onKeyDown = (e: KeyboardEvent) => {
                if (e.repeat) return;
                switch (e.key) {
                    case "F1":
                        setHideUi((v) => !v);
                        break;
                    case "F2":
                        setCameraRunning((v) => !v);
                        break;
                    case "F3":
                        setCameraPoints((pts) => [
                            ...pts,
                            {
                                position: vec3.fromValues(
                                    mapViewer.camera.pos[0],
                                    mapViewer.camera.pos[1],
                                    mapViewer.camera.pos[2],
                                ),
                                pitch: mapViewer.camera.pitch,
                                yaw: mapViewer.camera.yaw,
                                fov: mapViewer.camera.fov,
                                orthoZoom: mapViewer.camera.orthoZoom,
                            },
                        ]);
                        break;
                    case "F4":
                        setCameraPoints((pts) => pts.slice(0, pts.length - 1));
                        break;
                }
            };
            document.addEventListener("keydown", onKeyDown);
            return () => document.removeEventListener("keydown", onKeyDown);
        }, [mapViewer, setHideUi]);

        useEffect(() => {
            if (!isCameraRunning) {
                return;
            }
            const segmentCount = cameraPoints.length - 1;
            if (segmentCount <= 0) {
                setCameraRunning(false);
                return;
            }
            let animationId = -1;
            let start: number | undefined;
            const animate = (time: DOMHighResTimeStamp) => {
                if (start === undefined) {
                    start = time;
                }
                const elapsed = time - start;
                const overallProgress = elapsed / (animationDuration * 1000);
                const startIndex = Math.floor(overallProgress * segmentCount);
                const endIndex = startIndex + 1;
                const from = cameraPoints[startIndex];
                const to = cameraPoints[endIndex];
                const localProgress = (overallProgress * segmentCount) % 1;
                if (elapsed > animationDuration * 1000 || !to) {
                    setCameraRunning(false);
                    mapViewer.setCamera(cameraPoints[cameraPoints.length - 1]);
                    return;
                }
                mapViewer.setCamera({
                    position: vec3.fromValues(
                        lerp(from.position[0], to.position[0], localProgress),
                        lerp(from.position[1], to.position[1], localProgress),
                        lerp(from.position[2], to.position[2], localProgress),
                    ),
                    pitch: lerp(from.pitch, to.pitch, localProgress),
                    yaw: slerp(from.yaw, to.yaw, localProgress, 2048),
                    fov: lerp(from.fov, to.fov, localProgress),
                    orthoZoom: lerp(from.orthoZoom, to.orthoZoom, localProgress),
                });
                animationId = requestAnimationFrame(animate);
            };
            animationId = requestAnimationFrame(animate);
            return () => cancelAnimationFrame(animationId);
        }, [animationDuration, cameraPoints, isCameraRunning, mapViewer]);

        if (hidden) {
            return <></>;
        }

        return (
            <div className="map-controls-panel flex h-full max-h-full min-h-0 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">Map Controls</p>
                    <button
                        type="button"
                        className="rounded-md border border-input px-1.5 py-0.5 text-[10px] hover:bg-background"
                        onClick={() => setHideUi((v) => !v)}
                    >
                        Hide UI
                    </button>
                </div>

                <div className="map-controls-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2 text-[11px]">
                        <Section
                            title="Camera"
                            isOpen={openSections.camera}
                            onToggle={() =>
                                setOpenSections((v) => ({
                                    ...v,
                                    camera: !v.camera,
                                }))
                            }
                        >
                        <>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Projection</span>
                                <select
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                    value={projectionType}
                                    onChange={(e) => {
                                        const type = Number(e.target.value) as ProjectionType;
                                        mapViewer.camera.setProjectionType(type);
                                        setProjectionType(type);
                                    }}
                                >
                                    <option value={ProjectionType.PERSPECTIVE}>Perspective</option>
                                    <option value={ProjectionType.ORTHO}>Ortho</option>
                                </select>
                            </label>
                            {projectionType === ProjectionType.PERSPECTIVE ? (
                                <label className="block space-y-1">
                                    <span className="text-muted-foreground">FOV ({fov})</span>
                                    <input
                                        type="range"
                                        min={30}
                                        max={140}
                                        step={1}
                                        value={fov}
                                        onChange={(e) => {
                                            const next = parseInt(e.target.value, 10);
                                            setFov(next);
                                            mapViewer.camera.fov = next;
                                            mapViewer.camera.updated = true;
                                        }}
                                        className="w-full"
                                    />
                                </label>
                            ) : (
                                <label className="block space-y-1">
                                    <span className="text-muted-foreground">Ortho Zoom ({orthoZoom})</span>
                                    <input
                                        type="range"
                                        min={1}
                                        max={60}
                                        step={1}
                                        value={orthoZoom}
                                        onChange={(e) => {
                                            const next = parseInt(e.target.value, 10);
                                            setOrthoZoom(next);
                                            mapViewer.camera.orthoZoom = next;
                                            mapViewer.camera.updated = true;
                                        }}
                                        className="w-full"
                                    />
                                </label>
                            )}
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Camera Speed ({cameraSpeed.toFixed(1)})</span>
                                <input
                                    type="range"
                                    min={0.1}
                                    max={5}
                                    step={0.1}
                                    value={cameraSpeed}
                                    onChange={(e) => {
                                        const next = parseFloat(e.target.value);
                                        setCameraSpeed(next);
                                        mapViewer.cameraSpeed = next;
                                    }}
                                    className="w-full"
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Render Distance ({renderDistance})</span>
                                <input
                                    type="range"
                                    min={16}
                                    max={2000}
                                    step={16}
                                    value={renderDistance}
                                    onChange={(e) => {
                                        const next = parseInt(e.target.value, 10);
                                        setRenderDistance(next);
                                        mapViewer.renderDistance = next;
                                    }}
                                    className="w-full"
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Unload Distance ({unloadDistance})</span>
                                <input
                                    type="range"
                                    min={1}
                                    max={30}
                                    step={2}
                                    value={unloadDistance}
                                    onChange={(e) => {
                                        const next = parseInt(e.target.value, 10);
                                        setUnloadDistance(next);
                                        mapViewer.unloadDistance = next;
                                    }}
                                    className="w-full"
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Lod Distance ({lodDistance})</span>
                                <input
                                    type="range"
                                    min={0}
                                    max={30}
                                    step={2}
                                    value={lodDistance}
                                    onChange={(e) => {
                                        const next = parseInt(e.target.value, 10);
                                        setLodDistance(next);
                                        mapViewer.lodDistance = next;
                                    }}
                                    className="w-full"
                                />
                            </label>
                        </>
                        </Section>
                        <Section
                            title="Render"
                            isOpen={openSections.render}
                            onToggle={() =>
                                setOpenSections((v) => ({
                                    ...v,
                                    render: !v.render,
                                }))
                            }
                        >
                        <>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Renderer</span>
                                <select
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                    value={renderer.type}
                                    onChange={(e) => {
                                        const v = e.target.value as MapViewerRendererType;
                                        if (renderer.type !== v) {
                                            const next = createRenderer(v, mapViewer);
                                            mapViewer.setRenderer(next);
                                            setRenderer(next);
                                        }
                                    }}
                                >
                                    {rendererOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">FPS Limit</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={999}
                                    defaultValue={renderer.fpsLimit}
                                    onChange={(e) => (renderer.fpsLimit = parseInt(e.target.value || "60", 10))}
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                />
                            </label>
                        </>
                        </Section>
                        <Section
                            title="Vars"
                            isOpen={openSections.vars}
                            onToggle={() =>
                                setOpenSections((v) => ({
                                    ...v,
                                    vars: !v.vars,
                                }))
                            }
                        >
                        <>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Type</span>
                                <select
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                    value={varType}
                                    onChange={(e) => setVarType(Number(e.target.value) as VarType)}
                                >
                                    <option value={VarType.VARP}>Varplayer</option>
                                    <option value={VarType.VARBIT}>Varbit</option>
                                </select>
                            </label>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Id</span>
                                <input
                                    type="number"
                                    value={varId}
                                    onChange={(e) => setVarId(parseInt(e.target.value || "0", 10))}
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Value</span>
                                <input
                                    type="number"
                                    value={varValue}
                                    onChange={(e) => setVarValue(parseInt(e.target.value || "0", 10))}
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted"
                                    onClick={() => {
                                        const varManager = mapViewer.varManager;
                                        const updated =
                                            varType === VarType.VARP
                                                ? varManager.setVarp(varId, varValue)
                                                : varManager.setVarbit(varId, varValue);
                                        if (updated) {
                                            mapViewer.updateVars();
                                            mapViewer.renderer.mapManager.clearMaps();
                                        }
                                    }}
                                >
                                    Set
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted"
                                    onClick={() => {
                                        mapViewer.varManager.clear();
                                        mapViewer.updateVars();
                                        mapViewer.renderer.mapManager.clearMaps();
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        </>
                        </Section>
                        <Section
                            title="Record"
                            isOpen={openSections.record}
                            onToggle={() =>
                                setOpenSections((v) => ({
                                    ...v,
                                    record: !v.record,
                                }))
                            }
                        >
                        <>
                            <label className="block space-y-1">
                                <span className="text-muted-foreground">Path Length (seconds)</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={animationDuration}
                                    onChange={(e) => setAnimationDuration(parseInt(e.target.value || "10", 10))}
                                    className="h-8 w-full rounded-md border border-input bg-background px-2"
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    className="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted"
                                    onClick={() =>
                                        setCameraPoints((pts) => [
                                            ...pts,
                                            {
                                                position: vec3.fromValues(
                                                    mapViewer.camera.pos[0],
                                                    mapViewer.camera.pos[1],
                                                    mapViewer.camera.pos[2],
                                                ),
                                                pitch: mapViewer.camera.pitch,
                                                yaw: mapViewer.camera.yaw,
                                                fov: mapViewer.camera.fov,
                                                orthoZoom: mapViewer.camera.orthoZoom,
                                            },
                                        ])
                                    }
                                >
                                    Add (F3)
                                </button>
                                <button
                                    type="button"
                                    className="rounded-md border border-input bg-background px-3 py-2 hover:bg-muted"
                                    onClick={() => setCameraPoints((pts) => pts.slice(0, pts.length - 1))}
                                >
                                    Del Last (F4)
                                </button>
                            </div>
                            <button
                                type="button"
                                className="w-full rounded-md border border-input bg-background px-3 py-2 hover:bg-muted"
                                onClick={() => setCameraRunning((v) => !v)}
                            >
                                {isCameraRunning ? "Stop (F2)" : "Start (F2)"}
                            </button>
                            <div className="space-y-2">
                                {cameraPoints.map((point, i) => (
                                    <div
                                        key={`${point.position[0]}-${point.position[1]}-${point.position[2]}-${i}`}
                                        className="rounded-md border border-input bg-background p-2"
                                    >
                                        <p className="mb-2 text-[11px] text-muted-foreground">Point {i + 1}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                className="rounded-md border border-input px-2 py-1 hover:bg-muted"
                                                onClick={() => mapViewer.setCamera(point)}
                                            >
                                                Teleport
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-input px-2 py-1 hover:bg-muted"
                                                onClick={() =>
                                                    setCameraPoints((pts) => pts.filter((_, idx) => idx !== i))
                                                }
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                        </Section>
                    </div>
            </div>
        );
    },
);

interface SectionProps {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
}

function Section({ title, isOpen, onToggle, children }: SectionProps): JSX.Element {
    return (
        <div className="rounded-md border border-border bg-background/60">
            <button
                type="button"
                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-muted/40"
                onClick={onToggle}
            >
                <span>{title}</span>
                <span className="text-[10px] text-muted-foreground">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen ? <div className="space-y-2 border-t border-border p-2">{children}</div> : null}
        </div>
    );
}
