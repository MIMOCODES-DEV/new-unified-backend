import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries (see docs/ARCHITECTURE.md §3–4):
 * - domain        → kernel only
 * - application   → its own module's domain + kernel
 * - infrastructure→ its own module's application/domain + shared
 * - module root   → its own module's layers + shared (index.ts = the public API)
 * - interfaces    → module public APIs, shared, tenancy
 * Another module's internals are never importable, and domain code imports no packages.
 */
// Order matters: each file gets the first matching element, so specific patterns come first.
const elements = [
  { type: 'kernel', pattern: 'src/shared/kernel' },
  { type: 'shared', pattern: 'src/shared/*' },
  { type: 'tenancy', pattern: 'src/tenancy' },
  { type: 'domain', pattern: 'src/modules/*/domain', capture: ['module'] },
  { type: 'application', pattern: 'src/modules/*/application', capture: ['module'] },
  { type: 'infrastructure', pattern: 'src/modules/*/infrastructure', capture: ['module'] },
  // Files at a module's root: <name>.module.ts and index.ts, the module's public API.
  { type: 'module-api', pattern: 'src/modules/*', capture: ['module'] },
  { type: 'interfaces', pattern: 'src/interfaces' },
  { type: 'jobs', pattern: 'src/jobs' },
  { type: 'root', pattern: 'src' },
];

const sameModule = (...types) =>
  types.map((type) => ({
    to: { element: { type, captured: { module: '{{ from.element.captured.module }}' } } },
  }));

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'docs', 'tools'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        // Constructor parameter types must stay value imports: Nest DI reads them at runtime.
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.spec.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
      'boundaries/elements': elements,
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            {
              from: { element: { type: 'kernel' } },
              allow: [{ to: { element: { type: 'kernel' } } }],
            },
            {
              from: { element: { type: 'domain' } },
              allow: [{ to: { element: { type: 'kernel' } } }, ...sameModule('domain')],
            },
            {
              from: { element: { type: 'application' } },
              allow: [
                { to: { element: { type: 'kernel' } } },
                ...sameModule('domain', 'application'),
              ],
            },
            {
              from: { element: { type: 'infrastructure' } },
              allow: [
                { to: { element: { types: { anyOf: ['kernel', 'shared', 'tenancy'] } } } },
                ...sameModule('domain', 'application', 'infrastructure'),
              ],
            },
            {
              from: { element: { type: 'module-api' } },
              allow: [
                { to: { element: { types: { anyOf: ['kernel', 'shared', 'tenancy'] } } } },
                ...sameModule('domain', 'application', 'infrastructure'),
              ],
            },
            {
              from: { element: { types: { anyOf: ['shared', 'tenancy'] } } },
              allow: [{ to: { element: { types: { anyOf: ['kernel', 'shared', 'tenancy'] } } } }],
            },
            {
              from: { element: { types: { anyOf: ['interfaces', 'jobs', 'root'] } } },
              allow: [
                {
                  to: {
                    element: {
                      types: {
                        anyOf: [
                          'kernel',
                          'shared',
                          'tenancy',
                          'module-api',
                          'interfaces',
                          'jobs',
                          'root',
                        ],
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    // Business rules stay pure TypeScript: no framework, driver or SDK imports.
    files: ['src/shared/kernel/**/*.ts', 'src/modules/*/domain/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { regex: String.raw`^(?!\.|node:)`, message: 'Domain code must not import packages.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
