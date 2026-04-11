import eslint from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  eslint.configs.recommended,
  prettierPlugin.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/', 'build/', '.next/', 'out/'],
  }
];