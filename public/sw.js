/* Service worker DONNA — coquille hors ligne MINIMALE.
 *
 * Ce qu'il fait : (1) rend l'application installable ; (2) quand le réseau manque pendant une NAVIGATION, affiche une page
 * « hors connexion » (avec ses deux icônes, gardées dans SHELL) au lieu de l'erreur du navigateur ; (3) garde en cache les fichiers statiques de l'interface
 * (/_next/static/*, nommés par empreinte : immuables) pour les rouvrir plus vite.
 *
 * Ce qu'il ne fait JAMAIS, volontairement : mettre en cache une page de l'application, une réponse de l'API (/api, /auth,
 * /oauth), un document ou une conversation. DONNA manipule des données d'entreprise, sur des appareils parfois partagés : rien
 * de personnel ne doit survivre à la déconnexion dans un cache qu'aucun bouton « se déconnecter » ne vide. Les requêtes
 * autres que ces trois cas ne passent même pas par ce fichier (aucun `respondWith`) : le navigateur les traite seul,
 * avec ses en-têtes et son authentification, comme sans service worker.
 */
// À changer chaque fois que offline.html, les icônes de SHELL ou la logique de cache changent : c'est ce nom qui purge l'ancien cache.
const VERSION = "donna-shell-v1";
const SHELL = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];
const MAX_STATIC_ENTRIES = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function staticAsset(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > SHELL.length + MAX_STATIC_ENTRIES) await cache.delete(keys[SHELL.length]); // les plus anciens d'abord
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (SHELL.includes(url.pathname)) {
    // Les icônes de la page hors connexion : sinon elle s'afficherait sans image, justement quand le réseau manque.
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request));
  }
});
