import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@socio/llm', '@socio/agents', '@socio/db', '@socio/ifood-client'],
};

export default nextConfig;
