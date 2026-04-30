import dynamic from "next/dynamic";

const LegacySpaRoot = dynamic(() => import("../components/LegacySpaRoot").then((m) => m.LegacySpaRoot), {
  ssr: false,
});

export default function HomePage() {
  return <LegacySpaRoot />;
}
