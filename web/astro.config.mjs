import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel/serverless';

const isVercel = process.env.VERCEL === '1';

export default defineConfig({
  output: 'server',
  adapter: isVercel ? vercel({ maxDuration: 60 }) : node({ mode: 'standalone' }),
  server: { host: true },
  vite: {
    server: {
      allowedHosts: ['.trycloudflare.com']
    }
  }
});
