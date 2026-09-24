import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Phones in the room open captions via the machine's LAN IP (QR code);
// in dev, Next only trusts localhost unless those origins are allowed.
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  transpilePackages: ["@veem/shared"],
  allowedDevOrigins: lanIps,
};

export default nextConfig;
