# Lagon Kart

Un jeu de kart 3D arcade à partager entre amis : quatre circuits originaux, trois tours par course, drift et mini-turbo, objets, aspiration et tournois de deux à huit courses. L'interface est en français. Le serveur calcule les déplacements, collisions, objets et résultats ; le navigateur envoie les touches de conduite.

Les karts utilisent désormais le modèle gratuit [Go Kart de Zsky](https://poly.pizza/m/MkByxZCSMA), avec huit peintures, roues animées, braquage et légère inclinaison visuelle de la carrosserie. Les crédits de [Zsky](https://www.patreon.com/Zsky) et la licence [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) sont accessibles depuis le jeu. Coût des assets et de la préparation : **0 €**.

Voir la [démo intégrée, ses captures et ses tests](docs/DEMO.md), ainsi que le [suivi des tâches](todo.md).

## Lancer une partie avec Docker

Seuls **Docker et Docker Compose** sont nécessaires sur l'ordinateur qui héberge la partie. Les amis utilisent un navigateur récent sur ordinateur (Chrome, Edge ou Firefox avec WebGL activé).

- **Windows** : installer Docker Desktop, activer son moteur Linux/WSL 2 et démarrer Docker Desktop. Ouvrir PowerShell dans ce dossier.
- **macOS** : installer et démarrer Docker Desktop, puis ouvrir Terminal dans ce dossier.
- **Linux** : installer Docker Engine et le plugin Docker Compose ; démarrer le service Docker et disposer des droits d'accès au moteur.

Vérifier l'installation avec `docker compose version`. Depuis le dossier contenant `compose.yaml` :

```bash
# Construire et démarrer le jeu en local
docker compose up --build -d

# Voir l'état et les logs du serveur
docker compose ps
docker compose logs -f app
```

Ouvrir **http://localhost:3000**. La première construction télécharge les dépendances ; les parties suivantes utilisent l'image déjà construite. Aucune installation de Node.js, de base de données ou de cloudflared n'est nécessaire sur l'ordinateur.

## Inviter des amis sur Internet

```bash
# Démarrer le jeu et son tunnel public
docker compose --profile tunnel up --build -d

# Lire l'URL https://...trycloudflare.com dans les logs
docker compose logs -f tunnel
```

Attendre l'apparition de l'adresse `https://…trycloudflare.com`. `Ctrl+C` quitte l'affichage des logs et laisse le jeu et le tunnel actifs. **Ouvrir cette adresse publique soi-même avant de créer le salon** : le bouton de copie du salon produira alors un lien public utilisable par les amis. Depuis `localhost`, le lien copié est local ; les amis doivent ouvrir l'adresse publique et saisir le code du salon.

1. Choisir un pseudo, une couleur et un circuit, puis créer un salon.
2. Copier son lien ou communiquer son code aux amis.
3. L'hôte règle la course ou le tournoi, puis chaque pilote se déclare prêt.
4. L'hôte lance la course. Un décompte commun de trois secondes précède le départ.
5. Après chaque manche, consulter les résultats et le classement cumulé. L'hôte prépare la course suivante ou un nouveau tournoi ; tous se déclarent prêts à nouveau.

Le mode **Entraînement** permet de courir seul sur le circuit choisi. Un nouvel arrivant pendant une manche attend la prochaine course. Le rôle d'hôte est transféré à un participant connecté lorsque l'hôte part ou perd sa connexion.

## Circuits et tournois

| Circuit | Particularités |
| --- | --- |
| Île des Alizés | Courbes larges, palmiers, bandes turbo et flaques de boue à éviter. |
| Canyon solaire | Tracé plus sinueux, falaises et cactus, bonne adhérence, zones de boue sur les côtés. |
| Banquise boréale | Neige et cristaux, adhérence réduite, plaques de glace qui prolongent les glissades. Anticiper les changements de direction. |
| Métropole néon | Ville nocturne, chicane et trois bandes turbo disposées sur différentes lignes. |

Les tracés, largeurs, décors, zones et checkpoints sont propres à chaque circuit. Les réglages d'un salon n'affectent pas les autres salons.

L'hôte choisit **Une course** ou **Un tournoi**, avant le premier départ. Pour un tournoi de **2 à 8 courses** :

- **À la carte** : choisir le circuit de chaque manche, dans l'ordre souhaité ; les répétitions sont permises.
- **Au hasard** : cocher les circuits autorisés. Le serveur tire le programme parmi cette sélection, sans réutiliser un circuit avant d'avoir épuisé le groupe. Avec plusieurs circuits, deux manches consécutives ne sont jamais identiques.

Le programme est visible de tous et verrouillé dès que le tournoi commence. Les arrivants gagnent respectivement **15, 12, 10, 8, 6, 4, 2 et 1 point** ; une course non terminée rapporte zéro point. Les égalités sont départagées par les victoires, les courses terminées, le temps cumulé, puis un identifiant stable. La reconnexion conserve les points. Un pilote rejoignant un tournoi commencé part avec zéro point et participe à la prochaine manche. Les points d'un pilote parti restent dans le classement.

Entre les courses, l'hôte clique sur **Prochaine course** et les pilotes se déclarent prêts. Après la dernière course, le podium affiche le classement général. Un nouveau tournoi remet les scores à zéro, conserve les réglages et effectue un nouveau tirage si le mode est aléatoire.

```bash
# Couper uniquement l'accès public ; continuer à jouer en local
docker compose stop tunnel

# Réactiver le tunnel (consulter de nouveau son URL)
docker compose --profile tunnel up -d tunnel

# Arrêter et supprimer les conteneurs du jeu et du tunnel
docker compose --profile tunnel down
```

L'ordinateur doit rester allumé et connecté, Docker et le tunnel doivent rester actifs. L'URL est temporaire et peut changer à chaque redémarrage du tunnel. Aucune reconstruction du jeu n'est nécessaire : les fichiers, le matchmaking et les WebSockets utilisent l'origine de la page, automatiquement HTTP/WS en local ou HTTPS/WSS en public.

Les [Quick Tunnels Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) fonctionnent sans compte ni domaine mais n'ont pas de garantie de disponibilité. Leur limite annoncée de 200 requêtes simultanées et l'absence de SSE ne constituent **pas** une garantie de capacité en joueurs. Le jeu utilise WebSocket. Toute personne connaissant l'URL et le code peut rejoindre ; les salons n'ont pas de comptes ni de mot de passe.

## Commandes

| Action | Touches |
| --- | --- |
| Accélérer | ↑, Z ou W |
| Freiner / reculer | ↓ ou S |
| Tourner | ←/→, Q/D ou A/D |
| Drift | Maintenir Espace en tournant ; relâcher après la charge pour le mini-turbo |
| Utiliser l'objet | E |
| Remettre le kart en piste | R |

Les boîtes mystères distribuent huit objets : **turbo**, **triple turbo**, **balise piège**, **projectile vert**, **fusée rouge guidée**, **comète bleue visant le leader**, **étoile d'énergie** et **bouclier**. Le triple turbo se consomme en trois pressions distinctes sur E ; le HUD indique les charges et les protections actives. Le tirage favorise les outils de rattrapage à l'arrière du peloton. Cibles, impacts et durées sont calculés par le serveur. Voir [les règles des objets](docs/ITEMS.md).

Les musiques fournies **`Lap 1.mp3`** et **`Lap 2.mp3`** accompagnent tous les circuits : le premier fichier joue au premier tour, puis le second aux deuxième et troisième tours. Les originaux sont conservés dans `assets/audios/` et leurs copies versionnées sont servies par le jeu. Le réglage du volume s'applique à la musique et aux effets ; le son démarre après une interaction avec la page. En quittant la fenêtre, les commandes sont relâchées et la musique est suspendue. L'intégration ne nécessite aucun achat, service externe ou nouvelle dépendance. Voir [les fichiers et leur intégration](docs/MUSIC.md).

Pour varier la conduite sans ajouter de touches :

- **Départ turbo** : commencer à accélérer pendant la dernière seconde du décompte et maintenir jusqu'au départ. Appuyer trop tôt ne donne pas le bonus.
- **Aspiration** : rester dans le sillage d'un adversaire pour charger une accélération, puis le dépasser. Un délai sépare deux bonus.
- **Bandes turbo** : viser les bandes lumineuses au sol. Chaque bande donne au maximum un bonus par tour ; reculer dessus ou se remettre en piste ne permet pas de le répéter.
- **Glace et boue** : la glace rend la direction plus glissante ; la boue ralentit le kart. Le HUD indique l'effet de la surface.

Les checkpoints se franchissent dans l'ordre et dans le sens de la course. La remise en piste utilise le dernier checkpoint valide. Après le premier arrivé, les autres ont 25 secondes pour terminer ; la manche dure au maximum cinq minutes. Les pilotes n'ayant pas terminé sont classés selon leur progression avec une indication d'abandon/non-arrivée. Une coupure réserve la place environ 30 secondes et neutralise les commandes. L'actualisation de la page reprend la session grâce à un jeton conservé **par onglet** ; après expiration, rejoindre de nouveau le salon. Arrêter le serveur efface les salons, qui résident en mémoire.

## Configuration facultative

Les valeurs par défaut fonctionnent sans fichier `.env`. Pour les changer, copier `.env.example` en `.env`, modifier les valeurs puis relancer `docker compose up -d`.

| Variable | Défaut | Usage |
| --- | --- | --- |
| `HOST_PORT` | 3000 | Port local ; par exemple 3100 donne http://localhost:3100 |
| `MAX_ROOMS` | 16 avec Compose | Limite de salons simultanés, pas une capacité de performance garantie ; 32 par défaut hors Docker |
| `MAX_PLAYERS` | 8 | De 2 à 8 par salon multijoueur ; entraînement limité à 1 |
| `SIM_HZ` | 30 | Pas fixe de simulation serveur et prédiction client |
| `SNAPSHOT_HZ` | 20 | Fréquence des instantanés réseau |
| `RECONNECT_SECONDS` | 30 | Fenêtre de reprise |
| `INPUT_TIMEOUT_MS` | 250 | Neutralisation après silence réseau |

Dans le conteneur, le serveur écoute `0.0.0.0:3000`. Compose publie uniquement `127.0.0.1:3000` sur l'ordinateur ; le tunnel joint directement `http://app:3000` sur le réseau Docker. Aucun port de routeur ne doit être ouvert. `/healthz` vérifie que le serveur répond. Le service tunnel attend que ce contrôle réussisse.

## Modèle du kart et préparation

`client/public/models/kart-zsky-v1.glb` est inclus dans le projet et servi depuis la même origine que la page. `GLTFLoader` charge ce modèle une seule fois par page. Les instances partagent leurs géométries et leurs matériaux fixes ; les matériaux teintés sont propres à chaque pilote. Les roues ont des pivots préparés autour de leur axe, distincts du braquage. L'ancien kart procédural est conservé comme secours en cas d'échec de chargement.

Le roulement des roues, leur braquage et l'inclinaison de carrosserie sont des effets de rendu : ils ne changent ni la position simulée, ni les collisions, ni les messages réseau. Une ombre de contact légère reste visible lorsque le jeu réduit les ombres dynamiques sur une machine lente.

L'original, sa provenance et sa licence sont conservés dans `assets/sources/zsky/`. Pour reproduire la préparation, **facultativement**, avec Python 3 :

```bash
npm run prepare:kart
npm run check:kart
```

La conversion utilise la bibliothèque standard Python, sans téléchargement. Ni Python ni Blender ne sont nécessaires pour construire l'image Docker ou jouer. Voir [l'inspection du modèle](docs/KART_ASSET.md), [les captures avant/après et la validation de la démo](docs/KART_DEMO.md) et [les notices](THIRD_PARTY_NOTICES.md).

