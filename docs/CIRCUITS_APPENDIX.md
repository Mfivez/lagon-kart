# Six circuits supplémentaires : ponts et tremplins

Les six circuits d’origine sont conservés. Six nouveaux tracés portent le catalogue à **douze**, sélectionnables individuellement ou dans le programme et le panier aléatoire d’un tournoi. Les nouveaux tracés mesurent de 1,13 à 1,22 km, avec une chaussée de 22 à 24 m : davantage de place pour les dépassements et des courbes plus ouvertes.

| Identifiant | Circuit | Longueur | Largeur | Décor original et particularités |
| --- | --- | ---: | ---: | --- |
| `volcan` | Caldeira ardente | 1 129 m | 22 m | Cratère, lave, colonnes de basalte ; viaduc de 5 m et tremplin de 2,1 m. |
| `forest` | Forêt des géants | 1 167 m | 22 m | Séquoias, sous-bois, champignons ; pont en bois de 4,5 m et saut de 1,6 m. Boue évitable. |
| `harbor` | Port des cargos | 1 173 m | 24 m | Grues, conteneurs et cargo ; pont métallique de 6 m et rampe de quai de 2,4 m. Plaque glissante latérale. |
| `sky` | Archipel céleste | 1 199 m | 24 m | Îlots flottants, nuages et montgolfière ; deux ponts de 7 m et 5,5 m, tremplin de 2,3 m. |
| `foundry` | Fonderie des pistons | 1 217 m | 22 m | Usine, cheminées, tours de refroidissement et pistons ; passerelle de 5 m et rampe d’essai de 2 m. |
| `castle` | Citadelle royale | 1 196 m | 24 m | Remparts, tours, drapeaux et douves ; pont de pierre de 4 m et saut de parade de 1,8 m. |

## Cohérence du relief

`shared/track.ts` expose `TrackDefinition.elevations`, `trackElevation(progress, trackId)`, `trackSlope(progress, trackId)` et `trackJumpAt(progress, trackId)`. Les distances sont exprimées en mètres le long de la route principale ; les intervalles n’enveloppent pas la ligne d’arrivée.

Les approches des ponts utilisent une transition douce avec une pente maximale de **15 %**. Les tremplins sont des rampes réelles dont la lèvre est surélevée ; la route revient au niveau du sol après la lèvre. Les points de départ et de fin des rampes sont inclus dans le maillage pour éviter une lèvre dessinée à une autre position que celle de la simulation. Chaque tremplin dispose d’un corridor d’atterrissage vérifié sur **55 m**, sans autre relief à cet endroit.

`client/scenery-extras.ts` construit les tabliers, piliers, garde-corps, supports de rampe, chevrons et décors spécifiques. Les jonctions des branches d’événement gardent un passage dans les garde-corps. Les props répartis sur la carte évitent la piste et ses branches. Ces structures sont fusionnées par le mécanisme de batching existant du moteur ; aucun post-traitement n’est ajouté.

La simulation verticale et le placement des karts/caméra/objets sont intégrés dans les modules partagés et le renderer. Les décors n’introduisent pas de murs de collision cachés ; la trajectoire horizontale reste gouvernée par la simulation existante.

## Sources et coût

Tous les nouveaux décors sont des créations procédurales originales dans le dépôt, assemblées à partir de primitives Three.js. Aucun nouvel asset distant, abonnement, service génératif, texture payante ou dépendance n’est utilisé. Coût : **0 €**. Ils sont servis avec le jeu depuis la même origine et n’exigent aucun outil de création au lancement.

## Validation

Les contrôles de `tests/tracks.test.ts` couvrent les douze routes fermées et sans auto-intersection, leurs surfaces, huit places de départ, les checkpoints, la prédiction, les espacements entre virages, les pentes et les corridors d’atterrissage. Des pilotes de test utilisent les commandes ordinaires pour terminer trois tours avec objets et collisions.

Les résultats effectivement exécutés et les captures du build intégrant les douze pistes sont consignés ci-dessous. Les captures rapprochées utilisent une position initiale imposée sur le serveur privé pour cadrer un pont ou un tremplin ; cela ne remplace pas un parcours humain complet.

Exécution confirmée : `node --import tsx --test tests/tracks.test.ts` → **44/44 réussis**, 20,9 s. Huit pilotes ont terminé trois tours sur chacune des douze pistes via les commandes ordinaires. Les contrôles ont également détecté et fait corriger un arrondi de modulo à la lèvre exacte du tremplin céleste. Le typecheck TypeScript est passé après l’ajout des décors.


Durées simulées pour terminer les trois tours des huit pilotes sur les nouvelles pistes (mode classique, commandes de test ordinaires, objets et collisions activés) : Caldeira 99,00 s ; Forêt 98,50 s ; Port 98,13 s ; Archipel 101,07 s ; Fonderie 108,57 s ; Citadelle 102,30 s. Il s’agit de tests de simulation accélérés, pas de chronos humains ni de courses réseau en temps réel.

## Contrôle navigateur des six nouveaux décors

