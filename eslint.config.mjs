import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only agent/tool worktree copies (gitignored, absent on CI) —
    // don't lint duplicated source trees.
    ".claude/**",
    ".kilo/**",
    // Node CommonJS CLI/maintenance scripts — run by `node`/PM2, not part of
    // the Next app bundle. Linting them with the browser/TS config flags their
    // legitimate require() usage and was breaking the CI lint gate.
    "scripts/**",
    "work/**",
    "migrate-admin.js",
    "migrate-policies.js",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "prefer-const": "warn",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
