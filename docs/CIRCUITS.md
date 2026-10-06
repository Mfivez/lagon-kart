# Les six circuits

Chaque circuit possède un tracé fermé, douze checkpoints à franchir dans l’ordre et trois tours de course. Les positions, surfaces et effets sont calculés par la même simulation partagée pour le serveur et la prédiction du client. Les deux nouveaux tracés n’ajoutent aucune dépendance ni asset externe.

| Circuit | Identifiant | Longueur d’un tour | Largeur | Particularités |
| --- | --- | ---: | ---: | --- |
| Île des Alizés | `lagon` | 611 m | 16 m | Grandes courbes, deux bandes turbo et une flaque de boue. |
| Canyon solaire | `canyon` | 716 m | 15 m | Virages serrés, deux bandes turbo et deux flaques de boue. |
| Banquise boréale | `glacier` | 697 m | 18 m | Adhérence réduite, trois plaques de glace et une bande turbo. |
| Métropole néon | `neon` | 731 m | 17 m | Chicane et trois bandes turbo décalées. |
| **Mangrove sinueuse** | `mangrove` | **736 m** | **16 m** | Double courbe, quatre flaques de boue alternées et deux bandes turbo. |
| **Dunes de cuivre** | `dunes` | **668 m** | **15 m** | Deux longues lignes droites, quatre bandes turbo décalées et deux flaques de boue extérieures. |

Les définitions sont dans [shared/track.ts](../shared/track.ts). `TRACKS` et `TRACK_IDS` contiennent les six circuits ; les listes de sélection et les programmes de tournoi doivent être dérivés de ces données.

## Mangrove sinueuse

Le tracé technique traverse un décor tropical avec une palette de verts plus sombres que l’Île des Alizés. Deux changements de courbure marqués demandent d’anticiper le braquage. La boue alterne entre les bords : une trajectoire centrale sèche reste disponible, et les deux bandes turbo récompensent la sortie des virages. L’adhérence normale vaut 0,98, contre 1 sur l’Île des Alizés ; les effets de boue restent ceux de la simulation existante.

## Dunes de cuivre

Ce tracé facile reprend les rochers du thème canyon avec une palette sable/cuivre. Les longues portions rapides favorisent l’aspiration et les dépassements. Les quatre bandes turbo sont alternativement décalées à gauche et à droite ; il faut choisir sa ligne pour les enchaîner. Deux flaques extérieures pénalisent les sorties de courbe trop larges. L’adhérence normale vaut 1,04.

## Validation exécutée le 6 octobre 2026

Commande : `node --import tsx tests/tracks.test.ts` — **25 tests réussis**, aucun échec.

- Fermeture des six tracés et absence de croisement entre leurs segments centraux.
- Conversion cohérente distance/position, checkpoints, départs de huit pilotes et zones contenues dans la route.
- Espace suffisant entre les virages éloignés des deux nouveaux tracés, vérifié sur 240 positions par circuit ; les flaques conservent une ligne sèche.
- Huit pilotes automatisés utilisant des commandes ordinaires terminent trois tours sur chacun des six circuits, avec objets et collisions actifs. Aucun positionnement ni résultat n’est injecté dans ces courses.
- Rejet des checkpoints sautés et traversés à l’envers ; égalité des mouvements prédits et autoritaires ; drift et mini-turbo conservés.

| Circuit | Dernier des huit pilotes arrivé, temps simulé |
| --- | ---: |
| Île des Alizés | 53,57 s |
| Canyon solaire | 68,47 s |
| Banquise boréale | 69,27 s |
| Métropole néon | 72,67 s |
| Mangrove sinueuse | 64,43 s |
| Dunes de cuivre | 64,13 s |

Ces temps concernent la simulation déterministe des tests, pas une mesure de performances graphiques. Cette validation ciblée ne remplace pas la vérification visuelle du menu, une course réseau sur le tunnel ou un essai manuel sur deux machines ; leurs résultats doivent être consignés séparément dans [VALIDATION.md](../VALIDATION.md).

## Circuits évolutifs et choix de routes

Les six circuits disposent maintenant d’un module d’événements déterministes : [shared/track-events.ts](../shared/track-events.ts). La simulation autoritaire calcule la phase à partir du tour du leader et la copie sur tous les karts, afin que tous les pilotes voient et rencontrent le même événement, même ceux qui ont un tour de retard.

| Niveau | Apprentissage et changements |
| --- | --- |
| 0 | Piste classique inchangée, utilisée comme référence de non-régression. |
| 1 | Deux chemins permanents ajoutent un choix entre objets, boue, turbo et glace. Au troisième tour du leader, un passage expert s’ouvre. |
| 2 | Au deuxième tour du leader, une section est barrée : il faut contourner les débris par la déviation. La météo change aussi l’adhérence d’une autre portion. Le passage expert s’ouvre au troisième tour. |
| 3 | Les mêmes événements se combinent au troisième tour avec une tempête et une seconde zone de terrain difficile. |

