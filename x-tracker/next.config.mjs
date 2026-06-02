/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // better-sqlite3 is a native module; keep it external to the server bundle
    // so Next/webpack doesn't try to bundle the prebuilt .node binary.
    serverComponentsExternalPackages: ["better-sqlite3"],
    // Enable src/instrumentation.ts so the poller starts at server boot.
    instrumentationHook: true,
  },
};

export default nextConfig;
