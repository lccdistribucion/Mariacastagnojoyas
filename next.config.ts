import type { NextConfig } from "next";

const desarrollo = process.env.NODE_ENV !== "production";

/**
 * Política de contenido: la página solo carga código, estilos, fotos y conexiones del propio sistema.
 * En desarrollo Next necesita "eval" y websockets para recargar solo.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${desarrollo ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Acceso desde celulares/tablets del local (misma red wifi) en modo desarrollo.
const redLocal = ["192.168.*.*", "10.*.*.*", ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`)];

const nextConfig: NextConfig = {
  allowedDevOrigins: redLocal,
  poweredByHeader: false,
  serverExternalPackages: ["@libsql/client", "exceljs", "sharp", "bwip-js"],
  // Planillas de importación de hasta ~8 MB (las fotos se suben por la API, sin este límite).
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
