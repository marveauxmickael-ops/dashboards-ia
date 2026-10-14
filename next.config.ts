import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Landing page : l'aperçu produit est calculé sur le fichier de démonstration (données fictives).
  outputFileTracingIncludes: {
    "/": ["./public/demo/ventes-demo.csv"],
  },
  // Pages de partage : le jeton figure dans l'URL, il ne doit ni fuiter vers d'autres sites ni être indexé.
  async headers() {
    return [
      {
        source: "/partage/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
