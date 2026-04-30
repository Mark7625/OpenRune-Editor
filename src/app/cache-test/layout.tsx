import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cache repository",
};

export default function CacheTestLayout({ children }: { children: ReactNode }) {
  return children;
}
