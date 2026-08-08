import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ['10.153.82.37'],
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['@paper-design/shaders-react'],
  },
};

export default nextConfig;