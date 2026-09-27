import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @nevergraph/schemas ships compiled ESM from a workspace package; transpiling it
  // keeps the Zod contracts usable from both server and client bundles.
  transpilePackages: ["@nevergraph/schemas"],
  typedRoutes: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
