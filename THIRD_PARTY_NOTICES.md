# Notices des composants tiers

Lagon Kart utilise une identité visuelle, des géométries procédurales et des sons synthétisés créés pour ce projet. Aucun personnage, son ou modèle Nintendo n'est inclus. Aucun asset distant ni CDN n'est nécessaire pendant une partie.

## Bibliothèques distribuées

- Three.js 0.186.1 — MIT — https://github.com/mrdoob/three
- Colyseus (`@colyseus/core` 0.16.26, `@colyseus/ws-transport` 0.16.5, `colyseus.js` 0.16.22) — MIT — https://github.com/colyseus/colyseus et https://github.com/colyseus/colyseus.js
- `@colyseus/schema` 3.0.76 — MIT — https://github.com/colyseus/schema
- `@colyseus/httpie` 2.0.1 — MIT (Luke Edwards) ; `@colyseus/msgpackr` 1.11.3 — MIT (Kris Zyp) : dépendances du client, licences incluses dans `client/public/licenses.txt`.
- Vite 6.4.4 — MIT — https://github.com/vitejs/vite
- TypeScript 5.9.3 — Apache-2.0 — https://github.com/microsoft/TypeScript
- tsx, concurrently et Playwright : outils de développement et de validation uniquement ; voir leurs licences installées dans `node_modules`.
- cloudflared 2026.10.0 — Apache-2.0 — image officielle Cloudflare, exécutée séparément : https://github.com/cloudflare/cloudflared
- Node.js 22.21.1 — MIT et licences de ses composants — image officielle Node : https://github.com/nodejs/node/blob/v22.21.1/LICENSE

Les textes des licences des dépendances de production sont conservés dans `node_modules` dans l'image Docker. Les notices de Three.js, du client Colyseus et de ses dépendances sont également reproduites dans `client/public/licenses.txt`, distribuées avec le client. `package-lock.json` fixe toutes les versions transitives.

## Ressources examinées, sans code ou asset copié

- https://github.com/colyseus/react-racing-game — MIT (Copyright 2021 pmdrs, contributors). Ancienne base React Three Fiber/Cannon/Colyseus 0.14. Audit de `server/src/rooms/MyRoom.ts` : `movementData` copie position et rotation fournies par le client sans simulation autoritaire. Cette logique n'est pas reprise.
- https://kenney.nl/assets/car-kit — CC0, pack de véhicules réutilisable.
- https://kenney.nl/assets/racing-kit — CC0, pack de circuit réutilisable.

Les deux packs Kenney ont été examinés ; les géométries simples créées dans le projet évitent l'import d'une bibliothèque de modèles et correspondent exactement au circuit physique. Aucun fichier Kenney n'est distribué.

## Documentation de conception

- Colyseus : https://docs.colyseus.io/ et https://docs.colyseus.io/netcode
- Référence de la branche utilisée : https://github.com/colyseus/colyseus/tree/0.16 et définitions TypeScript des paquets installés.
- Quick Tunnels : https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

La documentation netcode actuelle expose des API propres à Colyseus 0.18 (`Predict`, `setFixedTimestep`). Cette première version utilise la série publiée 0.16, compatible avec Node 20.19 et 22, les salons et la reconnexion Colyseus, et une boucle de prédiction/réconciliation spécifique à la conduite partagée. Elle n'appelle aucune API 0.18.
