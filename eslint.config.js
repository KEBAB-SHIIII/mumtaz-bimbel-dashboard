import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const FORBIDDEN_UI_LIBRARIES = [
  { name: 'flowbite', message: 'Dilarang (CLAUDE.md §3). Gunakan Headless UI + komponen internal.' },
  { name: 'flowbite-react', message: 'Dilarang (CLAUDE.md §3). Gunakan Headless UI + komponen internal.' },
  { name: 'daisyui', message: 'Dilarang (CLAUDE.md §3). Gunakan Headless UI + komponen internal.' },
  { name: 'antd', message: 'Dilarang (CLAUDE.md §3). Gunakan Headless UI + komponen internal.' },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'backend/drizzle/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['backend/**/*.ts', 'packages/**/*.ts', '*.js', 'frontend/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // API aplikasi wajib lewat frontend/src/lib/api-client.ts (Axios).
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Gunakan apiClient dari src/lib/api-client.ts, bukan native fetch.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'fetch', message: 'Gunakan apiClient, bukan native fetch.' },
        { object: 'globalThis', property: 'fetch', message: 'Gunakan apiClient, bukan native fetch.' },
        { object: 'window', property: 'localStorage', message: 'Jangan simpan credential/session di localStorage.' },
        { object: 'globalThis', property: 'localStorage', message: 'Jangan simpan credential/session di localStorage.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...FORBIDDEN_UI_LIBRARIES,
            { name: 'react-router-dom', message: 'Gunakan paket `react-router` (v7).' },
          ],
          patterns: [
            { group: ['@mui/*', '@shadcn/*', 'shadcn*', 'flowbite*', 'daisyui*', 'antd/*', '@ant-design/*'], message: 'UI kit ini dilarang (CLAUDE.md §3).' },
          ],
        },
      ],
    },
  },
);
