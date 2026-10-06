# Lagon Kart — suivi de la démo

État au **6 octobre 2026**. `[x]` = réalisé avec preuve ; `[ ]` = travail ou validation restant à terminer. [Démo intégrée et rapports](docs/DEMO.md).

## Couverture du cahier des charges ajouté à la racine

Le fichier [to-do.md](to-do.md) contient les besoins de référence. Ce suivi avait été limité aux travaux de démo et omettait les ajouts de ce cahier des charges. **L'ensemble de ces besoins n'est pas implémenté.** L'audit ci-dessous repose sur la lecture du code actuel ; aucun nouveau test de fonctionnalité n'a été exécuté pour cet audit.

| Besoin | État réel | Reste à réaliser |
| --- | --- | --- |
| 1. Construction et personnalisation avancée | Non réalisé. Un kart visuel, huit couleurs et les mêmes paramètres de conduite pour tous. | Choix châssis, moteur, pneus, turbo, aileron et poids ; effets réels sur vitesse, accélération, maniabilité, adhérence, stabilité et terrains ; déblocages progressifs et interface simple. |
| 2. Circuits évolutifs | Non réalisé. Les quatre tracés et leurs zones sont fixes pendant les trois tours. | Événements et transformations synchronisés : catastrophes/météo, routes ou ponts détruits, plateformes, obstacles mobiles, terrains et raccourcis changeants ; annonces et changements visuels compréhensibles. |
| 3. Plusieurs stratégies par circuit | Non réalisé. Drift, surfaces et placements existent, mais chaque circuit possède un tracé unique sans branches. | Routes alternatives viables avec compromis risque, durée, objets, maîtrise du drift, poids et pneus ; disponibilité évoluant pendant la course. |
| 4. Championnats et progression | Partiel. Tournois de 2 à 8 courses, choix manuel/aléatoire et classement cumulé disponibles dans un salon. | Progression durable du joueur, championnats gradués, apprentissage puis combinaison des routes, terrains, obstacles, météo et transformations ; difficulté fondée sur la maîtrise. |
| 5. Personnages humoristiques | Non réalisé. Un pilote casqué générique est partagé par les karts. | Reine britannique, Barack Obama, Donald Trump et Kim Jong-un en caricatures cartoon ; véhicules, expressions et animations propres, réactions en course, victoire et impacts. |
| 6. Mode équipes | Non réalisé. Courses et scores individuels ; aucun CPU intégré au jeu. | Mode distinct 4 contre 4, équipes humaines et/ou CPU, rôles stratégiques et score collectif sur plusieurs courses. |
| 7. Ranked amélioré | Non réalisé. Les salons privés et tournois existants ne constituent pas un mode classé. | Bronze à Master, MMR, matchmaking compétitif, saisons, classement mondial, statistiques persistantes, replays, ghosts, tournois classés et circuits évolutifs. |
| 8. Philosophie générale | Contrainte à vérifier à chaque ajout. Le projet existant est conservé ; aucun monde ouvert, récit complexe ou système RPG ajouté. | Vérifier accessibilité immédiate, lisibilité, rythme, profondeur de maîtrise et utilité de chaque mécanique avec des joueurs occasionnels et expérimentés. |

Points de contrôle dans le code : [modèle du kart et conduite](shared/game.ts), [tracés et surfaces](shared/track.ts), [tournois](shared/tournament.ts), [gestion des salons](server/RaceRoom.ts), [sélection du pilote](client/main.ts), [pilote visuel générique](client/kart-model.ts). Le pilote automatique de `shared/autopilot.ts` est utilisé par les tests et scripts de validation ; il n'est pas proposé comme adversaire CPU dans le jeu.

- [ ] Besoin 1 : garage de pièces, caractéristiques et déblocages.
- [ ] Besoin 2 : transformations de circuits pendant les courses.
- [ ] Besoin 3 : branches et choix de routes stratégiques.
- [ ] Besoin 4 : compléter les tournois par une progression de championnats.
- [ ] Besoin 5 : quatre personnages et leurs animations/véhicules.
- [ ] Besoin 6 : équipes 4 contre 4 et CPU jouables.
- [ ] Besoin 7 : ensemble du mode classé et sa persistance.
- [ ] Besoin 8 : validation de la philosophie sur les nouvelles fonctionnalités.

## Terminé et vérifié

