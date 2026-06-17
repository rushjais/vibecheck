import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root — a stray lockfile in a parent dir was causing
  // Next 15 to infer the wrong root (and a /_document collect error).
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
