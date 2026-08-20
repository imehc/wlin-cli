import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'tmp/**', 'bin/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLI 会主动设置退出码/调 process.exit，不该被当成问题
      'no-process-exit': 'off',
      // 有意用 catch {} 忽略清理失败等非致命错误
      'no-empty': ['error', {allowEmptyCatch: true}],
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
    },
  },
  {
    // scripts/ 下是发布期用的纯 Node 脚本（非 TS，不进产物）。
    // 只声明实际用到的全局量，省掉一个 globals 依赖
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {process: 'readonly'},
    },
  },
  prettier,
)
