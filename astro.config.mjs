import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://fileintel.me',
  integrations: [
    tailwind(),
    sitemap({
      serialize(item) {
        const u = new URL(item.url);
        if (u.pathname !== '/') u.pathname = u.pathname.replace(/\/+$/, '');
        item.url = u.toString();
        return item;
      },
    }),
  ],
  server: {
    host: true,
  },
});