## Développement et tests

Pour développer hors Docker, installer Node.js 20.19+ ou 22, puis :

```bash
npm ci
npm run dev
```

Ouvrir http://localhost:5173. Vite recharge le client, `tsx watch` relance le serveur ; ses redémarrages perdent les salons en mémoire. Le proxy Vite conserve une origine unique. Pour vérifier la version compilée :

```bash
npm run build
npm start
```

```bash
# Types et règles déterministes
npm run typecheck
npm test

# Un serveur doit tourner sur localhost:3000 pour ces tests
npm run test:network

# Tournoi complet sur les quatre circuits, avec quatre clients SDK par défaut
npm run test:tournament

# Deux sessions indépendantes dans Chromium
npx playwright install chromium
npm run test:browser

# Interface des tournois, sur un serveur de test privé (après npm run build)
npm run test:browser-tournament

# Comparatifs visuels et contrôles du modèle, sur un serveur de test isolé
npm run test:kart-visual

# Quatre pilotes SDK et deux navigateurs observateurs, contre un serveur actif
BASE_URL=http://127.0.0.1:3000 npm run test:kart-demo

# Nouveaux objets : clavier et HUD sur un serveur privé à fixtures (après build)
npm run test:items-browser

# Musique : lecture des MP3, changement de tour, volume et reprise
npm run test:music
```

