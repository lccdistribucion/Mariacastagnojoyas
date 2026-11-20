import type { Metadata, Viewport } from "next";
import "@fontsource-variable/montserrat";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "María Castagno · Gestión", template: "%s · María Castagno" },
  description: "Sistema de gestión de la joyería María Castagno",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#151413",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
