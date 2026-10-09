/* ============================================================
   MonBudget — Service Worker
   Afriland First Holding
   Stratégie : « hors-ligne intelligent »
   - L'application (index.html) est mise en cache et servie hors-ligne,
     y compris pour les adresses profondes (…/mon-portefeuille/obligations).
   - Les bibliothèques des CDN (cdnjs, jsDelivr) et les polices Google sont
     gardées en cache : leurs adresses sont versionnées, donc immuables.
   - Supabase (données, connexion, fichiers) n'est JAMAIS mis en cache.
   IMPORTANT : incrémentez CACHE_VERSION à chaque nouvelle version
   publiée pour forcer la mise à jour chez les utilisateurs.
   Historique :
   - v2 (oct. 2026) : la page 404.html de GitHub Pages ne remplace plus
     l'application dans le cache ; bibliothèques disponibles hors-ligne.
   - v3 (8 oct. 2026) : suivi des résolutions, étape C.
   - v4 (8 oct. 2026) : interface bilingue FR / EN, police Poppins.
   - v5 (9 oct. 2026) : évidences des faits, aperçu des documents.
   ============================================================ */

const CACHE_VERSION = "monbudget-v5";
const LIB_CACHE = "monbudget-libs-v1";        // bibliothèques versionnées (conservé d'une version à l'autre)
const CORE_ASSETS = [
  "./",
  "./index.html"
];
/* hôtes dont les ressources sont immuables (adresses versionnées) */
const STATIC_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com", "esm.sh"];

/* Installation : on précharge le cœur de l'application. */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* Activation : on supprime les anciens caches (sauf celui des bibliothèques). */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION && k !== LIB_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* Une réponse « application » : page HTML servie avec succès (et non la page
   404.html de redirection de GitHub Pages, renvoyée avec le statut 404). */
function isAppPage(res) {
  return res && res.ok && res.status === 200 &&
    (res.headers.get("content-type") || "").indexOf("text/html") >= 0;
}

/* Interception des requêtes. */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne gère que les requêtes GET.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigation (ouverture / rechargement, y compris une adresse profonde) :
  // réseau d'abord ; hors-ligne, l'application en cache (elle remet l'adresse en place).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isAppPage(res)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((r) => r || caches.match("./"))
        )
    );
    return;
  }

  // Ressources du même domaine : cache d'abord, mise à jour en arrière-plan.
  if (sameOrigin) {
    if (url.pathname.endsWith("/sw.js")) return;               // le navigateur gère lui-même sw.js
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Bibliothèques et polices (adresses versionnées) : cache d'abord.
  if (STATIC_HOSTS.indexOf(url.hostname) >= 0) {
    event.respondWith(
      caches.open(LIB_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            // réponses opaques (script sans CORS) acceptées : statut 0
            if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
            return res;
          });
        })
      )
    );
    return;
  }

  // Tout le reste (Supabase : données, connexion, fichiers) : réseau uniquement,
  // sans interception — jamais mis en cache.
});
