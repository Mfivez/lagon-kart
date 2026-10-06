# Validation de Lagon Kart

Vérifications effectuées le 6 octobre 2026 dans WSL/Linux avec Docker Desktop 4.55.0, Docker Engine 29.1.3, Compose 2.40.3, Node 20.19.2 sur l'hôte et Node 22.21.1 dans l'image. Les résultats ci-dessous distinguent simulation, clients réseau automatisés et navigateur.

## Extension : quatre circuits et tournois

`npm run build` réussit : vérification TypeScript, compilation Vite et serveur. Fichiers client de cette version : `index-zxG7bDV_.js` et `index-B4UmZrnT.css`.

`npm test` : **47 tests comptés par Node, 47 réussis, aucun échec**. En plus des régressions de la première version, les tests couvrent :

- Quatre tracés fermés sans croisement, coordonnées et checkpoints propres à chaque circuit, largeurs et zones bornées.
- Huit pilotes terminant trois tours sur chacun des quatre circuits par les commandes ordinaires, avec objets et collisions.
- Boue, glace, drift, bandes turbo avec protection contre les bonus répétés et remise en piste ; prédiction déterministe sur chaque circuit.
- Départ turbo pendant la dernière seconde, absence de bonus pour une pression trop précoce ; aspiration, délai entre bonus et adversaires déconnectés.
- Configurations manuelle/aléatoire valides et invalides, choix réservés à l'hôte, isolation des salons, programme verrouillé entre les manches.
- Barème complet, non-arrivées à zéro, égalités, points attribués une seule fois, arrivants tardifs, départs, reconnexion et revanche.

`BASE_URL=http://127.0.0.1:3100 CLIENTS=8 npm run test:tournament` : **réussite en 273,126 secondes réelles**, contre un serveur de validation indépendant. Huit clients SDK enchaînent les quatre courses avec trois tours chacun. Aucun état de course n'est imposé par ce script ; le pilote automatique utilise accélérateur, direction, frein, objet et remise en piste ordinaires.

| Circuit | Longueur | Arrivées des huit pilotes, temps de course serveur |
| --- | --- | --- |
| Île des Alizés | 611 m | 45,50–52,77 s |
| Canyon solaire | 716 m | 63,17–64,40 s |
| Banquise boréale | 697 m | 60,80–67,83 s |
| Métropole néon | 731 m | 65,27–73,30 s |

Le même essai vérifie les points identiques sur tous les clients, la reconnexion en deuxième manche sans perte de score, l'invalidation des anciennes commandes entre circuits, le refus d'un changement de programme en cours de tournoi, la finale et la remise à zéro d'une revanche. Un tirage de huit manches parmi deux circuits autorisés ne choisit aucun autre circuit et ne répète pas deux circuits consécutifs. Rapport : `test-results/tournament.json`.

`npm run test:browser-tournament` : **réussite, code de sortie 0**, deux contextes Chromium indépendants en 1024×768 et 800×700. L'essai passe par les contrôles de l'interface : quatre aperçus sur l'accueil, circuit choisi lors de la création, configuration réservée à l'hôte, quatre manches manuelles, conduite clavier sur chaque tracé observée par l'autre session, classement cumulé, boutons de manche suivante, podium final, revanche et tirage de huit manches parmi deux circuits cochés. **Aucune erreur JavaScript**. Les captures des quatre décors, du salon et du podium ont également été inspectées.

Ce test d'interface raccourcit explicitement les arrivées par une fixture sur son serveur privé. Il ne représente donc pas quatre courses complètes conduites dans Chromium ; celles-ci sont couvertes par les clients SDK ci-dessus. Rapport : `test-results/browser-tournament.json` ; captures : `test-results/tournament-*.png`. Le test attend la configuration sur **les deux sessions** avant de comparer et quitte les salons avant d'arrêter le navigateur.

