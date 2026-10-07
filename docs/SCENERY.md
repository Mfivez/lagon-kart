# Paysages des douze circuits

Les décors sont désormais composés autour de repères propres à chaque circuit.
Le disque circulaire commun est remplacé par un terrain polygonal suivant
l’enveloppe de la piste et des trois branches possibles. Les collines restent
à l’écart de la chaussée ; les zones de conduite sont aplaties, y compris sur
les raccourcis qui ne sont pas encore ouverts.

| Circuit | Repères et composition |
| --- | --- |
| Île des Alizés | Phare rayé avec lanterne, petit resort de plage, palmeraies |
| Canyon solaire | Mesa à trois strates, arche rocheuse, buttes et cactus |
| Banquise boréale | Cathédrale glaciaire, cristaux, station polaire avec antenne |
| Métropole néon | Quartier de neuf tours, étages lumineux, enseignes, boulevard |
| Mangrove sinueuse | Village sur pilotis, passerelle, racines aériennes, nénuphars |
| Dunes de cuivre | Observatoire pyramidal en ruines, obélisques, oasis et caravane |
| Caldeira ardente | Cratère ouvert, lave visible, contreforts et orgues basaltiques |
| Forêt des géants | Arbre-maison avec échelle, bosquets, champignons et cascade |
| Port des cargos | Terminal de conteneurs nervurés, grue treillis, cargo et bassin |
| Archipel céleste | Observatoire flottant, télescope, îlots et montgolfières |
| Fonderie des pistons | Aciérie, cheminées cerclées, tours de refroidissement, vannes |
| Citadelle royale | Forteresse crénelée, donjon, tours, drapeaux, porte et verger |

Les emplacements sont calculés à partir du tracé, pas de positions supposées
libres au centre de la carte. Une enveloppe libre est conservée autour de
chaque repère. Pour Sky et Foundry, les positions réellement projetées du
looping sont également exclues du placement des décors.

## Recherche et asset gratuit retenu

Pages primaires consultées le **7 octobre 2026** :

