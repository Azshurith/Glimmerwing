// ESLint flat config: type-aware TypeScript rules for the game, plain JS rules for the
// Node scripts. Formatting is Prettier's job (eslint-config-prettier turns off clashing rules).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'Claude outputs/', 'tools/'] },

  js.configs.recommended,

  // The game (browser, TypeScript, checked against the type information).
  {
    files: ['src/**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Type-only imports are erased at build time and never create runtime cycles.
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // types/ holds shapes only: no runtime code, and it depends on nothing outside itself.
  {
    files: ['src/types/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['../*'], message: 'types/ must not depend on runtime modules.' }] },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > :matches(VariableDeclaration, FunctionDeclaration, ClassDeclaration)',
          message: 'types/ holds interfaces and type aliases only; put runtime code in core/ or a feature folder.',
        },
      ],
    },
  },

  // Build script, relay server and this config (Node).
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
