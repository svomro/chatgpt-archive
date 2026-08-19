import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    // tools/live-stream/* are standalone CommonJS diagnostics run with plain node,
    // not part of the Vite build.
    { ignores: ['dist/**', 'coverage/**', 'tools/live-stream/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off',
        },
    },
)
