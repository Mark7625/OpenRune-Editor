import React from "react";

import { cn } from "../../../util/cn";

export function Logo({
    className,
    alt = "OpenRune",
    ...props
}: React.ComponentPropsWithoutRef<"img">): JSX.Element {
    return (
        <img
            src="/brand/asset-5-wordmark.svg"
            alt={alt}
            decoding="async"
            className={cn("object-contain object-left", className)}
            {...props}
        />
    );
}
