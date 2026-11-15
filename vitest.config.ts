import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^clear-safe-router$/, replacement: '/src/index.tsx' },
      { find: /^clear-safe-router\/(.+)$/, replacement: '/src/$1' },
      { find: /^@\/(.+)$/, replacement: '/playground/$1' },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.tsx'],
  },
});
