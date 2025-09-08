// .eslintrc.cjs
module.exports = {
  root: true,
  ignorePatterns: ['dist/', 'node_modules/'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'n8n-nodes-base'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // n8n community node rules (optional but nice to have if you're using the plugin)
    'plugin:n8n-nodes-base/community',
  ],
};
