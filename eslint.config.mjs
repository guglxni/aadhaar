// eslint.config.js
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import tseslint from 'typescript-eslint';
// import nestjsTypedPlugin from '@darraghor/eslint-plugin-nestjs-typed'; // Keep Commented out
// import prettierPlugin from 'eslint-plugin-prettier'; // Keep Commented out
// import prettierPluginRecommended from 'eslint-plugin-prettier/recommended'; // Keep Commented out
import js from '@eslint/js';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked, // Use type-checked rules
  // nestjsTypedPlugin.configs['flat/recommended'], // Keep Commented out
  {
    // General configuration for TypeScript files
    files: ['src/**/*.ts', 'test/**/*.ts'], // Target TS files in src and test
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true, // Automatically find tsconfig.json
        tsconfigRootDir: path.dirname(fileURLToPath(import.meta.url)),
      },
    },
    // Keep Prettier plugin config commented out
    // plugins: {
    //   prettier: prettierPlugin,
    // },
    rules: {
      // 'prettier/prettier': 'error', // Keep Commented out

      // Add any project-specific rule overrides here
      // Example: Relaxing a rule from the recommended set
      // '@typescript-eslint/explicit-function-return-type': 'warn',

      // Rules from previous config that might still be relevant
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off', // Often preferred off in NestJS
      '@typescript-eslint/explicit-module-boundary-types': 'off', // Often preferred off in NestJS
      '@typescript-eslint/no-explicit-any': 'off', // Use with caution
    },
  },
  {
    // Ignore patterns
    ignores: [
      'dist/',
      'node_modules/',
      '.github/',
      'public/',
      // '*.js', // Removed to allow eslint.config.js processing
      '*.mjs',
      'eslint.config.js', // Ignore the config file itself
      'jest.config.js', // Ignore Jest config if it's JS
    ],
  }
);