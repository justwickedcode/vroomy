// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'

export default withNuxt(
    {
        files: ['**/*.vue', '**/*.ts', '**/*.js'],
        rules: {
            'vue/no-unused-vars': 'error',
            'vue/no-unused-components': 'error',
            'vue/html-self-closing': 'error',
            'no-console': 'warn',
            'no-unused-vars': 'error',
            'prefer-const': 'error',
        },
    },
    eslintConfigPrettier
)