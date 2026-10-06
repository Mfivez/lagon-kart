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

Les résultats effectivement exécutés et les captures du build intégrant les douze pistes sont consignés séparément ci-dessous à la fin de la validation. Les captures rapprochées peuvent utiliser une position initiale imposée sur le serveur privé pour cadrer un pont ou un tremplin ; cela ne remplace pas un parcours humain complet.

Exécution confirmée : `node --import tsx --test tests/tracks.test.ts` → **44/44 réussis**, 20,9 s. Huit pilotes ont terminé trois tours sur chacune des douze pistes via les commandes ordinaires. Les contrôles ont également détecté et fait corriger un arrondi de modulo à la lèvre exacte du tremplin céleste. Le typecheck TypeScript est passé après l’ajout des décors.
