import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // The API lives at the same origin under /api so the session cookie just works.
    // In production a reverse proxy (Caddy) does the same mapping.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: { target: 'es2022' },
});
