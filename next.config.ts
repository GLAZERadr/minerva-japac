import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Firebase Hosting (classic).
  // `npm run build` outputs to `out/` which is deployed via firebase.json `public: out`.
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: false,
};

export default nextConfig;
