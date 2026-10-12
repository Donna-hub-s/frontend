import { defineConfig } from "@playwright/test";

/**
 * Squelette e2e (Phase 2 frontend, frontendAnalyse.md) — pose les fondations, ne couvre pas
 * encore les 10 parcours listés par frontendAnalyse.md §8 : ceux-là passent par /app/* (session
 * requise), donc par un backend/LLM factice joignable en HTTP qui n'existe pas encore (voir
 * evals/benchmark/README.md pour l'équivalent côté backend, make evals/make benchmark — ici,
 * rien d'équivalent n'est encore construit). Les specs d'aujourd'hui ne touchent que les pages
 * PUBLIQUES (pas de session) — même limite que scripts/measure-web-vitals.mjs (npm run perf).
 *
 * Jamais dans `npm run test`/CI pour l'instant : un seul test public ne justifie pas encore de
 * bloquer la CI sur un vrai build + navigateur — à revoir une fois plus de specs existeront.
 */
const PORT = 4301;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/fr`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
