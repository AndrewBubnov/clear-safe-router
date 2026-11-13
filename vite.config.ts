import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { typedRouter } from './src/vite-plugin';

export default defineConfig({
  plugins: [react(), typedRouter()],
  server: {
    open: '/playground/',
  },
  resolve: {
    alias: {
      'typed-router': '/src/index.ts',
      'typed-router/*': '/src/*',
    },
  },
});