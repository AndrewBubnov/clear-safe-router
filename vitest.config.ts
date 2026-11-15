import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^typed-router$/, replacement: '/src/index.tsx' },
      { find: /^typed-router\/(.+)$/, replacement: '/src/$1' },
      { find: /^@\/(.+)$/, replacement: '/playground/$1' },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'playground/**/*.test.tsx', 'tests/integration/**/*.test.tsx'],
  },
});
