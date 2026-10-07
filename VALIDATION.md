# Validation de Lagon Kart

Vérifications des 6 et 7 octobre 2026 dans WSL/Linux avec Docker Desktop 4.55.0, Docker Engine 29.1.3, Compose 2.40.3, Node 20.19.2 sur l'hôte et Node 22.21.1 dans l'image. Les résultats ci-dessous distinguent simulation, clients réseau automatisés et navigateur ; chaque lot conserve ses preuves et sa date.

## 7 octobre 2026 — retrait de Monsieur Gaffe

Le catalogue et le modèle `bean` sont retirés à la demande de l’utilisateur :
**14 pilotes**, neuf ajouts conservés. L’ancien choix revient au pilote casqué.
Le test du catalogue (14 IDs valides, `bean` invalide), le build et Docker passent.
La galerie est régénérée : **6/6 contrôles**, **84 instances**, trois modèles,
peintures indépendantes et animations conservées ; 11 882 triangles et
44 maillages maximum, aucune erreur JavaScript.
[Rapport courant](docs/characters/validation.json).

Déploiement sans salon actif, client `index-G7ETGeSm.js`, catalogue serveur
identique au build et **21 fichiers de sauvegarde inchangés**, tunnel conservé.
[Déploiement du retrait](docs/characters/removal-deployment.json).

Le contrôle Chromium public réussit également : écran 320 × 568, **14 options**,
ancien choix local `bean` remplacé par `racer` et aperçu casqué rendu, aucune
erreur JavaScript. Aucun salon ni course ouvert pour ce contrôle ciblé.
[Rapport](docs/characters/removal-browser.json) ·
[Capture actuelle](docs/characters/removal-mobile-320.png).

La section suivante décrit le lot initial, avant retrait. Son rapport de rendu
et sa galerie ont été actualisés ; les rapports réseau restent historiques.

## 7 octobre 2026 — dix nouveaux pilotes caricaturaux

**Quinze personnages au total**, trois modèles de kart et huit peintures.
Trois nouvelles caricatures politiques et sept clins d’œil aux jeux, séries
et films, en géométrie originale partagée. Aucun téléchargement de personnage,
service payant ou nouvelle dépendance ; **0 €**. Le garage affiche le casting,
la description humoristique et l’aperçu animé ; sélecteurs tactiles de 44 px
minimum sur petit écran. [Casting et portraits](docs/CHARACTERS.md).

**27/27 tests ciblés réussis**, sans échec, en **27,25 s** :
`node --import tsx --test --test-concurrency=3 tests/characters.test.ts tests/garage.test.ts tests/kart-assets.test.ts tests/server.test.ts`.
Les 45 couples personnage/châssis gardent une conduite identique à commandes
identiques ; validation des identifiants, actifs et échanges serveur.
Journal : `/tmp/lagon-roster-tests.log`. La suite complète **312/312** ci-dessous
appartient au lot précédent ; elle n’a pas été rejouée pour cet ajout visuel.

**6/6 contrôles de rendu Chromium réussis** : 90 instances, quinze pilotes
sur trois karts et deux peintures. Trois GLB téléchargés une fois, géométries
partagées, peinture indépendante, animations de conduite/impact/victoire
isolées et aucune erreur JavaScript. Maximum mesuré : **11 882 triangles,
44 maillages** par kart avec pilote, sous les budgets existants. Quinze portraits,
trois groupes de cinq et la galerie complète sont produits par le moteur du jeu
et inspectés. [Rapport](docs/characters/validation.json) ·
[Galerie](docs/characters/lineup.png).

**6/6 contrôles du garage en réseau privé réussis**, deux contextes Chromium,
dont un écran de **320 × 568** : casting complet, aperçu, restauration après
rechargement, transmission de chacun des dix nouveaux choix au second client,
stats inchangées et retour au pilote par défaut pour un identifiant invalide.
Départ réel à **huit karts**, deux humains et six CPU : les deux pilotes commandés
au clavier avancent de **5,35 m et 5,04 m**, sans placement forcé. Aucun secours
ou asset manquant, aucune erreur JavaScript. Le sélecteur mobile trop petit
repéré lors d’un premier essai a été agrandi à 44 px, puis le parcours entier
rejoué avec succès. [Rapport](docs/characters/roster-browser-validation.json) ·
[Garage mobile](docs/characters/garage-roster-mobile-320.png) ·
[Départ à huit](docs/characters/race-new-drivers-8-karts.png).

