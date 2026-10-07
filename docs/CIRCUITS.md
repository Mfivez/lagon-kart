# Circuits et routes alternatives

> Les tableaux et rayons ci-dessous décrivent le lot du 6 octobre. Les douze tracés ont été remaniés le 7 octobre : voir [LOOPINGS.md](LOOPINGS.md). Les 36 branches sont recalculées et la suite complète de 266 tests réussit. Sur la révision 2, les raccourcis économisent de **13 à 34 %** de distance (mesure de leur longueur divisée par le secteur principal remplacé) ; les anciennes captures et mesures JSON restent des archives.

Le jeu propose douze circuits, chacun avec trois tours et douze checkpoints ordonnés. Les définitions sont dans [shared/track.ts](../shared/track.ts). Les six premiers tracés sont conservés ; six pistes plus longues et plus larges ajoutent des environnements, des ponts et des tremplins.

| Circuit | Identifiant | Longueur d’un tour | Largeur principale |
| --- | --- | ---: | ---: |
| Île des Alizés | `lagon` | 611 m | 16 m |
| Canyon solaire | `canyon` | 716 m | 15 m |
| Banquise boréale | `glacier` | 697 m | 18 m |
| Métropole néon | `neon` | 731 m | 17 m |
| Mangrove sinueuse | `mangrove` | 736 m | 16 m |
| Dunes de cuivre | `dunes` | 668 m | 15 m |
| Caldeira ardente | `volcan` | 1129 m | 22 m |
| Forêt des géants | `forest` | 1167 m | 22 m |
| Port des cargos | `harbor` | 1173 m | 24 m |
| Archipel céleste | `sky` | 1199 m | 24 m |
| Fonderie des pistons | `foundry` | 1217 m | 22 m |
| Citadelle royale | `castle` | 1196 m | 24 m |

Les thèmes supplémentaires sont une caldeira volcanique, une forêt de séquoias, un port de cargos, des îles célestes, une fonderie et une citadelle. Les hauteurs et rampes sont décrites par `elevations` ; `trackElevation`, `trackSlope` et `trackJumpAt` sont partagés avec le jeu. Les routes alternatives suivent elles aussi les hauteurs correspondant à leur progression.

## Bifurcations corrigées pour la conduite

Les petites boucles serrées ont été remplacées par des courbes Bézier sur trois à cinq intervalles de checkpoints. Les entrées et sorties suivent la direction de la route, sans changement brutal de cap. Les chaussées font **12 m de large sur les six premiers circuits et 14 m sur les six nouveaux**.

- **Déviation large** : contournement lisible, deux emplacements d’objets, aucune boue imposée sur cette voie. Les rayons minimaux observés vont de 29 à 122 m. Les CPU n’ont plus besoin de ralentir à 13 pour la franchir : ils reprennent une allure de 30–32 selon la courbe.
- **Voie turbo** : grandes courbes, bande d’accélération et courte portion glissante, dont la couleur distingue clairement la surface.
- **Raccourci** : coupe réellement une portion de la route normale. Il est **15 à 28 % plus court que cette route**, pas seulement plus court que la déviation. Il n’ajoute aucun turbo pour fabriquer ce gain. Les rayons minimaux observés vont de 31 à 52 m.

Les bifurcations sont annoncées environ **42 m en amont**, puis à leur entrée. Un panneau indique le gain de distance du raccourci. La mini-carte affiche les voies ouvertes en couleur, le futur raccourci en pointillé avec « T3 » et les barrages en rouge ; son cadrage inclut toutes les branches et reste stable quand elles s’ouvrent.

## Événements partagés

La simulation autoritaire détermine la phase à partir du tour du leader et la copie sur tous les karts. Un pilote en retard rencontre donc la même route que les autres.

| Niveau | Changements |
| --- | --- |
| 0 | Circuit classique, sans bifurcation ni événement. |
| 1 | Déviation et voie turbo accessibles ; raccourci ouvert au troisième tour du leader. |
| 2 | Au deuxième tour du leader, un barrage impose la déviation et la météo transforme une portion du sol ; le raccourci ouvre au troisième tour. |
| 3 | Les événements se combinent au troisième tour avec une tempête et une seconde zone de terrain difficile. |

Les événements prennent le nom du décor : inondation, avalanche, éboulement, coulée volcanique, tempête, incident industriel ou route/pont coupé. Les surfaces modifient réellement la vitesse ou l’adhérence. Les effets visuels restent légers : géométries partagées, débris et poteaux instanciés, 180 particules au maximum, aucun service externe ni dépendance nouvelle.

