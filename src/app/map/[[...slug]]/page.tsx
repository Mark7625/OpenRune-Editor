import dynamic from "next/dynamic";

const LegacySpaRoot = dynamic(
  () => import("../../../components/LegacySpaRoot").then((m) => m.LegacySpaRoot),
  {
    ssr: false,
  },
);

/**
 * Covers /map, /map/viewer, /map/editor, etc. so deep links and reloads hit the SPA
 * instead of a Next.js 404 (client routing alone only works after /map is loaded).
 */
export default function MapSpaPage() {
  return <LegacySpaRoot />;
}
