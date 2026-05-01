import * as React from "react";

import { cn } from "@/lib/utils";

/** Sprite/texture loading placeholder: muted panel, neutral checker, light sheen. */
export function RspLoadingSlot({
  className,
  style,
  rounded = true,
  decorative = false,
  role = "status",
  ariaLabel = "Loading",
}: {
  className?: string;
  style?: React.CSSProperties;
  /** Match sprite thumb rounding (e.g. `rounded-md`). */
  rounded?: boolean;
  /** Nested under an image: no duplicate live region / busy state. */
  decorative?: boolean;
  role?: "status" | undefined;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cn("rsp-icon-slot", rounded && "rounded-md", className)}
      style={style}
      role={decorative ? undefined : role}
      aria-busy={decorative ? undefined : true}
      aria-label={decorative ? undefined : ariaLabel}
    >
      <span className="rsp-icon-slot-checker pointer-events-none absolute inset-0" aria-hidden />
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
        <span className="rsp-icon-slot-shine-bar" />
      </span>
    </div>
  );
}