## Checkpoints et intégration

Une longue branche traverse plusieurs intervalles de progression. Elle contient donc une **porte physique alternative pour chacun des checkpoints intermédiaires**, fournie par `eventCheckpointGates`. Le jeu exige toujours les checkpoints dans l’ordre, en traversant réellement la porte de la route empruntée. La ligne d’arrivée n’a pas de porte alternative. Le retour en piste utilise la dernière porte effectivement franchie.

Le module [shared/track-events.ts](../shared/track-events.ts) expose les événements, routes, surfaces, collisions balayées, points de guidage, objets et portes alternatives. La progression sur une branche suit sa longueur d’arc ; `pointOnBranch` recherche les points qui encadrent cette progression. Le module [client/track-events.ts](../client/track-events.ts) gère le rendu et libère ses ressources lors des changements de circuit.

## Validation exécutée le 6 octobre 2026

`node --import tsx tests/events.test.ts` : **33 tests réussis**, dont :

- géométrie et raccordements des 36 branches, largeur, rayon minimal, raccourci plus court que la route normale et portes intermédiaires ;
- 12 courses complètes avec huit pilotes, objets, collisions et événements au niveau 3 : **96 arrivées sur 96 après trois tours, aucun retour en piste demandé** ;
- parcours des 36 branches à allure normale avec braquage progressif plafonné : aucun drift, aucune réinitialisation et aucune sortie de chaussée ;
- 24 comparaisons de secteur entre route normale et raccourci, avec un kart standard puis un kart chargé ;
- barrages, collisions entre karts, téléportation au checkpoint et conservation du comportement classique au niveau 0.

Les temps ci-dessous proviennent de la simulation avec le **même conducteur automatique accessible sur les deux routes** : vitesse cible maximale 28, anticipation des courbes, braquage limité et progressif, aucun objet ni drift. Les turbos de la route principale sont marqués comme déjà utilisés pour isoler le trajet ; le raccourci reste sur une surface normale. Le secteur commence 15 m avant l’embranchement et se termine après le checkpoint qui suit la jonction. Ces mesures comparent ce conducteur déterministe, pas les records de joueurs humains ; son aisance varie avec les virages de la route normale.

| Circuit | Route normale remplacée | Raccourci | Distance économisée | Temps de secteur standard |
| --- | ---: | ---: | ---: | ---: |
| Île des Alizés | 239 m | 202 m | 15,4 % | 9,47 → 8,17 s |
| Canyon solaire | 282 m | 239 m | 15,4 % | 11,60 → 9,47 s |
| Banquise boréale | 275 m | 213 m | 22,3 % | 10,90 → 8,57 s |
| Métropole néon | 289 m | 207 m | 28,4 % | 16,27 → 8,30 s |
| Mangrove sinueuse | 291 m | 208 m | 28,4 % | 12,17 → 8,37 s |
| Dunes de cuivre | 207 m | 163 m | 21,1 % | 8,33 → 6,80 s |
| Caldeira ardente | 454 m | 364 m | 20,0 % | 17,23 → 13,97 s |
| Forêt des géants | 470 m | 372 m | 20,8 % | 17,80 → 14,27 s |
| Port des cargos | 473 m | 368 m | 22,1 % | 17,90 → 14,17 s |
| Archipel céleste | 484 m | 405 m | 16,2 % | 18,27 → 15,47 s |
| Fonderie des pistons | 491 m | 372 m | 24,2 % | 18,63 → 14,27 s |
| Citadelle royale | 482 m | 383 m | 20,6 % | 18,23 → 14,67 s |

Les valeurs détaillées, y compris le kart chargé et les rayons de courbure, sont conservées dans [branch-comparison.json](branch-comparison.json). La validation visuelle en navigateur, la course sur le tunnel et l’essai manuel sur deux machines restent des vérifications séparées ; leurs résultats doivent être consignés dans [VALIDATION.md](../VALIDATION.md).

Après correction des ouvertures de rail selon les événements actifs, le contrôle ciblé de Néon passe avec les critères inchangés : huit arrivées en classique (71,73 s), huit avec événements (70,57 s) et aucune remise en piste. Le même conducteur de secteur mesure 16,27 → 8,30 s avec le kart standard et 17,17 → 8,33 s avec le kart chargé. Les 24 comparaisons de secteur passent ; les valeurs précédentes de Néon sont conservées dans le journal `rechecks` du JSON. Aucun réglage de conduite n’a été changé pour cette correction.
