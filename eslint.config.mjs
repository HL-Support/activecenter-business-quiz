import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

const commonGlobals = {
  console: 'readonly',
  process: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  AbortController: 'readonly',
  require: 'readonly',
  module: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
};

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '.vercel/',
      'code_details/**',
      // Aus n8n gezogene Code-Belege: Fragmente, die nur im n8n-Code-Knoten laufen
      // (`return` auf oberster Ebene, `$input`) — kein Projektquelltext, sondern
      // Beweismaterial. Sie werden bewusst NICHT nach den Regeln dieses Projekts
      // formatiert: Jede Aenderung daran entwertet den Beweis, dass der Extrakt
      // zeichengleich mit dem laufenden Workflow ist.
      // Siehe docs/audits/c1-postprocessor-extrakt/BEFUND.md.
      'docs/audits/**/*.js',
      // Eigenstaendige Anwendungen mit eigenem Werkzeugkasten (Next.js, JSX in .js).
      // Sie werden nicht vom Quiz gebaut und nicht von dessen ESLint-Regeln bedient.
      'nurture/review-app/**',
      'nurture/mautic-setup/**',
    ],
  },
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...commonGlobals,
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        playerjs: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      'no-implicit-coercion': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
