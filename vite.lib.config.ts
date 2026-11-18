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
        core: resolve(import.meta.dirname, 'src/core-entry.ts'),
        'browser-env': resolve(import.meta.dirname, 'src/browser-env.ts'),
        'vite-plugin/index': resolve(import.meta.dirname, 'src/vite-plugin/index.ts'),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'vite', 'node:child_process', 'node:fs', 'node:path', 'node:url'],
      output: {
        // The kernel becomes a shared, stable-named chunk: `dist/kernel.js` is
        // imported by both the index entry and the ./core entry (whose thin
        // `dist/core.js` shell re-exports it) — no content-hashed fragments
        // between releases. Named 'kernel' to avoid clashing with the 'core'
        // entry name, which Rollup would otherwise dedupe by renaming.
        manualChunks: (id) => {
          if (id.includes('/src/core/')) return 'kernel';
          return undefined;
        },
        chunkFileNames: '[name].js',
      },
    },
  },
});