- [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), CC0.
- [Kenney Castle Kit](https://kenney.nl/assets/castle-kit), CC0.
- [Kenney Pirate Kit](https://kenney.nl/assets/pirate-kit), CC0.
- [Publication Nature Kit par Kenney sur OpenGameArt](https://opengameart.org/content/nature-kit), CC0.
- [Tree de Kenney sur Poly Pizza](https://poly.pizza/m/QN3Ru02ayU), CC0 1.0.

Les archives Nature Kit de Kenney et d’OpenGameArt renvoyaient HTTP 403 lors
du téléchargement. Le modèle individuel **Tree** de Kenney a pu être téléchargé
depuis le CDN Poly Pizza. Les autres grands repères sont des géométries
originales du projet : les packs Castle et Pirate ont été étudiés, mais ne sont
pas embarqués.

Inspection effective du GLB retenu : **14 480 octets, 200 triangles, un mesh,
deux primitives et deux matériaux**, aucun fichier externe, aucune texture,
aucune animation ni armature. Le modèle est orienté Y vers le haut et son pivot
est situé au pied du tronc. Ses dimensions originales sont d’environ
0,553 × 1,411 × 0,526 unités. Il est normalisé à la hauteur demandée à l’exécution,
avec deux matériaux partagés aux teintes bois/feuillage plus douces.

- Source inchangée : `assets/sources/kenney-nature/tree-original.glb`.
- Fichier servi : `/models/scenery/kenney-tree-v1.glb`.
- Licence CC0 complète, attribution, métadonnées et inspection conservées dans
  `assets/sources/kenney-nature/` ; crédit public dans `/credits.html`.
- SHA-256 : `caed11c17aeb268c4351f1eb147e9a07ec79e29070e11ae18d7bc68c2e2c4570`.

**Coût : 0 €.** Aucun abonnement, service de génération, nouvelle bibliothèque,
Blender ou accès internet n’est requis pour lancer le jeu.

## Chargement et budget mobile

`preloadSceneryAssets()` mémorise une promesse : une seule requête locale pour
l’arbre par page, quels que soient les changements de circuit. En cas d’échec,
les arbres procéduraux restent disponibles et le jeu continue. La géométrie
source est protégée du nettoyage du renderer : chaque scène clone les buffers
qui seront fusionnés puis détruits. Les matériaux restent partagés et immuables.
Les décors statiques sont fusionnés par matériau par le renderer existant.

Mesures du terrain et des grands décors procéduraux (hors piste, rails, karts,
objets et effets), avec l’arbre procédural de secours :

| Circuit | Triangles | Matériaux avant fusion |
| --- | ---: | ---: |
| Lagon | 4 758 | 16 |
| Canyon | 3 814 | 9 |
| Glacier | 2 970 | 14 |
| Néon | 11 326 | 14 |
| Mangrove | 9 036 | 16 |
| Dunes | 3 022 | 15 |
| Volcan | 4 054 | 12 |
| Forêt | 7 962 | 21 |
| Port | 3 332 | 20 |
| Ciel | 4 128 | 17 |
| Fonderie | 7 510 | 14 |
| Château | 6 438 | 23 |

Le modèle Kenney ne comporte que 200 triangles par arbre. Aucun post-traitement,
texture haute résolution ou calcul d’animation du décor n’est ajouté. Ces budgets
ne remplacent pas une mesure de fluidité sur un téléphone physique.

## Validation

`node --import tsx --test tests/scenery.test.ts` vérifie les douze compositions,
les positions hors chaussée et hors loopings, l’absence de valeurs géométriques
invalides, le budget de triangles, et par raycast la hauteur du terrain sous
les voies principales et toutes les branches futures. Le test de l’asset
vérifie le hash, l’identité source/copie servie, les primitives, les matériaux,
l’absence de dépendances externes et la présence du texte CC0.

Résultat exécuté le 7 octobre 2026 : **13 tests réussis**, incluant le centre et
les deux bords de chaque voie, avec 3 m de marge latérale.

La suite complète de cette révision a ensuite réussi : **266/266 tests**,
sans échec.

Le **7 octobre 2026**, les douze panoramas du build **`index-wc3mK_Sw.js` /
`index-DhaT9t6d.css`** ont été capturés dans Chromium puis inspectés visuellement.
Les quatorze contrôles automatisés du lot ont réussi : sélection des douze
circuits, chargement du GLB Kenney une seule fois et absence d’erreur
JavaScript ou de ressource HTTP manquante. Les captures masquent uniquement les
panneaux HTML pour montrer le décor ; elles utilisent la caméra d’accueil et
une sélection normale de circuit.

La revue confirme un cadrage complet, un brouillard adapté à la distance,
des repères distincts et des chaussées dégagées. Les stries claires des routes
annexes observées pendant les premières passes ont disparu après séparation
des bordures et emploi d’une grille latérale commune aux surfaces. Cela a été
contrôlé sur les douze images, notamment le [Port](scenes-v2/branches-final/harbor-overview.png),
la [Fonderie](scenes-v2/branches-final/foundry-overview.png) et la
[Citadelle](scenes-v2/branches-final/castle-overview.png).
Voir [le rapport des panoramas](scenes-v2/branches-final/validation.json).
Les anciennes captures de diagnostic restent identifiées comme telles.

Le [contrôle public du build final](mobile-scenes-public-assets.json) vérifie
**8 fichiers servis** (JavaScript, CSS, trois karts, arbre et deux MP3) et
**7 modules serveur** : toutes leurs empreintes SHA-256 correspondent aux
fichiers compilés locaux. Le conteneur est sain et le volume
`lagon-kart_player-data` reste monté dans `/app/data`.

Les contrôles mobiles, la conduite des loopings et l’essai réseau sont
rapportés séparément dans [VALIDATION.md](../VALIDATION.md). Une revue de
panoramas ne mesure pas la fluidité sur un téléphone physique et ne remplace
pas une course conduite.
