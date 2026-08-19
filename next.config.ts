import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kept under Vercel's 4.5 MB serverless request-body cap; see MAX_UPLOAD_BYTES.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
