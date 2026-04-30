import React from "react";

import { cn } from "../../../util/cn";

export function MapEditorLogoBig({
    className,
    alt = "",
    ...props
}: React.ComponentPropsWithoutRef<"img">): JSX.Element {
    return (
        <img
            src="/brand/map-editor-logo-big.svg"
            alt={alt}
            decoding="async"
            className={cn("object-contain", className)}
            {...props}
        />
    );
}
