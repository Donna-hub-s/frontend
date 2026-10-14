#!/usr/bin/env node
/**
 * Mesure de performance RÉELLE (frontendAnalyse.md, Phase 1) — premier chiffre jamais produit
 * dans ce dépôt : les cibles de frontendAnalyse.md (Lighthouse ≥90, INP ≤200ms…) sont
 * explicitement marquées « objectifs, pas mesures ». Ceci n'est PAS un score Lighthouse certifié
 * (brancher Lighthouse sur ce Chromium non standard est un investissement à part, voir
 * analyse-croisee.md) — seulement des métriques réelles du navigateur (Navigation/Paint Timing)
 * sur un vrai build de production, via le Chromium de Playwright.
 *
 * Pages mesurées : la landing (/<lang>) et la page de connexion (/<lang>/login) — les seules
 * accessibles sans session (les pages /app/* exigent un cookie httpOnly, hors périmètre ici).
 *
 * Usage : npm run perf   (depuis frontend/) — lance `next build` + `next start`, jamais dans
 * `npm run test`/CI : trop lourd (vrai build, vrai navigateur) pour tourner à chaque suite.
 */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 4300;
const BASE_URL = `http://localhost:${PORT}`;
const PAGES = ["/fr", "/fr/login"];
const START_TIMEOUT_MS = 30_000;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} a échoué (${code})`))));
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Le serveur n'a pas répondu sur ${url} dans les ${timeoutMs}ms.`);
}

async function measurePage(page, path) {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    const resources = performance.getEntriesByType("resource");
    const jsBytes = resources
      .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);
    return {
      ttfb_ms: nav ? Math.round(nav.responseStart) : null,
      dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load_event_ms: nav ? Math.round(nav.loadEventEnd) : null,
      first_contentful_paint_ms: paint ? Math.round(paint.startTime) : null,
      js_transferred_bytes: jsBytes,
      resource_count: resources.length,
    };
  });
  return { path, status: response?.status() ?? null, ...metrics };
}

async function main() {
  console.log("Build de production (next build)…");
  await run("npx", ["next", "build"]);

  console.log(`Démarrage du serveur de production sur le port ${PORT}…`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, stdio: "pipe" });
  server.on("error", (err) => console.error("Erreur serveur :", err));

  try {
    await waitForServer(BASE_URL, START_TIMEOUT_MS);

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const results = [];
      for (const path of PAGES) {
        console.log(`Mesure de ${path}…`);
        results.push(await measurePage(page, path));
      }

      console.log("\nRésumé :");
      for (const r of results) {
        console.log(
          `  ${r.path.padEnd(14)} FCP=${r.first_contentful_paint_ms}ms  TTFB=${r.ttfb_ms}ms  ` +
            `JS=${(r.js_transferred_bytes / 1024).toFixed(0)}Ko (${r.resource_count} ressources)`,
        );
      }

      const reportsDir = join(ROOT, "perf-reports");
      mkdirSync(reportsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const reportPath = join(reportsDir, `${stamp}.json`);
      writeFileSync(reportPath, JSON.stringify({ created_at: stamp, base_url: BASE_URL, results }, null, 2));
      console.log(`\nRapport : ${reportPath.replace(ROOT + "/", "")}`);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