La nouvelle image Docker est construite et **healthy**. Le nouveau tunnel a réussi une vraie course de trois tours sur Métropole néon avec deux clients SDK : HTTPS/WSS, objets, reconnexion avec rotation du jeton, classement partagé, revanche et transfert d'hôte. Durée totale : **87,246 s**. Les derniers fichiers JS et CSS répondent en HTTPS avec statut 200. Rapports : `test-results/tunnel-new-circuits.json` et `test-results/tunnel-new-circuits-assets.json`. Ces clients et navigateurs sont automatisés sur le même hôte ; aucun essai depuis deux ordinateurs physiques n'est revendiqué.

Le déploiement de cette extension utilise le projet Compose **`lagon-kart-circuits`**, publié localement sur **http://localhost:3101**. Deux salons étaient encore ouverts dans le projet initial `lagon-kart` sur le port 3000 : il est resté actif. Les deux instances ont des salons et des tunnels indépendants. Pour gérer la nouvelle version :

```bash
HOST_PORT=3101 docker compose -p lagon-kart-circuits --profile tunnel ps
docker compose -p lagon-kart-circuits logs -f tunnel
# Recréer uniquement la nouvelle application après une modification :
HOST_PORT=3101 docker compose -p lagon-kart-circuits up --build --no-deps -d app
# Arrêter la nouvelle instance et son tunnel :
HOST_PORT=3101 docker compose -p lagon-kart-circuits --profile tunnel down
```

Les sections suivantes conservent les mesures de la **première version à un circuit**. Elles décrivent les essais historiques et leurs limites, sans prétendre que tous ont été rejoués sur l'extension.

## Historique : construction et serveur

- `npm run build` : TypeScript et compilation du client et du serveur réussis.
- `docker compose up --build -d` : image construite avec `npm ci`, conteneur démarré, état **healthy**, HTTP sur `127.0.0.1:3000`.
- `docker compose --profile tunnel config --quiet` : configuration Compose valide.
- `docker compose --profile tunnel down` puis `docker compose up --build -d` : arrêt complet, nettoyage et redémarrage final réussis. Les noms des fichiers compilés restent ceux validés dans Chromium (`index-DBoIlx3_.js`, `index-CWoyFU1j.css`).
- Image officielle `cloudflare/cloudflared:2026.10.0` téléchargée et exécutée ; attend l'application saine, tunnel HTTP/2 établi.
- HTTP `/healthz`, fichiers compilés, notices et lien direct `/room/CODE` servis par le même processus.
- Proxy Vite de développement validé avec deux clients SDK sur `:5173` : matchmaking HTTP, snapshots WebSocket, lien direct, décompte, mouvement de 26,32 m observé à l'identique par les deux clients, commande 39 acquittée. Rapport : `test-results/vite-proxy.json`.

## Tests des règles et du serveur

`npm test` : **21 tests comptés par Node, 21 réussis, aucun échec**. La sortie « Max payload size exceeded » est attendue : un test envoie volontairement un message de 4 Kio et vérifie sa fermeture avec le code 1009.

Les 13 tests de simulation couvrent les entrées forgées, le décompte, l'ordre et le sens des checkpoints, trois tours et résultat commun, la remise en piste, le déterminisme du mouvement, le drift/mini-turbo, le hors-piste, les trois objets et leurs impacts/expirations, les collisions, les déconnexions, les délais de fin, les spectateurs et les abandons. Un pilote automatique n'utilisant que des commandes ordinaires fait finir huit karts, avec objets et collisions, entre 54,1 et 59,8 secondes de **temps simulé**.

La suite serveur utilise un vrai port HTTP/WebSocket éphémère : règles hôte/prêts, arrivée en spectateur, messages invalides, anciennes époques, doublons, silence réseau, reconnexion et rotation du jeton, actions brèves entre deux ticks, rafales de commandes, réservation des huit places, expiration/DNF, revanche, contrôle HTTP 4 Kio, WebSocket 2 Kio et fréquence des messages. Les fixtures de cette suite raccourcissent les phases de course ; la course complète est vérifiée séparément ci-dessous.

