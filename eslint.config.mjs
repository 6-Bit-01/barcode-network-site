import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/components/*.tsx"],
    rules: {
      // Client components may intentionally synchronize display state to an
      // external clock or browser source during their initial effect.
      "react-hooks/set-state-in-effect": "off",
      // The visual language intentionally uses literal // terminal labels.
      "react/jsx-no-comment-textnodes": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Historical prototypes are retained as reference only and are not part
    // of the production Next.js application or its supported lint baseline.
    "_archive/**",
    "discord-bot/**",
    "stream-engine/**",
  ]),
]);

export default eslintConfig;
