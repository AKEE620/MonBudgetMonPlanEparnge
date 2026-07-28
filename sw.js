/* ============================================================
   MonBudget — Service Worker
   Afriland Bourse & Investissement
   Stratégie : « hors-ligne intelligent »
   - L'application (index.html) est mise en cache et servie hors-ligne.
   - Les appels réseau (Supabase, polices, CDN) passent par le réseau
     en priorité ; en cas d'absence de réseau, l'app reste ouvrable.
   IMPORTANT : incrémentez CACHE_VERSION à chaque nouvelle version
   publiée pour forcer la mise à jour chez les utilisateurs.
   ============================================================ */

const CACHE_VERSION = "monbudget-v1";
const CORE_ASSETS = [
  "./",
  "./index.html"
];

/* Installation : on précharge le cœur de l'application. */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* Activation : on supprime les anciens caches. */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* Interception des requêtes. */
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // On ne gère que les requêtes GET.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigation (ouverture / rechargement de l'app) :
  // réseau d'abord, repli sur le cache -> l'app s'ouvre même hors-ligne.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put("./index.html", copy)).catch(()=>{});
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((r) => r || caches.match("./"))
        )
    );
    return;
  }

  // Ressources du même domaine (dont index.html) :
  // cache d'abord, mise à jour en arrière-plan.
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(()=>{});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Ressources externes (Supabase, polices Google, CDN) :
  // réseau d'abord ; on ne bloque jamais si le réseau échoue.
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
