import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import { Toaster } from "../components/ui/sonner";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "OpenRune - Editor",
    template: "%s · OpenRune - Editor",
  },
  description: "OpenRune map editor shell.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/favicon.svg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/runescape/RuneScape-Plain-11.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/runescape/RuneScape-Plain-12.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/runescape/RuneScape-Bold-12.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${inter.variable} ${cinzel.variable} theme-default full-width-content font-sans antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
