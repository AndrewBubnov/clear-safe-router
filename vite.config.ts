import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { clearSafeRouter } from './src/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    clearSafeRouter({
      routesDirectory: 'playground/routes',
      generatedFile: 'playground/routeTree.gen.ts',
    }),
  ],
  server: {
    open: '/playground/',
  },
  build: {
    // Keep playground output out of the library's dist/ (published via `files`).
    outDir: 'dist-playground',
  },
  resolve: {
    alias: [
      { find: /^clear-safe-router$/, replacement: '/src/index.tsx' },
      { find: /^clear-safe-router\/(.+)$/, replacement: '/src/$1' },
      { find: /^@\/(.+)$/, replacement: '/playground/$1' },
    ],
  },
});