## Huit clients réseau

`npm run test:network` contre **le conteneur Docker** : huit instances SDK Colyseus, dans un salon, pilotent leurs karts par les entrées normales. Ce ne sont pas huit navigateurs.

- Huit sur huit terminent trois tours ; classement identique pour tous.
- Neuvième joueur refusé ; salon absent refusé ; autre salon indépendant.
- Aucune adresse privée dans la réservation Colyseus.
- Position/tour/victoire imposés et commandes invalides refusés.
- Reconnexion sans doublon, session et progression conservées, jeton changé, ancienne époque refusée.
- Les trois types d'objets sont observés ; effets et expiration sont également vérifiés par les tests des règles.
- Revanche propre et transfert de l'hôte réussis.

Exécution complète : **63,584 s**, dont 55,755 s dans la boucle de pilotage après les premières vérifications de course/reconnexion. Environ 1 275 instantanés et 7,3 Mo de représentations JSON par client. Cette dernière valeur est une estimation avant encodage, **pas une mesure des octets WebSocket sur le réseau**.

Rapport : `test-results/network.json`.

Le même test à huit clients avec `LATENCY_MS=75` passe : retard de 75 ms sur l'envoi des commandes et 75 ms sur la prise en compte des instantanés, soit environ **150 ms aller-retour simulés**. Tous finissent trois tours ; exécution complète 64,596 s. Rapport : `test-results/network-latency.json`. Cette injection de délai au niveau applicatif ne simule ni pertes de paquets ni jitter et ne mesure pas à elle seule la fluidité visuelle.

## Deux URL publiques successives

Deux vraies courses multijoueurs **par le tunnel**, au-delà de la page d'accueil, ont réussi avec deux clients SDK : matchmaking HTTPS, socket WSS, déplacement, trois tours, classement partagé, objets, reconnexion, anti-rejeu et revanche.

1. Premier tunnel : exécution complète 71,885 s.
2. Redémarrage du **seul tunnel**, nouvelle adresse ; même conteneur et même image d'application, aucun rebuild : deuxième exécution complète 72,148 s.

Les fichiers JS et CSS ont été chargés en HTTPS avec statut 200 sur chacune des deux origines, sans adresse temporaire dans le bundle. Les rapports conservent les URL temporaires et les identifiants d'image utilisés :

- `test-results/tunnel-network.json`
- `test-results/tunnel-network-second.json`
- `test-results/tunnel-assets.json`
- `test-results/tunnel-assets-second.json`
- `test-results/tunnel-rotation.json`

Le tunnel a ensuite été arrêté ; ces URL de test ne constituent pas des liens de jeu permanents. Relancer le profil tunnel pour obtenir une nouvelle URL à partager.

## Navigateur et rendu

`npm run test:browser` contre le conteneur Docker : **réussite complète**, deux contextes/sessions isolés dans Chromium 145 via Playwright. Les pilotes passent par les boutons de l'interface, puis les événements clavier habituels ; aucune position ni progression n'est imposée au serveur par le test.

- Création et accès au salon par lien, deux pseudos/couleurs, prêts et départ synchronisé.
- Accélération au clavier observée depuis les deux sessions.
- Actualisation pendant la course : même session, deux joueurs au total, jeton renouvelé.
- Perte de focus : accélérateur relâché.
- **Les deux pilotes terminent leurs trois tours** et voient les mêmes rangs ; revanche entièrement réinitialisée.
- Assets et sockets sur la même origine ; **aucune erreur JavaScript**.

Rapport : `test-results/browser.json`. Captures : `test-results/home.png`, `lobby.png`, `race.png`, `results.png`.

