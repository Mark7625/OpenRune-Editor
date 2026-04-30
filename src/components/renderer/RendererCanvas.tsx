import { useEffect, useRef } from "react";

import { Renderer } from "./Renderer";

export interface RendererCanvasProps {
    renderer: Renderer;
}

export function RendererCanvas({ renderer }: RendererCanvasProps): JSX.Element {
    const divRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = divRef.current;
        if (!host) {
            return;
        }
        host.appendChild(renderer.canvas);

        renderer.init().then(() => {
            renderer.start();
        });

        const resizeObserver = new ResizeObserver(() => {
            // Renderer frame loop resizes the backing canvas, this nudges an immediate pass
            // when parent layout changes (sidebar collapse, viewport changes, etc).
            renderer.onResize(renderer.canvas.width, renderer.canvas.height);
        });
        resizeObserver.observe(host);

        return () => {
            resizeObserver.disconnect();
            renderer.stop();
            host.removeChild(renderer.canvas);
        };
    }, [renderer]);

    return <div ref={divRef} className="renderer-canvas h-full w-full" tabIndex={0} />;
}