Exécuté le 6 octobre 2026 : `node --import tsx scripts/circuits-browser-check.ts` → **8/8 contrôles réussis, code de sortie 0**, avec le client `index-DDvpm3uY.js` et `index-CVkCqp_J.css`. Le [rapport détaillé](circuits-expanded/validation.json) contient les mesures serveur, les snapshots, les manipulations du harnais et la liste des **25 captures**. Aucune erreur JavaScript ni ressource manquante n’a été relevée.

Le test lance un serveur et un stockage de profils temporaires, puis deux contextes Chromium indépendants sur le même ordinateur : un pilote au clavier et un spectateur qui reçoit les snapshots par Colyseus. Pour chaque circuit, il mesure la hauteur du pont, accélère réellement depuis l’arrêt avant le tremplin et observe le décollage, le vol puis l’atterrissage. Les six karts retombent sur la chaussée à `elevation = 0`, `verticalVelocity = 0` et `airborne = false`.

| Circuit | Pont mesuré | Altitude de la photo du saut | Maximum du saut complet | Captures |
| --- | ---: | ---: | ---: | --- |
| Caldeira ardente | 5,00 m | 3,31 m | 3,40 m | [Panorama](circuits-expanded/volcan-overview.png), [pont](circuits-expanded/volcan-bridge.png), [saut](circuits-expanded/volcan-jump.png), [branches](circuits-expanded/volcan-routes-stage-2.png) |
| Forêt des géants | 4,50 m | 2,53 m | 2,59 m | [Panorama](circuits-expanded/forest-overview.png), [pont](circuits-expanded/forest-bridge.png), [saut](circuits-expanded/forest-jump.png), [branches](circuits-expanded/forest-routes-stage-2.png) |
| Port des cargos | 6,00 m | 3,84 m | 3,92 m | [Panorama](circuits-expanded/harbor-overview.png), [pont](circuits-expanded/harbor-bridge.png), [saut](circuits-expanded/harbor-jump.png), [branches](circuits-expanded/harbor-routes-stage-2.png) |
| Archipel céleste | 7,00 m | 3,92 m | 3,98 m | [Panorama](circuits-expanded/sky-overview.png), [pont](circuits-expanded/sky-bridge.png), [saut](circuits-expanded/sky-jump.png), [branches](circuits-expanded/sky-routes-stage-2.png) |
| Fonderie des pistons | 5,00 m | 3,38 m | 3,44 m | [Panorama](circuits-expanded/foundry-overview.png), [pont](circuits-expanded/foundry-bridge.png), [saut](circuits-expanded/foundry-jump.png), [branches](circuits-expanded/foundry-routes-stage-2.png) |
| Citadelle royale | 4,00 m | 2,90 m | 2,96 m | [Panorama](circuits-expanded/castle-overview.png), [pont](circuits-expanded/castle-bridge.png), [saut](circuits-expanded/castle-jump.png), [branches](circuits-expanded/castle-routes-stage-2.png) |

Le dernier contrôle utilise les vrais menus pour composer un [tournoi aléatoire de huit manches](circuits-expanded/random-eight-races-new-six.png) parmi les six nouveaux circuits cochés. Le programme reçu du serveur comporte bien huit manches, toutes dans ce panier ; les douze circuits figurent dans le catalogue et dans les cases de sélection. Le programme n’est pas parcouru durant ce contrôle.

Les manipulations de test sont explicites : position de départ imposée au milieu du pont puis six mètres avant la rampe ; CPU requis pour démarrer retiré ensuite pour éviter qu’il pousse le kart photographié ; phase événementielle deux imposée pour inspecter les branches ; panneaux d’accueil masqués uniquement pour les panoramas. L’intervalle de simulation du salon privé est suspendu pour la photo du pont et près du sommet du saut, après réception de l’altitude par le spectateur. Les snapshots continuent à circuler, le HUD reste affiché, puis la simulation reprend et calcule seule l’atterrissage. La hauteur du saut n’est jamais imposée.

Les 25 images ont été ouvertes et inspectées : décors distincts, lave visible, ponts et rampes raccordés, kart en vol avec ombre au sol, HUD suivant le kart observé et branches accessibles aux jonctions montrées. Un défaut cosmétique a été signalé séparément : quelques pointillés ou triangles clairs sur la chaussée très éloignée des panoramas, notamment Fonderie et Citadelle. Les vues de conduite rapprochées sont lisibles. Ces captures conservent la trace du build testé.

Ce lot ne démontre ni une course humaine complète sur chaque circuit, ni deux machines physiques, ni le tunnel public, ni les performances d’un GPU réel. La validation des profils, du garage et de la conduite clavier à deux joueurs est décrite dans [FEATURE_BROWSER.md](FEATURE_BROWSER.md). Les contrôles publics/Docker sont consignés séparément dans la documentation générale de validation.

Ce défaut de profondeur a ensuite été corrigé dans le build `index-DCnyszy_.js`, par un plan proche de caméra à 10 m en panorama et 1 m en conduite. La comparaison ciblée sur Fonderie et Citadelle conserve le même cadrage et confirme le résultat, avec et sans ombres : [huit captures et mesures](overview-depth/README.md). Les 25 captures ci-dessus restent celles du build précédent ; les six sauts n’ont pas été rejoués pour cette seule modification de caméra.
