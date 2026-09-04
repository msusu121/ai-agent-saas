import type { NextConfig } from 'next';

const apiOrigin = process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:4400';
const cpanelExport = process.env.CPANEL_STATIC_EXPORT === '1';

const nextConfig: NextConfig = cpanelExport
  ? {
      output: 'export',
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {
      async rewrites() {
        return [
          {
            source: '/api/:path*',
            destination: `${apiOrigin}/api/:path*`,
          },
        ];
      },
    };

export default nextConfig;
