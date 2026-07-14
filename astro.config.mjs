import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  site: 'https://fileintel.me',
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
  integrations: [
    tailwind(),
    sitemap(),
  ],
  server: {
    host: true,
  },
});