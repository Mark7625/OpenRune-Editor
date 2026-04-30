import React from "react";

import { cn } from "../../../util/cn";

export function Sygnet({
    className,
    alt = "",
    ...props
}: React.ComponentPropsWithoutRef<"img">): JSX.Element {
    return (
        <img
            src="/brand/map-editor-logo-small.svg"
            alt={alt}
            decoding="async"
            className={cn("object-contain", className)}
            {...props}
        />
    );
}
