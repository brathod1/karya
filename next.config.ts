import type { NextConfig } from "next";

/**
 * Baseline response headers for every route.
 *
 * No Content-Security-Policy here: Next's inline bootstrap scripts need nonces
 * to work under a strict policy, which is its own change. The attachment route
 * sets a sandboxing CSP on the files it serves.
 */
const securityHeaders = [
  // Nobody can frame the app to trick a click; same-origin framing still works.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Receipt photos come through the file picker; nothing else needs a sensor.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Kept under Vercel's 4.5 MB serverless request-body cap; see MAX_UPLOAD_BYTES.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // No component uses next/image. Allowing every remote host turned the image
  // optimiser into an open proxy, so no remote hosts are allowed at all.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
