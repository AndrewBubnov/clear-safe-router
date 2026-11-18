import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.tsx'),
        core: resolve(import.meta.dirname, 'src/core/index.ts'),
        'vite-plugin/index': resolve(import.meta.dirname, 'src/vite-plugin/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'vite', 'node:child_process', 'node:fs', 'node:path', 'node:url'],
    },
  },
});
