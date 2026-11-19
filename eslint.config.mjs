// Compatibility lint (ADR "Built with React": the last 2 versions of Chrome, Edge and Opera,
// package.json "browserslist"): eslint-plugin-compat fails on a web API one of them lacks.
import compat from 'eslint-plugin-compat';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['node_modules/**', '.next*/**', 'reports/**', 'test-results/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  compat.configs['flat/recommended'],
  // What the build polyfills: nothing.
  { settings: { polyfills: [] } },
];
