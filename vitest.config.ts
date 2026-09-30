import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Tests unitaires sur la logique pure (lib/), séparés du reste de la suite
// build/lint (voir CLAUDE.md) — aucun rendu de composant React ici, jsdom
// n'est nécessaire que pour session-guard.ts (window.fetch, window.location).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
