import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Tests unitaires sur la logique pure (lib/), séparés du reste de la suite
// build/lint (voir CLAUDE.md) — jsdom sert à session-guard.ts (window.fetch,
// window.location) et aux rares tests de composant (oauth-link-notice, home-screen).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
