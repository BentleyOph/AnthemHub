import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const storagePatterns = (() => {
  if (!supabaseUrl) {
    return [];
  }

  try {
    const { protocol, hostname, port } = new URL(supabaseUrl);
    const normalizedProtocol = protocol.replace(":", "") as "http" | "https";

    return [
      {
        protocol: normalizedProtocol,
        hostname,
        port,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: normalizedProtocol,
        hostname,
        port,
        pathname: "/storage/v1/object/sign/**",
      },
    ];
  } catch (error) {
    console.warn("Invalid NEXT_PUBLIC_SUPABASE_URL; image remote patterns skipped.", error);
    return [];
  }
})();

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: storagePatterns,
  },
};

export default nextConfig;
