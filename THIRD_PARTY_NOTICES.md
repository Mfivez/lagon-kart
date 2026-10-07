# Notices des composants tiers

Lagon Kart utilise une identité visuelle, des circuits et des effets sonores synthétisés créés pour ce projet, trois karts gratuits, un arbre Kenney CC0 et deux musiques MP3 fournies pour le jeu. Aucun asset distant ni CDN n'est nécessaire pendant une partie.

## Musiques MP3 fournies

- Originaux : `assets/audios/Lap 1.mp3` et `assets/audios/Lap 2.mp3`, conservés sans modification.
- Copies servies : `/audio/lap-1-v1.mp3` et `/audio/lap-2-v1.mp3`, identiques octet par octet aux originaux.
- Artiste indiqué dans les tags ID3 : `ancestraldrummers512` ; commentaire : `made with suno`. Ces métadonnées décrivent les fichiers fournis ; aucun service de génération n'a été appelé pour cette intégration.
- Aucune licence n'est déduite des tags ou du nom du service. Ces fichiers ne sont pas présentés comme CC0 ou comme des compositions créées par le code du projet.
- Empreintes, durées et métadonnées conservées dans `assets/audios/inspection.json` ; fonctionnement décrit dans `docs/MUSIC.md`.

## Kart distribué : Go Kart de Zsky

- Auteur : **Zsky**, https://www.patreon.com/Zsky ; titre : **Go Kart**.
- Source effectivement utilisée : https://poly.pizza/m/MkByxZCSMA (GLB individuel gratuit).
- Licence associée à ce fichier : **Creative Commons Attribution 3.0 Unported**, https://creativecommons.org/licenses/by/3.0/ .
- Adaptation : orientation et échelle, préparation des pivots des quatre roues, organisation et export du GLB, regroupement de géométries, matériaux et couleurs. Les animations et le pilote sont ajoutés par Lagon Kart. Aucun soutien de Zsky au projet n'est revendiqué.
- Original conservé dans `assets/sources/zsky/` ; modèle utilisé par le navigateur : `client/public/models/kart-zsky-v1.glb`. La conversion est automatisée ; Blender n'est pas nécessaire pour lancer le jeu.
- Les crédits sont accessibles depuis le pied de page du jeu, dans `/credits.html` et `/licenses.txt`. Le lien Patreon demandé pour les ressources Zsky est conservé, sans abonnement ni paiement.

Le pack modulaire https://opengameart.org/content/modular-karts est annoncé sous **CC BY 4.0**, mais son téléchargement a répondu 403 pendant cette intervention. Ce n'est pas la licence appliquée au GLB individuel : la licence 3.0 effectivement liée par Poly Pizza est conservée. Voir `docs/KART_ASSET.md` pour l'inspection, la provenance et la conversion.

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

Ces deux packs de véhicules et de circuit Kenney ne sont pas distribués. Les modèles de karts viennent de Zsky, Poly by Google et Ben Harrison. L’arbre décrit ci-dessous est un asset Kenney distinct.

## Décor distribué : Tree de Kenney

- Auteur : **Kenney** ; [fichier source et licence CC0 1.0](https://poly.pizza/m/QN3Ru02ayU).
- Original, preuve de provenance, inspection et texte de licence : `assets/sources/kenney-nature/`.
- Copie locale versionnée : `client/public/models/scenery/kenney-tree-v1.glb`, identique à l’original, 14 480 octets, 200 triangles, deux matériaux, aucune texture externe.
- À l’exécution : adaptation de l’échelle et du pivot au sol, couleurs de feuillage et de bois. L’attribution est facultative sous CC0 et conservée pour la traçabilité ; aucun soutien de Kenney n’est revendiqué.
- Les autres monuments et terrains sont des géométries originales du projet. [Recherche, composition et budget](docs/SCENERY.md). Coût ajouté : **0 €**.

## Documentation de conception

- Colyseus : https://docs.colyseus.io/ et https://docs.colyseus.io/netcode
- Référence de la branche utilisée : https://github.com/colyseus/colyseus/tree/0.16 et définitions TypeScript des paquets installés.
- Quick Tunnels : https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

La documentation netcode actuelle expose des API propres à Colyseus 0.18 (`Predict`, `setFixedTimestep`). Cette première version utilise la série publiée 0.16, compatible avec Node 20.19 et 22, les salons et la reconnexion Colyseus, et une boucle de prédiction/réconciliation spécifique à la conduite partagée. Elle n'appelle aucune API 0.18.

## Additional kart models

**Go kart — Poly by Google**, [source](https://poly.pizza/m/3hkutVs0AAV), and **Kart — Ben Harrison**, [source](https://poly.pizza/m/bKDlM4mH7rg), under [CC BY 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Adapted as Sprint and Rétro: orientation, scale, component-based wheel separation, pivots, GLB hierarchy, materials and animation. Original files, provenance and license texts are retained in `assets/sources/poly-google/` and `assets/sources/ben-harrison/`. No endorsement is implied. [Inspection and preparation](docs/KART_MODELS.md).

The cartoon characters and their vehicle accessories are original procedural geometry; they do not use additional external assets. [Character details](docs/CHARACTERS.md).

## Invitations par QR code

- `qrcode-generator` **2.0.4**, Kazuhiko Arase, licence **MIT** : [dépôt officiel](https://github.com/kazuhikoarase/qrcode-generator), [licence](https://github.com/kazuhikoarase/qrcode-generator/blob/master/LICENSE). Génération locale dans le navigateur ; aucune API, aucun CDN, aucune dépendance transitive. Texte de licence distribué dans `client/public/licenses.txt`.
- `jsqr` **1.4.0**, licence **Apache-2.0** : [décodeur officiel](https://github.com/cozmo/jsQR). Outil de test uniquement, utilisé pour décoder réellement les QR générés ; absent du client distribué.