**Build hôte, typage et Docker réussis** ; client `index-CNhD6czR.js`, styles
`index-DHM7KfgD.css`. Déploiement sans salon actif : **21 fichiers de sauvegarde
identiques** avant/après et lisibles à l’identique dans le conteneur ; cinq
modules serveur et deux assets publics correspondent au build par SHA-256.
Le montage garde le même dossier Windows/WSL et le tunnel n’est pas recréé.
Adresse actuelle relevée dans ses logs :
https://miles-blades-tulsa-citizens.trycloudflare.com.
[Empreintes et déploiement](docs/characters/deployment.json).

**7/7 contrôles publics réussis** sur cette version : garage complet et écran
320 px, choix conservé après rechargement, deux navigateurs indépendants dans
le même salon HTTPS/WSS, changement de pilote répliqué et départ réel à deux.
Les pilotes Seigneur du casque et Prof de chimie avancent respectivement de
**5,13 m et 4,40 m** par commandes clavier ; un GLB par navigateur, aucun secours
ni erreur JavaScript ou ressource manquante. Deux invités créés par les
formulaires ordinaires ; sortie propre et retour à **0 salon**, serveur sain.
[Rapport public](docs/characters/public/roster-browser-validation.json) ·
[Garage mobile public](docs/characters/public/garage-roster-mobile-320.png) ·
[Départ public](docs/characters/public/race-new-drivers-2-karts.png).

Le rendu automatisé utilise SwiftShader ; la fluidité sur téléphone physique
reste à vérifier. Ce lot valide un départ et une courte conduite : aucune
nouvelle course complète ni essai sur deux machines physiques n’est revendiqué.

## 7 octobre 2026 — bots, fermetures et rails des déviations

**312/312 tests réussis**, sans échec, annulation ou test ignoré, en **107,337 s** :
`node --import tsx --test --test-concurrency=4 tests/*.test.ts`.
Journal : `/tmp/lagon-cpu-full-tests.log`. Les **29 nouveaux tests** couvrent
234 scénarios conduits sur les douze circuits, plus les conditions de remise en
piste : fermeture avec un CPU déjà engagé, voies extérieures, branches jusqu'au
premier checkpoint après leur sortie, jonctions ouvertes, hauteur et saut,
délai et verrou du reset. Les entrées CPU ne modifient pas les karts directement.

La cause reproduite était un changement de waypoint vers une autre voie à
travers son rail. Le pilote suit désormais la branche ouverte engagée, y adapte
son anticipation et sa vitesse, ou continue sur la principale s'il a déjà
dépassé le barrage. Un contact réel à faible vitesse peut demander le reset
ordinaire ; les ouvertures et dégagements au-dessus des murs restent respectés.
La physique, les checkpoints et les règles de progression restent identiques.

Un diagnostic complémentaire de **360 placements** à deux niveaux d'événements
et trois positions latérales passe de **34 échecs avant à 0 après**. Les fixtures
définissent les positions et portes antérieures avant l'essai ; ensuite seules
les commandes ordinaires du CPU déplacent le kart. Les courses complètes de la
suite font arriver **96 CPU sur 96**, soit huit sur chacun des douze circuits,
avec objets actifs et trois phases. [Méthode et résultats](docs/cpu-obstacles/simulation-validation.json).

**Navigateur privé : 3/3 contrôles réussis** avec de vrais CPU de `RaceRoom`
et un observateur Chromium. Le franchissement physique de la ligne par un
pilote SDK déclenche la fermeture. Mangrove : deux portes gagnées en **2,63 s**,
aucune remise en piste. Citadelle : deux portes en **7,40 s**, une remise en piste
normale ; aucun arrêt prolongé. Durées de simulation. Les positions initiales
sont des fixtures de secteur, pas des courses complètes. Quatre captures
inspectées, aucune erreur JavaScript ni ressource manquante.
[Protocole et captures](docs/cpu-obstacles/README.md) ·
[Rapport navigateur](docs/cpu-obstacles/browser-validation.json).