- [x] Quatre circuits avec tracés et surfaces propres ; aspiration et départ turbo ; tournois de 2 à 8 courses, sélection manuelle ou aléatoire et classement cumulé. Version de référence : commit [`51bbbab`](https://github.com/Mfivez/lagon-kart/commit/51bbbab3c78cc5454124ae67682fad2fdfcd5dde). Voir [README](README.md#circuits-et-tournois) et [historique des validations](VALIDATION.md).
- [x] Kart gratuit **Go Kart de Zsky**, source et licence CC BY 3.0 conservées, crédits accessibles ; GLB local versionné et conversion reproductible sans Blender. Budget **0 €**, aucune API IA payante. Voir [inspection et préparation](docs/KART_ASSET.md).
- [x] Huit peintures indépendantes, géométries partagées, un chargement GLB par page, quatre roues avec pivots et rayons adaptés, braquage avant, inclinaison visuelle et ombre de contact ; ancien kart disponible en secours. La présentation ne modifie pas les trajectoires ni les collisions.
- [x] **63 tests réussis**, build TypeScript/Vite et image Docker construits ; conversion `npm run check:kart` vérifiée. Voir [rapport de démo](docs/DEMO.md#tests-exécutés).
- [x] **8 contrôles visuels réussis**, dont partage des géométries, couleurs, animation, garde au sol et secours après HTTP 404. [Captures avant/après à cadrage identique](docs/kart-visuals/README.md).
- [x] Correction du suivi de caméra à faible cadence vérifiée à **3 FPS** : kart dans le champ et état physique intact. Commande : `node --import tsx scripts/kart-visual-check.ts --camera-only` ; rapport local : `test-results/kart-camera.json`.
- [x] Course complète via **Docker et tunnel public** : quatre pilotes SDK terminent trois tours, deux sessions Chromium observatrices affichent les mêmes résultats, sans erreur JavaScript. GLB et crédits sur la même origine HTTPS, connexion WSS vérifiée. Ce résultat ne représente pas deux machines physiques.

- [x] Nouvelle course avec caméra corrigée : réussite en 70,02 s, quatre pilotes et deux observateurs ; résultat consigné dans [KART_DEMO.md](docs/KART_DEMO.md) et [VALIDATION.md](VALIDATION.md).
- [x] Première musique synthétique intégrée et testée, puis remplacée à la demande par les MP3 fournis. Les résultats de son ancien séquenceur restent archivés.
- [x] MP3 fournis intégrés : Lap 1 au premier tour, Lap 2 aux suivants, sur tous les circuits. Originaux conservés, fichiers versionnés locaux, volume/pauses/boucles vérifiés ; **10 contrôles Chromium réussis**, build hôte et Docker valides. [Preuves et fonctionnement](docs/MUSIC.md).
- [x] MP3 déployés et validés sur le tunnel : **course complète en 67,4 s, sortie 0**, quatre pilotes SDK et deux observateurs Chromium ; Lap 1 puis Lap 2, volume, arrêt à l'arrivée, fichiers identiques et zéro erreur JavaScript. [Course](docs/mp3-public.json) · [Intégrité des fichiers](docs/mp3-public-assets.json).
- [x] Huit objets, dont fusée rouge, comète bleue, triple turbo, étoile et bouclier : 13 nouveaux tests des règles, refus de la falsification d'inventaire et **7 contrôles navigateur** couvrant les huit objets. Trois pressions E réelles, durées et HUD vérifiés. [Objets](docs/ITEMS.md).
- [x] Version intégrée reconstruite et course publique complète réussie en **65,036 s** : quatre pilotes SDK, deux navigateurs observateurs, résultats communs, musique/volume/GLB et zéro erreur JavaScript. [Rapport](docs/DEMO.md).

- [x] Tournoi public complet à deux pilotes sur les quatre circuits : **303,565 s, sortie 0**, trois tours chacun, reconnexion, scores, revanche, programme aléatoire et isolation des salons. L'historique du premier lancement interrompu après ses résultats est conservé dans [le rapport](docs/DEMO.md).

## Priorités restantes et critères de validation

- [ ] **Priorité 2 — essai humain sur deux ordinateurs.** Depuis le lien public, deux personnes rejoignent le même salon, conduisent au clavier, utilisent les objets, terminent une course et lancent la suivante. Vérifier aussi une reconnexion. Si possible, utiliser deux réseaux distincts. Suivre la [procédure manuelle](VALIDATION.md#refaire-les-vérifications-manuelles).
- [ ] **Priorité 2 — fluidité sur les machines de démo.** Activer l'accélération graphique, relever les performances dans les navigateurs habituels et vérifier la lisibilité du kart, les roues, la caméra et le son en conduite. Les captures SwiftShader et le contrôle à 3 FPS ne démontrent pas une fluidité à 60 FPS sur GPU.
- [ ] **Priorité 2 — écouter les MP3 en jeu.** Vérifier à l'oreille l'équilibre musique/moteur sur les haut-parleurs des collègues, ainsi que la transition du premier au deuxième tour. La validation automatisée ne remplace pas cette écoute.
- [ ] **Conditionnel — téléphone.** Si le public de la démo utilise un mobile, tester commandes tactiles, cadrage, audio et connexion au salon sur un vrai téléphone. Ce support reste non validé.
- [ ] **Suivi ultérieur — dépendances transitives.** Les trois entrées d'audit liées à NanoID 2.1.11/Colyseus 0.16 restent documentées dans [les limites connues](VALIDATION.md#limites-connues). Une éventuelle mise à niveau devra revalider le réseau ; aucune migration de dépendances n'est incluse dans cette démo.

Les rapports de travail sont dans `test-results/` et ignorés par Git ; les preuves de livraison sont conservées dans `docs/demo-results/` et `docs/kart-visuals/`. Mettre à jour les cases uniquement après une exécution ou une vérification effective, puis synchroniser les comptes rendus de validation.
