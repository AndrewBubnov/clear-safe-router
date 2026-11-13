export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'src/routeTree.gen.ts', '.research/**'] },
  {
    files: ['**/*.{js,mjs}'],
    rules: {
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
    },
  },
];