**Build et Docker réussis, correctif déployé sans salon actif**. Sept modules
de l'image correspondent aux fichiers compilés locaux ; les vingt fichiers
de sauvegarde restent identiques après recréation. Le tunnel n'a pas été recréé.
Le client `index-Dk-_5CP3.js` reste identique : le correctif porte sur le pilotage
serveur. [Empreintes et déploiement](docs/cpu-obstacles/deployment.json).

**Course publique du correctif réussie** sur Mangrove : **8/8 arrivées**, dont
**sept vrais CPU serveur** et un pilote SDK, trois tours et phases 0/1/2.
Les sept CPU sont observés sur la déviation, **aucun reset observé**, durée
maximale sans progression **0,667 s**. Contrôle complet en **78,65 s**, sans
placement, checkpoint ou arrivée forcés ; 1 435 snapshots reçus. La progression
du pilote est sauvegardée à partir de la course réelle. Aucune erreur serveur
ou Colyseus, puis `/healthz` sain et **0 salon**. Ce contrôle réseau ne lance
pas de navigateur ; le rendu est vérifié séparément ci-dessus.
[Rapport public](docs/cpu-obstacles/public-race.json).

## 7 octobre 2026 — comptes et sauvegardes sur la machine hôte

**283/283 tests réussis**, sans échec, annulation ou test ignoré, en **81,856 s** :
`node --import tsx --test --test-concurrency=4 tests/*.test.ts`.
Les 17 nouveaux tests couvrent les comptes et l'API HTTP/Colyseus : inscription,
unicité des identifiants, rattachement d'un invité, récupération de progression,
sessions indépendantes, révocation, limites de tentatives et rejet de données
forgées. Les profils historiques restent lisibles. Une première exécution de
la suite s'est bloquée dans un processus Node sans socket serveur ; arrêt ciblé,
test serveur isolé réussi puis relance complète à concurrence limitée. Aucun
test métier n'a été supprimé ou assoupli. Journal final :
`/tmp/lagon-accounts-full-tests-retry.log`.

**Compilation complète et image Docker réussies**, client `index-Dk-_5CP3.js`,
styles `index-BxI9vH7J.css`. La première compilation hôte a rencontré une erreur
de répertoire courant WSL (`uv_cwd`) ; la relance depuis le dossier explicite a
réussi. Aucune dépendance ajoutée, coût **0 €**.

**9/9 contrôles navigateur privés réussis**, deux contextes Chromium indépendants,
dont un écran tactile émulé **320 × 568** : inscription depuis un invité, mêmes
ID/XP/coupe récupérés, erreurs visibles, nom restauré après actualisation,
salon Colyseus authentifié et déconnexion limitée à la session courante.
Les **195 XP et la coupe sont une fixture dans un stockage temporaire**,
pas une nouvelle course jouée. Aucun mot de passe dans les stockages navigateur,
aucune erreur JavaScript ni ressource manquante.
[Rapport](docs/accounts/browser-validation.json) ·
[Formulaire mobile](docs/accounts/register-mobile-320x568.png) ·
[Compte récupéré](docs/accounts/recovered-mobile-320x568.png).

**4/4 contrôles Docker de persistance réussis** : création du compte par HTTP,
résultat/replay de fixture enregistré serveur arrêté, `compose down -v`, nouveau
nom de projet, puis connexion sans ancien jeton. ID, profil, **45 XP**, statistiques
et replay restent identiques ; session révoquée après déconnexion. L'image exacte
et le nettoyage des ressources temporaires figurent dans le
[rapport](docs/accounts-persistence.json). **8/8 contrôles de migration réussis** :
copie SHA-256, réexécution identique, archive restaurable, refus des sources actives,
des écrasements, des vrais liens symboliques et des chemins non dédiés ; alias
Windows/WSL acceptés. [Rapport](docs/storage-migration-check.json).

**Migration de l'instance de démo effectuée sans salon actif** : 21 profils,
20 fichiers et 432 207 octets copiés depuis `lagon-kart_player-data`, avec
comparaison SHA-256 et conservation du volume original. Une archive locale
est créée dans `backups/`. Le jeu tourne comme utilisateur `node` avec le
dossier hôte `data/` monté dans `/app/data`. **`npm run data:reset` exécuté** :
les 20 fichiers restent strictement identiques après reconstruction et recréation,
le tunnel reste actif et `/healthz` est sain. JS/CSS publics et quatre modules
serveur correspondent aux fichiers compilés locaux. [Déploiement, image et
empreintes](docs/accounts/deployment.json).