Les essais initiaux ont conduit à corriger le traitement du code de fermeture 1000 et du cas où la demande de reprise précède la réservation de reconnexion, à sécuriser les cibles des événements clavier, à rendre l'interface utilisable sur une petite hauteur et à adapter le rendu lent. La géométrie statique est regroupée par matériau pour réduire les appels de dessin ; en dessous de 20 images/s pendant trois secondes, les ombres sont désactivées et la résolution réduite.

**Performance mesurée** : rendu logiciel SwiftShader, deux sessions simultanées, tailles 1440×900 et 1280×800 ; médiane **2,61 images/s** par session, minima 0,83 et 0,49, maxima 4,69 et 3,87. Le test fonctionnel aboutit, mais cette configuration est trop lente pour une conduite agréable. Ces mesures ne démontrent pas les 60 images/s visées sur un ordinateur utilisant son GPU. Tester avec l'accélération graphique activée avant d'organiser une partie.

Un contrôle complémentaire en **800×600**, avec une seule session, confirme le bouton Entraînement accessible, le démarrage de la course et le passage automatique au profil `light` ; mesure ponctuelle **6,89 images/s**, à ne pas comparer à une médiane sur une course. Rapport : `test-results/browser-quality.json`.

## Limites connues

- Quatre circuits de 611 à 731 m, trois tours par course, un seul processus serveur et état en mémoire ; aucun historique persistant.
- Capacité vérifiée : huit clients SDK dans un salon et plusieurs salons indépendants ; les valeurs de configuration ne garantissent pas seize salons pleins ni huit navigateurs graphiques simultanés sur tout ordinateur.
- Les instantanés complets consomment plus de bande passante qu'une synchronisation par différences. La connexion montante de l'hôte et le service de tunnel peuvent limiter une partie.
- Les mesures graphiques utilisent Chromium/SwiftShader sur CPU. L'objectif de 60 images/s sur une machine avec accélération graphique reste à mesurer sur un ordinateur de joueur.
- Les boutons tactiles sont basiques et n'ont pas été validés sur téléphone. Pas de prise en charge de manette.
- Les essais d'exploitation ont été effectués avec Docker Desktop/WSL. Les procédures macOS et Linux sont fournies mais n'ont pas été exécutées sur ces deux plateformes.
- `npm audit` signale encore trois entrées liées à **NanoID 2.1.11**, dépendance transitive de Colyseus 0.16 (deux modérées par propagation et une élevée). Les sources installées montrent que Colyseus appelle `generateId()` avec une longueur constante de 9 ; les longueurs invalides visées par ces avis ne sont pas exposées par les commandes du jeu. Cela ne rend pas l'audit vierge : une mise à niveau majeure de Colyseus avec revalidation du réseau reste à prévoir pour retirer cette dépendance. Les alertes initiales des outils de développement ont été corrigées.

## Refaire les vérifications manuelles

1. Démarrer avec `docker compose up --build -d`, vérifier `docker compose ps`, ouvrir http://localhost:3000.
2. Créer un salon dans une fenêtre et rejoindre son lien dans un autre profil de navigateur ; choisir deux pseudos/couleurs.
3. Se déclarer prêts, lancer, vérifier le même décompte, rouler et constater les déplacements adverses.
4. Drifter puis relâcher, ramasser/utiliser chacun des objets, sortir sur l'accotement et utiliser R. Vérifier vitesse/effets et mini-carte.
5. Actualiser pendant la course : reprendre sa place, sans doublon ni retour injustifié au départ. Couper/rétablir brièvement le réseau pour tester la fenêtre de reprise.
6. Terminer trois tours, comparer les résultats et lancer une revanche. Tester un arrivant en pleine course et un départ de l'hôte.
7. Activer le profil tunnel, ouvrir son URL dans les deux navigateurs (idéalement depuis deux réseaux), refaire une course ; dans les outils réseau vérifier HTTPS, WSS et l'origine des réservations.
8. Redémarrer seulement le tunnel, consulter la nouvelle URL et rejoindre sans reconstruire ; arrêter avec `docker compose stop tunnel`, puis `docker compose --profile tunnel down`.