Le changement s’appelle **Inondation** sur les pistes tropicales, **Éboulement** dans les canyons, **Avalanche** sur la banquise et **Route coupée** en ville. Le sol de la portion affectée, les débris et les panneaux changent visiblement. La pluie, la neige ou les cendres sont dessinées avec au plus 180 particules ; les changements de terrain influencent réellement la vitesse ou l’adhérence par les surfaces de simulation existantes.

Trois branches réellement séparées de la chaussée principale sont créées sur chaque circuit :

- **Déviation · objets** : voie large de 9 m, jusqu’à 25 m du centre de la route, deux emplacements d’objets supplémentaires et une courte portion de boue. C’est le contournement accessible lorsque la route principale se ferme ; les pneus adaptés à la boue réduisent le coût de ce choix.
- **Turbo givré** : voie de 6 m, jusqu’à 18 m de la route. Une accélération précède une plaque de glace ; l’adhérence et la stabilité du kart comptent davantage.
- **Passage expert** : voie intérieure de 5,5 m, jusqu’à 19 m de la route, ouverte à la dernière phase. Son tracé est entre 8 % et 29 % plus court que la déviation obligatoire selon le circuit, avec un turbo et une largeur qui demande davantage de précision. La déviation reste disponible.

La route principale reste le choix simple tant qu’elle est ouverte. Les bifurcations portent des panneaux et des flèches ; les bords colorés distinguent les options. Le passage expert est annoncé dès le début par un panneau « TOUR 3 », puis sa chaussée apparaît lors de l’ouverture.

Chaque branche part au moins 6 m après un checkpoint et rejoint la route au moins 6 m avant le suivant. Elle conserve une progression strictement comprise dans ce même intervalle. Le classement ne gagne donc aucun checkpoint par une simple entrée dans un raccourci : le système de franchissement des portes reste nécessaire.

Le rendu est isolé dans [client/track-events.ts](../client/track-events.ts) : `TrackEventsView` s’attache à un groupe ou une scène, reconstruit seulement lors d’un changement de piste/phase/niveau et libère ses géométries, panneaux et matériaux. Les poteaux et débris utilisent des instances partageant leurs géométries. Aucune image externe, aucun service et aucune dépendance supplémentaire.

### Contrats d’intégration

- `getTrackEvent(trackId, stage, level)` : annonce, météo, routes et obstacles communs.
- `nearestDriveableTrack(...)` : proximité et progression sur l’union des chaussées disponibles ; la largeur propre à chaque branche sert à la contrainte de sortie de piste.
- `dynamicSurface(...)` : surface des branches et du terrain transformé, avec identifiants de turbo stables par tour.
- `constrainTrackEvent(...)` : collision balayée contre le barrage, y compris à haute vitesse ; un kart présent sur la tuile lors du changement est dégagé du volume.
- `eventRoutePoint(...)` : guidage ordinaire des CPU vers la déviation. Il ne change ni leur position, ni leurs checkpoints.
- `trackEventPickups(...)` : deux emplacements stables sur la déviation, ajoutés aux objets existants au départ d’une course avec événements.

### Tests du module exécutés

`node --import tsx tests/events.test.ts` : **20 tests réussis** sur les six circuits. Les onze contrôles du module pur vérifient notamment les routes séparées, les raccordements avant les checkpoints, le gain de longueur du passage expert, les surfaces, le barrage dans les deux sens même avec un déplacement de 70 m, le dégagement lors d’un changement de phase, les choix du guidage CPU et la préservation de toute la largeur de la route aux jonctions. Le niveau 0 est comparé aux fonctions de piste originales sur les trois phases.

Six courses complètes sont également exécutées avec **huit pilotes**, les **événements au niveau 3**, les objets et les collisions. Les 48 pilotes terminent leurs trois tours en partant de la grille avec uniquement des commandes ordinaires. Les tests constatent que chacun parcourt réellement la déviation hors de l’ancienne chaussée, que les phases 0/1/2 sont communes et que le classement final comporte huit rangs distincts.

| Circuit | Dernier des huit pilotes arrivé avec événements, temps simulé |
| --- | ---: |
| Île des Alizés | 68,67 s |
| Canyon solaire | 82,80 s |
| Banquise boréale | 80,17 s |
| Métropole néon | 88,37 s |
| Mangrove sinueuse | 81,77 s |
| Dunes de cuivre | 76,13 s |

Un autre test pilote les **dix-huit branches** jusqu’au prochain checkpoint réel, sans réinitialisation. Ce test de maniabilité place initialement le kart devant chaque embranchement, puis utilise seulement accélération, frein et braquage ; il est distinct des six courses complètes parties de la grille. Deux régressions supplémentaires empêchent un choc arrière de pousser un kart dans un barrage et garantissent que le retour au checkpoint ne soit pas bloqué par le balayage d’un trajet fictif de téléportation.

La suite classique `node --import tsx tests/tracks.test.ts` a été réexécutée après l’intégration : **25 tests réussis**, temps simulés du niveau 0 inchangés. Ces résultats valident la simulation ; la synchronisation par le tunnel et le rendu final dans plusieurs navigateurs doivent être consignés séparément après leurs essais.
