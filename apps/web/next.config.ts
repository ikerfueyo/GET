import type { NextConfig } from 'next';

const config: NextConfig = {
  // the shared engine ships as TypeScript source
  transpilePackages: ['@get/shared'],
};

export default config;
