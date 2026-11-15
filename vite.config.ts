import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { typedRouter } from './src/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    typedRouter({
      routesDirectory: 'playground/routes',
      generatedFile: 'playground/routeTree.gen.ts',
    }),
  ],
  server: {
    open: '/playground/',
  },
  resolve: {
    alias: [
      { find: /^typed-router$/, replacement: '/src/index.tsx' },
      { find: /^typed-router\/(.+)$/, replacement: '/src/$1' },
      { find: /^@\/(.+)$/, replacement: '/playground/$1' },
    ],
  },
});