Les scripts réseau et le test navigateur de course complète acceptent `BASE_URL` pour tester une URL publique. Le test réseau accepte `CLIENTS=2` ou `8`, ainsi que `LATENCY_MS=75` pour retarder les commandes et la réception des instantanés de 75 ms chacun. Le test de tournoi accepte `CLIENTS=2` à `8` et fait réellement parcourir trois tours sur les quatre circuits. Le test navigateur utilise deux contextes isolés dans un même Chromium, pilotés automatiquement par les commandes clavier ordinaires. Le test d'interface des tournois démarre son propre serveur et raccourcit les arrivées avec des fixtures serveur : il vérifie les écrans et transitions, pas des courses complètes. Exemple sous bash :

```bash
BASE_URL=https://votre-adresse.trycloudflare.com CLIENTS=2 npm run test:network
LATENCY_MS=75 npm run test:network
```

Sous PowerShell : `$env:BASE_URL="https://votre-adresse.trycloudflare.com"`, puis `npm run test:network`. Les rapports et captures sont écrits dans `test-results/` (ignoré par Git). Voir [VALIDATION.md](VALIDATION.md) pour les résultats réellement obtenus et les limites mesurées.

## Architecture et ressources

- `shared/track.ts` : catalogue des circuits, zones et checkpoints communs.
- `shared/game.ts` : conduite déterministe, surfaces, aspiration, départ turbo, progression, collisions et objets.
- `shared/tournament.ts` : configuration, tirage des circuits, points et classement cumulé.
- `server/` : salons Colyseus, règles d'accès, reconnexion, contrôles des messages et serveur HTTP statique.
- `client/` : Three.js, caméra, interface, musique MP3 et effets synthétiques, prédiction locale et interpolation.
- `tests/` : tests ciblés des règles ; `scripts/` : vérifications de bout en bout.

