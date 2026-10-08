# Démo intégrée — éditeur, comptes, petits écrans et circuits

État documenté le **8 octobre 2026**. Le projet conserve Three.js, Colyseus,
Docker et les ressources servies depuis la même origine. Budget ajouté :
**0 €**, sans asset payant, abonnement, API IA payante ni dépendance npm nouvelle.

Dernier ajout : dans **Créer un circuit → Vos circuits et ceux de la classe**, chacun peut supprimer ses créations et le compte **Admin** peut modérer tous les circuits. Les suppressions survivent au redémarrage ; courses engagées et replays sont conservés. [Validation et captures](track-deletion/README.md).

## Démarrer et partager la version compilée

Depuis le dossier du projet :

```bash
docker compose --profile tunnel up --build -d
docker compose ps
docker compose logs -f tunnel
```

Le jeu local ouvre sur http://localhost:3000 par défaut. Copier l'adresse HTTPS
courante depuis les logs du tunnel, l'ouvrir, puis créer et partager le salon.
Le tunnel doit rester actif. Pour une instance déjà nommée ou un autre port,
conserver ses options `-p` et `HOST_PORT` lors des commandes suivantes.

Lien de cette session : [ouvrir Lagon Kart](https://dec-automatically-shell-makers.trycloudflare.com).
Le tunnel précédent avait expiré ; ce lien le remplace et change à sa recréation.
Les douze tracés remaniés, les commandes tactiles et les deux loopings sont
conservés. Les preuves ci-dessous du lot mobile concernent son build précédent
`index-wc3mK_Sw.js` ; [VALIDATION.md](../VALIDATION.md) identifie séparément la
version testée et les essais réellement exécutés. Le catalogue courant compte
quatorze personnages après le retrait du personnage ambigu.

À l’accueil, **Créer un circuit** ouvre maintenant l’atelier. Dessiner la piste,
choisir un thème et des zones, puis **Sauvegarder et essayer**. Les créations
publiées apparaissent dans le choix des circuits et les tournois des autres
joueurs ; **Actualiser les circuits** recharge le catalogue. Le dossier
**`data/tracks/`** conserve chaque révision. [Guide de l’atelier](TRACK_EDITOR.md).
Un exemple **La boucle de l’atelier** est déjà publié : forêt, route large,
turbo et boue latérale. Il a été créé depuis l’éditeur et joué à deux par le
tunnel. [Capture en course](editor/public/race-custom-track.png).

Compose conserve les comptes, profils, progression, saisons et replays dans
**`data/players/` sur la machine hôte**, monté dans `/app/data/players`.
Reconstruire les conteneurs ou exécuter `docker compose down -v` conserve ce
dossier. `npm run data:reset` reconstruit et relance le jeu tout en laissant le
tunnel actif. Les salons en cours restent en mémoire et disparaissent au
redémarrage ; leurs résultats déjà enregistrés sont conservés.

À l'accueil, choisir **Sauvegarder mon pilote** pour rattacher la progression
actuelle à un nom d'utilisateur et un mot de passe. **Se connecter** retrouve
le compte depuis un autre navigateur, téléphone ou nouveau lien de tunnel.
Le jeu invité reste possible ; sa clé locale ne se transfère pas automatiquement.
[Migration de l'ancien volume, archives et comptes](ACCOUNTS_STORAGE.md).

Les 21 profils existants ont été migrés ; les 20 fichiers restent identiques
après un reset réel. Le parcours des comptes est vérifié sur le tunnel par
deux contextes Chromium indépendants : inscription, récupération, salon et
déconnexion, sans erreur JavaScript ni asset manquant.
[Preuves des comptes](accounts/public-validation.json) ·
[Migration et reset](accounts/deployment.json).

Le correctif des CPU est également déployé : les bots conservent la branche
où ils sont engagés et ne visent plus une autre voie à travers son rail lorsque
le circuit évolue. Les cas tardifs de Mangrove et Citadelle sont vérifiés dans
des salons privés, avec une remise en piste ordinaire au besoin.
[Fonctionnement et tests](TEAMS.md) · [Captures](cpu-obstacles/README.md).

Le garage propose **quatorze personnages**, dont neuf nouvelles caricatures.
[Casting courant et captures](CHARACTERS.md).

Le retrait est déployé dans `index-G7ETGeSm.js` et vérifié en navigateur : 14 choix, ancien choix remplacé par le pilote casqué, sauvegardes conservées. [Contrôle actuel](characters/removal-browser.json).

**Historique du lot initial à quinze pilotes, avant retrait :** le client
`index-CNhD6czR.js` avec `index-DHM7KfgD.css` a été testé comme suit.
**27 tests ciblés**, **6 contrôles de rendu** et **6 contrôles du garage en réseau
privé** passent ; quinze portraits et un départ à huit karts ont été inspectés.
Les **21 fichiers de sauvegarde** présents au moment de cette mise à jour sont
restés identiques, le tunnel n’a pas été recréé.
[Casting et captures](CHARACTERS.md) · [Déploiement](characters/deployment.json).
Le même client réussit **7 contrôles publics** avec deux navigateurs : garage
mobile, sauvegarde locale du choix, personnage répliqué et départ réel à deux,
sans erreur puis retour à zéro salon. Il s’agit d’une courte conduite ; les
courses complètes des anciens lots ne sont pas rejouées ici.
[Rapport public des pilotes](characters/public/roster-browser-validation.json).

## Parcours conseillé pour la démo

Sur mobile, glisser à gauche pour tourner ; utiliser drift, objet et frein à
droite. L’accélération automatique évite de tenir une troisième commande et
reste désactivable. Tourner le téléphone relâche les appuis ; toucher une
commande pour reprendre. [Commandes, analyse et avant/après](MOBILE_CONTROLS.md).

Comparer les douze silhouettes et leurs monuments : phare, glacier, canyon,
ville, mangrove, pyramide, volcan, arbre-maison, port, observatoire, fonderie,
citadelle. Essayer ensuite **Archipel céleste** et **Fonderie des pistons** :
les loopings magnétiques retournent réellement le kart, acceptent le freinage
et la reprise au sommet, puis rejoignent la piste au sol. [Galerie](scenes-v2/README.md).

1. Ouvrir **Garage** et comparer Zsky, Sprint et Rétro dans la même couleur.
   Choisir l’un des quatorze personnages, dont neuf nouvelles caricatures. Les **18 pièces** sont réparties en six
   catégories ; les variantes verrouillées annoncent leur niveau de carrière.
2. Choisir parmi les **douze circuits**, créer un salon et faire rejoindre un
   autre navigateur. Les modèles, personnages et peintures de chacun sont
   visibles. Configurer une course ou un tournoi de deux à huit manches,
   avec programme manuel ou panier de circuits aléatoires.
3. Activer les événements pour voir les déviations larges, la voie turbo,
   le barrage du deuxième tour et le raccourci du troisième tour du leader.
   Les panneaux anticipent les entrées et la mini-carte affiche les ouvertures.
   Les raccourcis coupent réellement **13 à 34 % de distance** sur la route
   principale remplacée. Les six nouvelles pistes possèdent ponts et tremplins.
4. Essayer **4 contre 4** : Corail et Lagon totalisent les points de leurs membres,
   avec des CPU pour compléter les places. Les objets épargnent les coéquipiers ;
   les CPU suivent les mêmes règles de déplacement que les humains.
5. Revenir à **Championnats, classement et replays**. Les six coupes introduisent
   progressivement terrains, branches et événements aux niveaux 0 à 3 ; les
   ponts et les sauts apparaissent dans les coupes à partir du niveau 2.
   Une coupe exige toutes les manches terminées et un podium au classement final.
6. Avec deux profils humains, lancer la recherche d'une rencontre classée.
   Le MMR et les rangs Bronze à Master concernent ce serveur ; les saisons sont
   trimestrielles. Ouvrir un replay disponible et tester lecture, pause et curseur.
   En entraînement, cocher le **fantôme du meilleur temps** lorsqu'un enregistrement
   compatible avec le circuit choisi et le niveau 3 des événements existe :
   ce ghost est visible en 3D et n'a pas de collisions.

Les choix de modèle et de personnage restent cosmétiques. Les pièces du garage
modifient vitesse, accélération, adhérence, stabilité, turbo et comportement
hors piste. Le serveur contrôle les niveaux requis. Les trois modèles GLB sont
chargés au plus une fois chacun par page ; leurs géométries sont partagées et
leurs peintures indépendantes. Le kart procédural reste le secours de chargement.

Les huit objets mystères et les MP3 fournis restent disponibles sur les douze
pistes : **Lap 1** au premier tour, puis **Lap 2** aux deuxième et troisième tours.
Les crédits, les sources et les fichiers audio/modèles restent locaux au jeu.

## Preuves du lot mobile et décors du 7 octobre

- **Course publique actuelle réussie en 143,537 s** : 4/4 pilotes SDK terminent trois tours sur Sky par commandes ordinaires, sans arrivée forcée ; tous sautent et passent inversés dans le looping. Quatre pilotes et deux observateurs Chromium desktop/mobile partagent le même classement sur six connexions. Profils enregistrés et replay commun de révision 2, 603 images par pilote ; aucun échec JavaScript ou asset. [Rapport](mobile-scenes-public-race.json) · [Tour 1](mobile-scenes-public-tour-1.png) · [Tour 3](mobile-scenes-public-tour-3.png) · [Résultats](mobile-scenes-public-resultats.png).
- **266/266 tests** des règles, du stockage, des contrôles et de la géométrie ; build et TypeScript réussis.
- **15/15 contrôles mobiles**, sept captures inspectées sur le build livré, dont la pancarte proche et le compteur en 320 × 568. [Avant/après et limites](MOBILE_CONTROLS.md).
- **14/14 contrôles de panoramas**, douze images finales inspectées ; routes dégagées, cadrage et précision de profondeur corrigés. [Rapport](scenes-v2/branches-final/validation.json).
- **Deux loopings**, douze vues de montée, inversion, descente et sortie, sur desktop et deux formats mobiles. Leur preuve sur le build précédent est conservée séparément ; le code de boucle est inchangé. [Galerie et fixtures](scenes-v2/README.md).
- **Docker et tunnel** : huit assets et sept modules serveur identiques au build local, volume de progression conservé. [Empreintes](mobile-scenes-public-assets.json).

Les navigateurs de la course publique utilisent Chromium/SwiftShader sur un
seul hôte, avec **2,25 et 2,65 FPS** relevés en fin de contrôle. Cela ne valide
pas la fluidité GPU ni une partie sur deux machines physiques. Confort des
pouces, Safari iOS et reprise audio après verrouillage nécessitent encore
des essais sur de vrais téléphones.

## Preuves historiques du lot du 6 octobre

Les rapports de cette table conservent leurs bundles et URL d’origine. Les
nouveaux tracés, commandes mobiles et décors sont validés séparément dans
[VALIDATION.md](../VALIDATION.md), [les commandes](mobile-controls/validation.json)
et [les scènes](scenes-v2/validation.json).

| Lot | Vérification exécutée et preuve |
| --- | --- |
| Course publique sur la version déployée | **4/4 pilotes, trois tours**, deux navigateurs, sauts et phases, trois modèles et MP3, profils/replay enregistrés ; aucune erreur JavaScript ni asset manquant. Contrôle **125,721 s**, chronos **107,300–109,467 s**. [Rapport](final-public-race.json), [empreintes](final-public-assets.json). |
| Suite complète et compilation | **237/237 tests réussis**, sans échec ni test ignoré, en **61,38 s** ; journal local `/tmp/lagon-tests-final-confirmed.log`. TypeScript et build `index-DCnyszy_.js` réussis. Un test de vrai saut au-dessus d'un rail a réussi séparément après cette suite. [Validation](../VALIDATION.md), [portée du cas supplémentaire](VERTICAL_COLLISIONS.md). |
| Branches fluides et raccourcis | **33 tests** ; 96 arrivées après trois tours sur douze circuits avec événements niveau 3, sans demande de remise en piste ; 36 branches parcourues avec direction progressive ; 24 comparaisons de secteur. [Méthode et résultats](CIRCUITS.md), [mesures JSON](branch-comparison.json). |
| Tours, portes et obstacles | Accotements, branches, ordre des portes, sens inverse, sauts, murs de hauteur finie et retour en piste sur une porte équivalente. [Tours](LAPS.md), [collisions verticales](VERTICAL_COLLISIONS.md). |
| Physique du garage et objets en équipes | **9 tests garage** et **10 tests objets/équipes** ; différences mesurées de conduite, choix verrouillés, modèles/personnages sans effet physique, protection des alliés et score cumulé. Sources : [garage](../tests/garage.test.ts), [équipes](../tests/team-items.test.ts). |
| Trois modèles et cinq personnages | **5 contrôles Chromium des modèles**, **5 des personnages** ; chargement, partage, recoloration, pivots, animation et secours. [Modèles](KART_MODELS.md), [personnages](CHARACTERS.md). |
| Garage, carrière et 4 contre 4 dans le navigateur | **11/11 contrôles Chromium sur les douze circuits**, bundle `index-CU-Fug6i.js` : deux contextes, choix propagés, reconnexion, déplacement clavier réel, pièces et coupes, résultats et replay. Les arrivées et certains paliers sont imposés pour vérifier les écrans. Ce parcours précède le build final. [Portée exacte et captures](FEATURE_BROWSER.md), [rapport](feature-demo-12/validation.json). |
| Persistance et accès réseau à la carrière | Tests du stockage, MMR, saisons, matchmaking, rétention et requêtes réelles HTTP/Colyseus sur serveur privé. Les fixtures de récompense imposent les arrivées. [Rapport](PROGRESSION.md). |
| Persistance Docker et course SDK | Contrôle local isolé réussi en **117,697 s**, dont une course de trois tours sur l'Archipel céleste en **108,4 s** ; profil, replay et ghost conservés après recréation du conteneur. Image antérieure aux derniers correctifs de murs : `sha256:6bed08d4ca9348e53395513fbbda74493bb38b9dc653648f3a1111a7e812c7c1`, bundle `index-CU-Fug6i.js`. [Rapport](docker-persistence.json). |
| Six nouvelles pistes à relief | [Description, géométrie et état de validation](CIRCUITS_APPENDIX.md). **8 contrôles navigateur réussis**, 25 captures : ponts, accélération au clavier, sauts et atterrissages sur les six pistes, routes de phase deux et tirage aléatoire de huit courses. Positions et pauses de capture privées documentées. [Rapport](circuits-expanded/validation.json). |

Les suites ciblées de cette table peuvent se recouper ; leurs nombres ne
s'additionnent pas au total de la suite complète. Les temps
comparés des raccourcis proviennent de commandes de conduite déterministes, pas
de records humains. Les tests de portes placent volontairement les karts près
des frontières pour en contrôler les règles.

| Capture | Document ou fichier |
| --- | --- |
| Course publique finale | [Tour 1](final-public-tour-1.png) · [Tour 3](final-public-tour-3.png) · [Résultats](final-public-resultats.png) |
| Ancien kart et kart Zsky, cadrage comparable | [Avant](kart-visuals/kart-before-detail.png) · [Après](kart-visuals/kart-after-detail.png) |
| Trois silhouettes dans la même couleur | [Bibliothèque](kart-library/three-models.png) |
| Les quatorze personnages actuels | [Pilotes](characters/lineup.png) |
| Garage et pièces verrouillées | [Garage, lot douze circuits](feature-demo-12/garage-level-zero.png) |
| Deux humains et six CPU | [Équipes, lot douze circuits](feature-demo-12/teams-eight-pilots.png) |
| Ponts et sauts des six nouvelles pistes | [Galerie et mesures](CIRCUITS_APPENDIX.md) |
| Panoramas avant/après correction de profondeur | [Comparaison](overview-depth/README.md) |
| Lecture d'une trace enregistrée | [Replay de fixture, lot douze circuits](feature-demo-12/replay-private-race.png) |

## Vérifications encore séparées

Le déploiement final et les empreintes publiques sont vérifiés. Les six nouveaux
circuits ont leurs captures et contrôles de sauts ; les artefacts de profondeur
des panoramas ont été corrigés et comparés à cadrage fixe. La course publique
finale a réussi, avec quatre pilotes SDK et deux navigateurs observateurs ;
son rapport et ses limites sont dans [la validation](../VALIDATION.md). Les preuves Docker et Chromium du bundle
`index-CU-Fug6i.js` précèdent le build final `index-DCnyszy_.js`. Deux contextes
Chromium sur un seul hôte ne remplacent pas **deux ordinateurs physiques**.

Restent des essais humains : conduire une course entière sur les branches
corrigées, apprécier les ponts et sauts, la lisibilité et l'équilibrage des pièces,
vérifier la fluidité sur les GPU des collègues et écouter les MP3 sur leur
matériel. Les deux observateurs SwiftShader tournaient à 2,4–2,9 FPS en fin de test : cela ne mesure pas les performances d’un GPU.
Le téléphone réel et la reprise audio après verrouillage ne sont pas validés.

## Archive : démo karts, objets et MP3 avant extension

Le contenu ci-dessous conserve les captures, URL, versions et résultats du lot
historique à quatre circuits. Ses mentions « version vérifiée », « publique » ou
« actuelle » décrivent **ce lot**, pas le nouveau catalogue à douze pistes.

Version vérifiée le **6 octobre 2026**, construite à partir du projet existant.
Budget : **0 €**, sans asset payant, abonnement, API IA payante ou nouvelle dépendance npm.

### Ouvrir et partager

- **Démo publique : https://cube-dense-operator-dont.trycloudflare.com**
- Local : http://localhost:3103
- Projet Docker : `lagon-kart-play`.

Ouvrir l'adresse publique, créer un salon et partager son lien avec les collègues.
Le tunnel est temporaire : l'ordinateur, Docker et cloudflared doivent rester actifs.
Un redémarrage du tunnel peut changer l'adresse. Le salon de la version visuelle
précédente sur le port 3102 a été conservé pendant l'intégration.

```bash
HOST_PORT=3103 docker compose -p lagon-kart-play --profile tunnel ps
docker compose -p lagon-kart-play logs -f tunnel

# Reconstruction ultérieure, après la fin des parties actives
HOST_PORT=3103 docker compose -p lagon-kart-play up --build --no-deps -d app
```

La compilation servie contient `index-BcLJLuu2.js` et `index-BwIgMnGH.css`.
Le client et les MP3 ont été copiés depuis l'image Docker reconstruite, index publié
en dernier, sans redémarrage du serveur ni changement du tunnel.
GLB, MP3, client, crédits et connexions WSS utilisent l'origine publique du jeu.
Aucun appel à un CDN d'assets n'est nécessaire en course.

### Ce qui est intégré

- **Un kart Zsky, huit couleurs** : modèle gratuit sous CC BY 3.0, pivots préparés,
  roues et braquage animés, carrosserie inclinée, ombre de contact et caméra
  rapprochée. Chargement GLTF unique, géométries partagées et peintures indépendantes.
  Le kart procédural sert de secours au chargement.
- **Huit objets mystères** : turbo, triple turbo, balise piège, disque vert,
  fusée rouge, comète bleue visant le leader, étoile d'énergie et bouclier.
  Charges, cibles, impacts et protections sont décidés par le serveur.
- **Musiques MP3 fournies** : `Lap 1.mp3` au premier tour et `Lap 2.mp3` aux
  deuxième et troisième tours, sur tous les circuits. Lecture après interaction,
  volume commun aux effets, pause/reprise et arrêt hors course. Les deux lecteurs
  sont réutilisés, avec un seul morceau actif.
- [**todo.md**](../todo.md) : réalisations et vérifications restantes.

Les circuits, les tournois, le protocole des commandes Colyseus, les fichiers Docker
et les dépendances restent en place. Le lot visuel ne touche pas la physique ;
les nouveaux objets étendent les règles de simulation.

### Captures et extraits

| Preuve | Fichiers |
| --- | --- |
| Kart, cadrage identique | [Avant](kart-visuals/kart-before-detail.png) · [Après](kart-visuals/kart-after-detail.png) |
| Huit couleurs, cadrage identique | [Avant](kart-visuals/kart-before.png) · [Après](kart-visuals/kart-after.png) |
| Objets et protections | [Capture du test privé](demo-results/items-effects.png) |
| Musiques fournies | [Lap 1](../assets/audios/Lap%201.mp3) · [Lap 2](../assets/audios/Lap%202.mp3) |
| Répartition par tour et contrôles | [Intégration des MP3](MUSIC.md) |

Les comparatifs des karts fixent caméra, éclairage, positions et temps. La capture
des objets est une scène privée volontairement suspendue pour rendre tous les
effets visibles ; elle ne prouve pas une course complète.

### Tests exécutés

Les contrôles de préparation des MP3, les dix contrôles audio, le build hôte et
la reconstruction Docker ont été exécutés après le remplacement musical.
Une nouvelle course publique complète avec les MP3 a également réussi.
Les validations des karts, objets et tournois ci-dessous précèdent ce remplacement ;
leurs résultats sont conservés sans prétendre avoir rejoué toutes ces suites.

| Contrôle | Résultat |
| --- | --- |
| `npm test` | **63 tests réussis**, dont 13 nouveaux tests d'objets ; huit pilotes terminent les quatre circuits en simulation déterministe. |
| `npm run build` + Docker | Types, client et serveur compilés ; conteneur sain et tunnel enregistré. |
| `npm run check:kart` | Original vérifié par SHA-256, conversion reproductible. |
| `npm run test:kart-visual` | 8 contrôles réussis : chargement unique, huit peintures, partage, animations et secours HTTP 404. |
| `npm run test:kart-visual -- --camera-only` | Kart dans le champ à 3 FPS et 40 m/s, sans mutation du monde par le rendu. |
| `npm run test:items-browser` | 7 groupes de contrôles couvrant les huit objets ; trois pressions E réelles consomment les trois charges. Étoile : 5,53 s ; bouclier : 8,03 s. |
| Ancienne musique synthétique | 12 contrôles avaient validé le séquenceur initial ; il est remplacé par les MP3 fournis. Ces résultats restent archivés. |
| `npm run check:music` + `npm run test:music` | Copies MP3 identiques ; **10 contrôles Chromium réussis** : lecture, tours, boucles, volume, pause/reprise, arrêt et erreur 404. |
| Course publique avec les MP3 | **67,4 s, sortie 0** : quatre pilotes SDK terminent trois tours ; deux navigateurs lisent Lap 1 puis Lap 2, volume et arrêt à l'arrivée vérifiés, aucune erreur JavaScript. |
| Fichiers MP3 publics | Les deux fichiers répondent en `audio/mpeg` avec SHA-256 identiques aux originaux ; une requête par fichier et par navigateur observée pendant cette course. |
| Course publique précédente | **65,036 s réelles** : quatre pilotes SDK terminent trois tours, deux navigateurs reçoivent les mêmes résultats, aucune erreur JavaScript. |
| Tournoi public complet | **303,565 s réelles, sortie 0** : deux pilotes SDK terminent trois tours sur chacun des quatre circuits ; scores, reconnexion, revanche, sélection aléatoire et isolation des salons vérifiés. |
| Audio dans le jeu public | Musique active après interaction dans les deux navigateurs ; volume nul puis rétabli ; arrêt en fin de course. |
| Fichiers publics | GLB de 94 668 octets identique au fichier local, une requête par navigateur ; crédits accessibles. |

Rapports conservés : [course](demo-results/race.json), [tournoi](demo-results/tournament.json), [objets et fixtures](demo-results/items.json),
[ancienne musique](demo-results/music.json) et [intégrité des fichiers](demo-results/assets.json).
Le [nouveau rapport audio MP3](music-validation.json) documente la version actuelle.
La [nouvelle course publique](mp3-public.json) et [l'intégrité des MP3 publics](mp3-public-assets.json)
confirment cette version sur le tunnel. La course utilise un seul hôte avec
deux contextes navigateur indépendants ; ce ne sont pas deux machines physiques.

La course publique utilise les commandes ordinaires, sans imposer positions ou
arrivées. Les deux navigateurs sont des observateurs dans le même Chromium.
Cette course a montré turbo, triple turbo, piège, étoile et bouclier ; les huit
types sont couverts par les règles et le test navigateur privé, qui attribue
explicitement les objets.

Un premier tournoi à quatre pilotes avait également terminé les quatre courses
et ses dix contrôles, puis reçu SIGTERM après l'enregistrement du rapport.
Sa cause n'est pas établie ; ce lancement n'est pas présenté comme une sortie
normale. Le contrôle court de fermeture après reconnexion et le tournoi complet
à deux pilotes ont ensuite tous deux terminé avec le code 0.
[Historique du premier essai](demo-results/tournament-four-drivers.json).

### Vérifications humaines restantes

- Deux ordinateurs physiques : clavier, objets, reconnexion et course suivante.
- Fluidité sur les GPU des collègues, lisibilité et équilibrage en groupe.
- Écoute et équilibre musique/moteur sur leurs haut-parleurs ; préférences de volume.
- Téléphone réel et reprise audio après verrouillage, si ce support est prévu.

Le navigateur utilise ici SwiftShader. Lors de la validation initiale avec tests concurrents, les échantillons
de fin de course sont de 1,1 à 1,6 FPS ; un rattrapage du séquenceur audio a été
observé dans chaque navigateur. Ces mesures ne représentent pas un GPU matériel
et ne prouvent pas une fluidité ou une écoute satisfaisante sur les machines de
démo. Ces observations concernent l'ancien séquenceur synthétique, remplacé par
les MP3. L'écoute sur le matériel des collègues reste à réaliser.

Détails : [modèle](KART_ASSET.md), [lot visuel](KART_DEMO.md), [objets](ITEMS.md),
[musique](MUSIC.md) et [validation du projet](../VALIDATION.md).