**4/4 contrôles navigateur publics réussis** sur le même bundle, via HTTPS et
le tunnel : inscription avec l'Origin réel du navigateur, connexion depuis un
second contexte mobile vierge, même pilote dans un vrai salon Colyseus, sortie
et déconnexion. Aucune erreur JavaScript ni ressource manquante ; `/healthz`
renvoie ensuite `ok` et **0 salon**. Un compte de test vide reste enregistré,
sans XP fictifs ajoutés aux données de la classe.
[Rapport public](docs/accounts/public-validation.json).

Les essais utilisent des navigateurs indépendants sur cette machine. Aucun
essai de comptes sur deux ordinateurs physiques ni de saisie avec un clavier
mobile réel n'est revendiqué. Les règles de course sont couvertes par la suite ;
les courses complètes du lot mobile ci-dessous restent des preuves historiques.
[Mode d'emploi, migration et archives](docs/ACCOUNTS_STORAGE.md).

## 7 octobre 2026 — commandes mobiles, tracés et décors

**Course publique du build mobile réussie** sur [le tunnel de cette session](https://exercises-inspections-playlist-char.trycloudflare.com),
en **143,537 s pour le contrôle complet**. Quatre pilotes SDK authentifiés ont
terminé trois tours de l’Archipel céleste en envoyant uniquement les commandes
ordinaires, sans placement artificiel ni arrivée forcée. Les quatre ont sauté
et sont passés inversés dans le looping (altitude maximale proche de 32 m).
Les phases 0/1/2 et le même classement final sont observés sur les **six
connexions** : quatre pilotes et deux contextes Chromium indépendants,
desktop et mobile émulé 390 × 844.

Trois modèles, quatre personnages, chargements GLB uniques par page, MP3 Lap 1
puis Lap 2 et arrêt à l’arrivée ont été contrôlés. Les statistiques des quatre
profils sont enregistrées et leur replay commun porte la **révision 2**, avec
**603 images enregistrées par pilote**. Aucune erreur JavaScript ni ressource
manquante n’a été détectée. [Rapport public](docs/mobile-scenes-public-race.json) ·
[tour 1](docs/mobile-scenes-public-tour-1.png) · [tour 3](docs/mobile-scenes-public-tour-3.png) ·
[résultats](docs/mobile-scenes-public-resultats.png).

Les observateurs utilisent SwiftShader sur un seul hôte : **2,25 et 2,65 FPS**
relevés en fin de contrôle. Cette mesure ne valide pas la fluidité sur GPU,
une conduite humaine tactile ni une partie sur deux ordinateurs physiques.

**Suite complète : 266/266 tests réussis**, sans échec, annulation ou test ignoré,
en **63,21 s** (`/tmp/lagon-mobile-scenes-tests-final.log`). Les nouveaux cas
portent sur les commandes tactiles, les loopings, le dégagement des décors et
la compatibilité des replays. Les régressions des tours, branches, huit objets,
équipes, sauts, murs finis, progression et courses à huit pilotes restent dans
cette suite. Une fixture CPU Néon contenant d’anciennes coordonnées a été
adaptée au tracé courant ; ni les assertions métier ni la conduite CPU n’ont
été affaiblies.

**Compilation et Docker réussis** : TypeScript, Vite et compilation du serveur,
client `index-wc3mK_Sw.js`, styles `index-DhaT9t6d.css`. Le conteneur a été
recréé en l’absence de salons, avec le volume `lagon-kart_player-data` conservé.
Les changements tardifs portent sur le rendu : maillage des loopings, caméra,
étiquettes et précision de profondeur des panoramas. Ils sont vérifiés dans
le navigateur ; ils ne changent pas les règles couvertes par la suite complète.

Les douze pistes ont de nouveaux tracés et décors. Sky et Foundry possèdent des
loopings magnétiques de 32 et 27 m : serveur, client, collisions et objets
partagent la même pose 3D. Les 36 branches, ponts, tremplins et tours ordonnés
sont conservés. Les replays historiques restent lisibles sans fond de circuit
incompatible ; seuls les enregistrements de révision 2 peuvent devenir les
fantômes de ces pistes. [Contrat et tests](docs/LOOPINGS.md).

La comparaison des commandes de Mario Kart Tour et Asphalt est sourcée dans
[MOBILE_CONTROLS.md](docs/MOBILE_CONTROLS.md). Les essais Chromium couvrent
320 × 568, 360 × 640, 390 × 844, 568 × 320 et 667 × 375, le multitouch réel via
CDP, direction/drift/objet simultanés, frein prioritaire, pédale manuelle,
interruptions et changement d’orientation. Une fixture attribue un triple
turbo pour mesurer une charge par pression ; l’objet est ensuite utilisé par
le geste ordinaire. Une perte de focus est déclenchée par événement synthétique.
[Rapport des commandes et captures](docs/mobile-controls/validation.json).

La dernière exécution sur `index-wc3mK_Sw.js` a réussi **15/15 contrôles** :
les treize commandes/états précédents et deux fixtures de visibilité ciblées,
en 390 × 844 et 320 × 568. Le kart est posé près d’une pancarte puis la scène
est suspendue pour vérifier que son fondu dégage la vue ; sa projection reste
hors du compteur avec 12 px de marge. Ces deux fixtures démontrent la
présentation, pas une course conduite. [Pancarte et kart](docs/mobile-controls/after-near-sign-390x844.png),
[cadrage 320 px](docs/mobile-controls/after-hud-clearance-320x568.png).

**Déploiement vérifié :** huit assets publics (JS, CSS, trois karts, arbre et
deux MP3) et sept modules du serveur ont des SHA-256 identiques aux fichiers
compilés locaux. Image `sha256:212f2dc4bd7001dc1b77192d92224858a75c2d48833c7fb33fcc8445edaca871`,
volume conservé, service sain. [Empreintes et montage du volume](docs/mobile-scenes-public-assets.json).
URL de cette session : [démo publique](https://exercises-inspections-playlist-char.trycloudflare.com).

Les décors utilisent des formes originales regroupées par matériau et un
arbre **Kenney CC0** de 14 480 octets, chargé une fois depuis la même origine.
Source, licence et inspection sont conservées dans le dépôt. **0 €**, aucune
API payante ou dépendance npm ajoutée. Les 13 tests de décors contrôlent les
voies principales et futures branches, leurs bords et trois mètres de marge,
ainsi que le corridor réel des loopings. [Décors et sources](docs/SCENERY.md).

La validation visuelle a révélé des défauts absents des assertions de position :
route masquant le kart au sommet, surfaces superposées, étiquette trop grande,
brouillard trop proche et panoramas tronqués. Les essais initiaux sont conservés
en **échec visuel** dans [le diagnostic](docs/scenes-v2/diagnostic-initial/validation.json).
La version corrigée utilise une grille commune sur les loopings, une poursuite
rapprochée suivant le kart, une garde de caméra côté chaussée et un plan proche
adapté à la distance dans les panoramas. [Captures, mesures et revue finale](docs/scenes-v2/README.md).

**Revue visuelle terminée :** douze panoramas sur le build final, avec
**14/14 contrôles Chromium** et inspection des images. Les stries restantes des
branches sont corrigées par des bordures disjointes et une grille commune ;
Port, Fonderie et Citadelle ont été relus spécifiquement. [Rapport final des panoramas](docs/scenes-v2/branches-final/validation.json).
Les **douze vues de loopings** (montée, sommet, descente, fraction 0,82 et sommets
en deux formats mobiles, pour Sky et Foundry) ont été inspectées sur
`index-Dh7OcoeP.js` ; leur maillage, pose et poursuite restent inchangés dans le
build livré. Une position initiale au sol avant l’entrée et des pauses aux
fractions réellement atteintes servent au cadrage. L’altitude et l’inversion
viennent des commandes ordinaires ; la sortie se fait au sol. Le rapport
intermédiaire reste globalement en échec à cause de ses anciennes branches,
avec la revue des loopings validée séparément ; les nouveaux panoramas ont
leur propre rapport pour ne pas mélanger les versions.

**Limites :** émulation Chromium/SwiftShader sur un seul ordinateur. Elle ne
prouve ni le confort des pouces ni les performances GPU sur Android/iPhone,
Safari iOS, les interruptions d’un véritable OS mobile, l’audio après
verrouillage ou une partie humaine sur deux machines et réseaux distincts.
Ces essais restent identifiés dans [todo.md](todo.md).

## Historique du 6 octobre — lot à douze circuits

Les résultats, URL et empreintes de cette section décrivent le lot précédent.
Ils ne sont pas présentés comme des essais rejoués sur les nouveaux tracés.

Le code comprend douze circuits, des branches larges et raccourcis réellement
plus courts, des ponts et des sauts, trois modèles de kart en huit peintures,
cinq personnages, dix-huit pièces de garage, six coupes, le classement par
saisons, les replays et ghosts et le mode quatre contre quatre. Compose conserve
les données de progression dans le volume `player-data` ; les salons actifs
restent en mémoire.

**Suite complète : `npm test`, 237/237 réussis**, aucun échec, aucune annulation
ni test ignoré, en **61,38 s**. Journal local de l'exécution :
`/tmp/lagon-tests-final-confirmed.log`. Elle inclut les courses à huit pilotes
sur les douze circuits et les régressions Néon, classique et évolutif, ainsi que
les comparaisons des raccourcis. Le rejet de message WebSocket surdimensionné
visible dans le journal appartient au test de limite de taille, réussi.

Le **contrôle TypeScript et le build final ont réussi** : client
`index-DCnyszy_.js`, feuille de style `index-CVkCqp_J.css`.
Après cette suite complète, un test supplémentaire de vrai tremplin, passage
d'un rail en vol puis atterrissage extérieur a réussi séparément : **1 exécuté,
12 hors filtre**, sans changement de physique. Le catalogue compte alors
238 tests ; aucune exécution complète de 238 tests n'est revendiquée.
Voir [les collisions verticales](docs/VERTICAL_COLLISIONS.md).

Les preuves déjà exécutées pour ces fonctionnalités sont séparées par portée :

- **Branches : 33 tests réussis**, dont huit pilotes terminant trois tours sur
  chacune des douze pistes au niveau maximal des événements, sans demande de
  remise en piste (**96 arrivées**). Les 36 branches sont parcourues à braquage
  progressif ; 24 comparaisons de secteur vérifient un gain du raccourci avec
  deux configurations de kart. [Méthode et résultats](docs/CIRCUITS.md),
  [mesures détaillées](docs/branch-comparison.json).
- **Compteur de tours et collisions verticales :** portes alternatives
  physiques, accotements, sens inverse, ordre, sauts, hauteur finie des murs et
  repositionnement sur une porte équivalente sont vérifiés. Ces fixtures de
  frontière ne remplacent pas une course continue. [Tours](docs/LAPS.md),
  [sauts et obstacles](docs/VERTICAL_COLLISIONS.md).
- **Garage : 9 tests ; objets en équipes : 10 tests**, réussis. Les essais
  mesurent les différences réelles de conduite des pièces, leur verrouillage,
  l'absence d'effet physique des modèles/personnages et la protection des alliés.
  [Garage](tests/garage.test.ts), [objets et équipes](tests/team-items.test.ts).
- **Modèles et personnages : 5 + 5 contrôles Chromium réussis**, géométries
  partagées, peintures indépendantes, trois téléchargements GLB au maximum,
  animation et secours. [Modèles](docs/KART_MODELS.md),
  [personnages](docs/CHARACTERS.md).
- **Interface à douze circuits : 11/11 contrôles Chromium réussis**, sur le
  bundle `index-CU-Fug6i.js`, avec deux contextes indépendants, garage, reconnexion,
  équipes, commandes clavier réelles, progression et lecture de replay. Les
  arrivées de tournoi et des paliers de carrière sont imposés dans le serveur
  privé pour contrôler les écrans. Ces preuves précèdent le build final
  `index-DCnyszy_.js` ; le premier lot à six circuits reste archivé.
  [Détail et captures](docs/FEATURE_BROWSER.md),
  [rapport douze circuits](docs/feature-demo-12/validation.json).
- **Progression et réseau : stockage persistant, MMR, saisons, matchmaking,
  contrôles d'accès et replays** vérifiés par les suites ciblées décrites dans
  [PROGRESSION.md](docs/PROGRESSION.md). Les tests de récompenses utilisent des
  arrivées accélérées ; ce ne sont pas des courses entièrement conduites.
- **Nouvelles pistes :** géométrie, reliefs et état des preuves du build à douze
  circuits sont consignés dans [CIRCUITS_APPENDIX.md](docs/CIRCUITS_APPENDIX.md).
  **8 contrôles navigateur réussis et 25 captures** sur `index-DDvpm3uY.js` :
  ponts, sauts et atterrissages des six nouvelles pistes, phases alternatives
  et configuration UI d’un tournoi aléatoire de huit manches. Les positions
  initiales et pauses photographiques sont mises en scène sur serveur privé ;
  les sauts proviennent de vraies commandes clavier. [Rapport](docs/circuits-expanded/validation.json).

**Persistance Docker vérifiée sur une image antérieure aux derniers correctifs
de murs :** `sha256:6bed08d4ca9348e53395513fbbda74493bb38b9dc653648f3a1111a7e812c7c1`,
bundle `index-CU-Fug6i.js`. Le contrôle local isolé a réussi en **117,697 s**.
Une course SDK de trois tours sur l'Archipel céleste, avec événements niveau 3,
s'est terminée en **108,4 s** et a créé statistiques, XP, replay et ghost.
Après suppression puis recréation du conteneur avec le même volume temporaire,
le profil, le replay et le ghost ont été retrouvés. Le conteneur et le volume
temporaires ont ensuite été supprimés. [Rapport de persistance](docs/docker-persistence.json).
Ce contrôle n'a touché ni le tunnel public ni les données utilisateur ; son
empreinte le distingue du build final et d'une course via le tunnel.

Le build final inclut également le correctif de précision de profondeur des
panoramas : plan proche à 10 m pour la vue d’ensemble, 1 m en conduite. Huit
comparaisons à cadrage fixe sur Fonderie et Citadelle, avec et sans ombres,
confirment la disparition des stries de profondeur. [Mesures et captures](docs/overview-depth/README.md).

Ces résultats ciblés ne sont pas additionnés comme un total du dernier build.
Docker sert maintenant `index-DCnyszy_.js` ; sept assets publics et quatre modules
partagés ont une empreinte identique aux fichiers compilés locaux.
[Preuve de déploiement](docs/final-public-assets.json).

**Course publique finale réussie**, sur
[le tunnel de démo](https://lunch-governmental-prep-rainbow.trycloudflare.com),
image `sha256:00aaad8a91ca32a92d6f00e83a681c3ec660b90c90a7082d059056f1bd7d279f`.
Commande : `BASE_URL=https://lunch-governmental-prep-rainbow.trycloudflare.com TRACK_ID=sky REPORT_PATH=docs/final-public-race.json CAPTURE_PREFIX=docs/final-public npm run test:final-race`.
Le contrôle termine avec code 0 en **125,721 s** : quatre pilotes SDK conduisent
par commandes ordinaires et terminent trois tours, sans arrivée ni position
imposée ; deux contextes Chromium observent. Chronos : **107,300 / 108,633 /
108,700 / 109,467 s**. Les six connexions affichent les mêmes résultats.
Les trois phases sont atteintes, les quatre pilotes décollent, chaque modèle
est téléchargé une fois par page sans secours, les deux MP3 jouent puis s’arrêtent.
Les quatre profils reçoivent leurs statistiques et un replay commun conserve
**549 échantillons par pilote**. Aucune erreur JavaScript ou ressource manquante.
[Rapport](docs/final-public-race.json) · [Tour 1](docs/final-public-tour-1.png) ·
[Tour 3](docs/final-public-tour-3.png) · [Résultats](docs/final-public-resultats.png).

Ces navigateurs utilisent SwiftShader logiciel : **2,4 à 2,9 FPS** relevés à
la fin du test. Ce résultat prouve les échanges et les comportements contrôlés,
pas la fluidité sur GPU. Les clients de test ont quitté le salon ; le serveur
et le tunnel restent actifs, santé publique vérifiée après leur fermeture.
Le lien change si le tunnel gratuit est recréé.
La conduite humaine complète, deux machines physiques, les performances GPU et
l'écoute sur le matériel des collègues restent à vérifier. Voir aussi le
[parcours de démo](docs/DEMO.md) et le [suivi des tâches](todo.md).

## Archives des versions précédentes

Les sections suivantes conservent leurs résultats, nombres de circuits, ports,
URL et empreintes d'origine. Elles ne décrivent pas toutes l'état courant et ne
prétendent pas que chaque essai a été rejoué après les dernières modifications.

## Historique : les deux MP3 fournis

`Lap 1.mp3` joue au premier tour et `Lap 2.mp3` aux deuxième et troisième tours, sur les quatre circuits. Les originaux sont conservés et les copies versionnées servies depuis l'origine du jeu. Aucune dépendance ou dépense ajoutée ; moteur, effets, simulation et protocole réseau conservés.

- **10 contrôles Chromium réussis** : lecture réelle, changement de tour, boucles, volume, pause/reprise, fin de course et fichier absent. Les deux MP3 sont décodables et identiques aux sources ; deux lecteurs au maximum, une piste active.
- `python3 scripts/prepare-music.py --check`, `npm run typecheck`, `npm run build` et reconstruction de l'image Docker réussis.
- Course complète via le tunnel public : **67,4 s, sortie 0**, quatre pilotes SDK par commandes ordinaires et deux sessions Chromium observatrices. Lecture de Lap 1 puis Lap 2, volume nul/rétabli et arrêt à l'arrivée vérifiés ; résultats communs et aucune erreur JavaScript. [Rapport](docs/mp3-public.json).
- Les deux fichiers publics répondent en `audio/mpeg` et leurs SHA-256 sont identiques aux originaux. Bundle servi : `index-BcLJLuu2.js`. Client publié sans redémarrage du serveur ni du tunnel. [Intégrité publique](docs/mp3-public-assets.json).
- [Détail des contrôles audio](docs/MUSIC.md) et [rapport JSON](docs/music-validation.json). L'écoute sur haut-parleurs réels et la reprise sur mobile restent à essayer.

## Historique de l'intégration : karts, objets et première musique

[Rapport complet et lien de démo](docs/DEMO.md).

- **63 tests réussis**, build hôte et Docker valides ; dépendances et circuits inchangés.
- Huit objets vérifiés dans un navigateur sur serveur privé : pressions E, ciblage, HUD et protections temporisées ; aucune erreur JavaScript.
- Ancienne musique synthétique : **12 contrôles** navigateur/audio avaient validé quatre arrangements, boucle complète et libération des voix. Cette version a été remplacée par les MP3 ; aucune écoute humaine revendiquée.
- Course publique complète en **65,036 s** : quatre pilotes SDK et deux navigateurs observateurs, résultats identiques, GLB chargé une fois par page, musique/volume/arrêt vérifiés.
- Tournoi public complet en **303,565 s**, sortie 0 : deux pilotes SDK, quatre circuits, trois tours par circuit ; reconnexion, scores, revanche, sélection aléatoire et isolation des salons vérifiés. Le rapport complet distingue aussi un premier lancement interrompu après l'enregistrement de ses résultats.
- Les essais sur deux machines physiques, les performances GPU et l'écoute sur le matériel de démo restent à faire.

Rapports JSON conservés dans `docs/demo-results/`.

## Lot visuel : kart Zsky avant extension des objets

Le [rapport de démo](docs/KART_DEMO.md) rassemble la provenance, les captures
avant/après à cadrage identique, les commandes et les limites des vérifications.

- **50 tests réussis**, dont trois nouveaux contrôles du GLB ; construction TypeScript, Vite et Docker réussie.
- Conversion reproductible vérifiée ; un modèle local de 94 668 octets, huit peintures indépendantes, géométries partagées et un seul chargement par page.
- Huit contrôles visuels réussis, dont roues/braquage/inclinaison sans mutation des positions, garde au sol, suppression/recréation et secours après HTTP 404.
- Course complète sur le tunnel public Docker : quatre pilotes SDK terminent trois tours ; deux sessions Chromium observatrices affichent les mêmes résultats, sans erreur JavaScript.
- GLB et crédits servis sur la même origine ; HTTPS/WSS et SHA-256 du fichier public vérifiés.
- Contrôle caméra à 3 FPS réussi, puis nouvelle course publique complète en 70,02 s avec la caméra corrigée.

Deux sessions du même navigateur ne constituent pas deux machines physiques.
Les essais clavier sur deux ordinateurs et la fluidité sur GPU restent à faire.
Ce lot visuel conserve la simulation, les collisions, les circuits, Colyseus,
les dépendances npm et les fichiers Docker. Les ajouts d'objets et de musique
font l'objet d'une validation d'intégration distincte.

Les sections suivantes conservent les résultats des versions antérieures.

## Historique : quatre circuits et tournois

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