La simulation est autoritaire à pas fixe. Les commandes sont bornées et numérotées ; leur génération de connexion (`epoch`) invalide les anciennes commandes après reprise. Le serveur ne rejoue aucune file de commandes accumulées après une coupure. Le client réconcilie sa prédiction avec les commandes acquittées ; les autres karts sont interpolés et le rendu utilise `requestAnimationFrame` indépendamment du réseau. Les instantanés complets simplifient cette première version à huit joueurs, au prix d'une bande passante plus élevée que des deltas de schéma.

L'audit de [react-racing-game](https://github.com/colyseus/react-racing-game) a montré que `movementData` y recopie les positions du client. Adapter sa physique Cannon côté serveur et ses anciennes dépendances économisait moins de travail qu'une conduite arcade commune. Le projet assemble donc Three.js et Colyseus, sans React ni moteur physique externe. Les packs [Kenney Car Kit](https://kenney.nl/assets/car-kit) et [Racing Kit](https://kenney.nl/assets/racing-kit), sous CC0, ont été examinés comme solutions possibles. Le kart retenu est celui de Zsky ; les circuits restent procéduraux. Toutes les ressources sont locales au serveur du jeu.

Les licences et les versions figurent dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). L'usage de Colyseus 0.16 est volontaire et ses API sont vérifiées dans les sources installées ; les primitives netcode 0.18 ne sont pas utilisées. Toutes les dépendances npm sont figées dans `package-lock.json`, les images Docker ont des versions explicites.

## Dépannage

- **Docker inaccessible** : démarrer Docker Desktop et attendre son état « running ». Sous Linux, vérifier le service et les droits du socket Docker.
- **Port occupé** : définir `HOST_PORT=3100` dans `.env`, relancer Compose et ouvrir le port choisi.
- **Tunnel sans URL** : consulter `docker compose logs tunnel`. Vérifier la connexion Internet et les pare-feu/proxy autorisant cloudflared ; le tunnel utilise ici HTTP/2. Sa disponibilité dépend de Cloudflare.
- **Salon plein** : une place déconnectée reste réservée pendant la fenêtre de reprise. Revenir après expiration ou créer un autre salon.
- **Salon inexistant/expiré** : vérifier le code et le serveur ; le dernier départ ou un redémarrage du serveur supprime le salon.
- **Écran 3D indisponible** : activer l'accélération graphique du navigateur et mettre à jour ses pilotes. Le jeu réduit automatiquement les ombres et la résolution si le rendu reste lent. Des boutons tactiles simples sont présents mais n'ont pas été validés sur téléphone ; la manette n'est pas prise en charge.
