import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Tests unitaires sur la logique pure (lib/), séparés du reste de la suite
// build/lint (voir CLAUDE.md) — jsdom sert à session-guard.ts (window.fetch,
// window.location) et aux rares tests de composant (oauth-link-notice, home-screen).

// Node ≥ 25 fournit son PROPRE `localStorage` (Web Storage), indéfini tant que `--localstorage-file` n'est pas donné : il masque celui
// de jsdom et fait échouer tout test qui lit ou écrit le stockage (lib/theme.test.ts : « Cannot read properties of undefined »).
// On coupe le Web Storage de Node dans les processus de test. Le drapeau n'existe qu'à partir de Node 22.4 : on ne le passe que s'il
// est connu, sans quoi un Node plus ancien refuserait de démarrer (« bad option »).
const execArgv = process.allowedNodeEnvironmentFlags.has("--experimental-webstorage") ? ["--no-experimental-webstorage"] : [];

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    poolOptions: { forks: { execArgv } },
  },
});
