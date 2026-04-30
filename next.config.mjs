/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/caches/:path*",
        destination: "/api/caches/:path*",
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(glsl|vert|frag|vs|fs)$/,
      use: ["ts-shader-loader"],
    });

    config.module.rules.push({
      resourceQuery: /source/,
      type: "asset/source",
    });

    config.module.rules.push({
      resourceQuery: /url/,
      type: "asset/resource",
    });

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config;
  },
};

export default nextConfig;
