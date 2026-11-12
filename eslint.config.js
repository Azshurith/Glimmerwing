// ESLint flat config: type-aware TypeScript rules for the game, plain JS rules for the
// Node scripts. Formatting is Prettier's job (eslint-config-prettier turns off clashing rules).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
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
            // Same folder: './x'. Anywhere else in src: '@/folder/x' (never '../').
            'no-restricted-imports': [
                'error',
                { patterns: [{ group: ['../*'], message: "Import across folders with '@/…' instead of '../'." }] },
            ],
        },
    },

    // Docblocks: every function, class, method, interface, type alias and module-level helper
    // says what it is for.
    // TypeScript carries the types, so docblocks hold prose only (no {type} annotations).
    {
        files: ['src/**/*.ts'],
        plugins: { jsdoc },
        rules: {
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        ClassDeclaration: true,
                        MethodDefinition: true,
                        ArrowFunctionExpression: false,
                        FunctionExpression: false,
                    },
                    contexts: [
                        'TSInterfaceDeclaration',
                        'TSTypeAliasDeclaration',
                        'TSEnumDeclaration',
                        // Module-level arrow helpers; small local lambdas inside a function body are exempt.
                        'Program > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
                        'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
                    ],
                    checkConstructors: false,
                    checkGetters: true,
                    checkSetters: true,
                },
            ],
            'jsdoc/require-description': ['error', { contexts: ['any'] }],
            'jsdoc/no-types': 'error',
            'jsdoc/check-tag-names': ['error', { definedTags: [] }],
            'jsdoc/no-blank-blocks': 'error',
        },
    },

    // types/ holds shapes only: no runtime code, and it depends on nothing outside itself.
    {
        files: ['src/types/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                { patterns: [{ group: ['../*', '@/*'], message: 'types/ must not depend on runtime modules.' }] },
            ],
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        'ExportNamedDeclaration > :matches(VariableDeclaration, FunctionDeclaration, ClassDeclaration)',
                    message:
                        'types/ holds interfaces and type aliases only; put runtime code in core/ or a feature folder.',
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
