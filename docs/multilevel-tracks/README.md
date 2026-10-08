# Croisements à plusieurs étages

Lorsqu’un circuit créé dans l’éditeur se croise, la portion parcourue le plus tard depuis le départ monte au-dessus de l’autre. Un tablier ferme le dessous du pont et laisse un passage en tunnel. Plusieurs branches peuvent former des niveaux supplémentaires. Le modèle **Huit superposé** permet d’essayer un premier croisement sans construire le tracé à la main.

Les niveaux sont calculés à partir du brouillon, puis recalculés après déplacement des points, modification de la largeur, déplacement du départ et rechargement. Le serveur et le client utilisent la même géométrie. Les plateaux sont dimensionnés avec **5 m de hauteur libre** sous un tablier de **0,7 m** ; sur le huit sans autre relief, les routes sont à 0 et 5,7 m. Les ponts, tremplins et loopings ajoutés manuellement restent pris en compte.

Le kart conserve sa branche et son étage au croisement. Les checkpoints, remises en piste, objets, contacts et aspirations tiennent compte de la hauteur. Un saut sous un pont rencontre son plafond. Le rendu place les supports hors des voies et adapte la caméra à l’entrée du tunnel.

Dans l’éditeur, les ponts dorés passent visuellement au-dessus des portions en pointillés. Les repères indiquent le niveau et les pourcentages du tour correspondant aux passages dessus/dessous. L’aperçu se recalcule pendant un glissement et reste compatible avec Annuler/Rétablir. Pour les dessins très denses, le plan détaille les 48 premiers croisements et nomme les 24 premiers ; le total est affiché et tous les croisements restent présents dans le circuit compilé.

[Mode d’emploi de l’éditeur](../TRACK_EDITOR.md).

## Contrôles exécutés

| Contrôle | Résultat observé | Portée |
| --- | --- | --- |
| Géométrie, `tests/track-crossings.test.ts` | **8/8** : huit, trois étages, reliefs existants, largeur/angle, sélection de la branche, relecture JSON, points créatifs et garde-corps sans hauteur ajoutée | Les trois niveaux contrôlés sont à 0, 5,7 et 11,4 m ; ce sont des tests de géométrie, pas trois machines ni une capture 3D. |
| Physique, `tests/crossing-physics.test.ts` | **7/7** : branche conservée et prédiction identique à deux/trois étages, interactions séparées, checkpoint/reset, plafond lors d’un saut, projectiles et aspiration | Deux pilotes terminent aussi trois tours en **114,10 s simulées** avec des commandes ordinaires. Cette mesure est une simulation locale. |
| Construction du rendu, `tests/crossing-rendering.test.ts` | **3/3** : tablier solide, voie inférieure dégagée, supports/caméra et relief manuel | Tests des objets de rendu et du calcul de caméra ; ils ne remplacent pas l’inspection des captures. |
| [Course réseau privée](network-validation.json) | **2/2 pilotes SDK terminent un tour**, passent sous le pont puis dessus et reçoivent le même classement. Temps serveur final : **37,733 s**. Aucune erreur. | Course normale Colyseus, hors entraînement et atelier. Commandes à 30 Hz, sans injection de position, hauteur, tour ou arrivée. |
| Persistance du scénario réseau | Source publiée par l’API privée, fichier créé, source et étages identiques après ouverture d’un nouveau store | Le processus serveur n’a pas été redémarré. Les fichiers et le serveur temporaires ont été supprimés après le test. |
| [Éditeur Chromium](editor/validation.json) | **4 groupes de contrôles réussis**, aucune erreur JavaScript | Modèle sélectionné dans l’UI, pont/tunnel/niveaux, glissement avant relâchement, Annuler/Rétablir, brouillon retrouvé, vrai geste tactile à 320 × 568 et absence de débordement. Aucune publication. |
| [Course et captures 3D](visual/validation.json) | **Trois captures réussies et inspectées**, aucune erreur JavaScript ; deux pilotes terminent le tour | Approche, intérieur du tunnel et route supérieure atteints par conduite ordinaire. Le freinage maintient les pilotes pendant la capture ; il explique les temps de course plus longs. |
| [Suite complète dans Docker isolé](unit-validation.json) | **443/443 tests réussis**, aucun ignoré ni annulé, en **203,814 s** | Les 84 sources TS/CSS du jeu correspondent par SHA-256 à l’image testée. Une assertion supplémentaire sur les garde-corps a ensuite été ajoutée et les huit tests géométriques relancés avec succès, sans changement du code du jeu. [Journal complet](unit-tests.tap). |
| Build et [déploiement](deployment.json) | TypeScript, Vite, compilation serveur et image Docker réussis ; application recréée sans salon actif | **49 fichiers de sauvegarde identiques par SHA-256**, conteneur tunnel conservé, état HTTP sain et JS/CSS publics identiques aux assets locaux. |
| [Contrôle WSS public](public-smoke.json) | Aperçu privé du huit parcouru à 0 m puis 5,7 m, 473 snapshots et 702 commandes, aucune erreur | Atelier **solo** sur le tunnel, sans profil créé ni publication ; catalogue inchangé et connexion fermée. Ce contrôle public est distinct de la course normale à deux pilotes réalisée en privé. |

Captures de l’éditeur inspectées : [ordinateur](editor/figure-eight-desktop.png), [mobile 320 px](editor/figure-eight-mobile.png), [détails des passages sur mobile](editor/crossing-details-mobile.png).

## Captures 3D : essais conservés et protocole final

Deux tentatives de capture ont échoué et sont conservées, sans être présentées comme des validations réussies :

- [Tentative 1](visual-attempt-1/validation.json) : la capture de l’approche a réussi, mais la lenteur de capture a fait manquer la fenêtre attendue à l’intérieur du tunnel. Le scénario s’est arrêté avant d’obtenir les trois vues.
- [Tentative 2](visual-attempt-2/validation.json) : le test a confondu la progression ramenée en fin de tour sur la grille avec un passage au tunnel. Il a contrôlé la hauteur d’une caméra encore hors du tunnel et a échoué sur cette assertion.

Ces échecs ne démontrent pas un bug de conduite ou de caméra. Le protocole final de `scripts/crossing-visual-check.ts` vérifie la portion réellement atteinte et envoie les commandes ordinaires de freinage pour immobiliser les pilotes pendant chaque capture. Il ne modifie ni horloge, ni position, ni altitude, ni état de la simulation. Un navigateur rejoint la course comme spectateur de deux pilotes SDK.

Le [scénario final a réussi](visual/validation.json). Les captures inspectées montrent l’[approche du tunnel](visual/tunnel-approach.png) à 150,09 m du départ, l’[intérieur du tunnel](visual/inside-tunnel.png) à 194,46 m et la [route supérieure](visual/on-upper-road.png) à 759,43 m. Les altitudes du kart sont respectivement **0 / 0 / 5,7 m**. À l’intérieur, la caméra est à 3,1 m et reste sous le plafond de 5 m. Les deux pilotes terminent le tour en **69,77 et 69,87 s**, freinages ordinaires de capture compris. Aucun état de course n’a été injecté.

## Limites et validations restantes

- Sur des tracés extrêmement serrés ou très denses, les rampes peuvent être comprimées et raides. La liberté de dessin est conservée ; la validité géométrique ne garantit pas qu’un tracé soit confortable ou terminable par tous les CPU.
- Les trois étages sont couverts en géométrie et physique. Le scénario visuel exécuté porte sur le modèle en huit à deux niveaux.
- Téléphone physique, Safari iOS, performances GPU réelles et conduite depuis deux machines physiques non vérifiés dans ce lot.
- Le contrôle public porte sur l’atelier solo. Le multijoueur normal et les captures Chromium ont été vérifiés sur des serveurs temporaires locaux, avec les mêmes sources du jeu.

## Reproduire

Depuis la racine du projet :

```sh
npm run build
node --import tsx --test tests/track-crossings.test.ts tests/crossing-physics.test.ts tests/crossing-rendering.test.ts
node --import tsx scripts/crossing-network-check.ts
REPORT_DIR=docs/multilevel-tracks/editor node --import tsx scripts/crossing-editor-browser-check.ts
REPORT_DIR=docs/multilevel-tracks/visual node --import tsx scripts/crossing-visual-check.ts
```

Les scripts navigateur servent `dist/client` : reconstruire avant de les lancer. Les scénarios utilisent leurs propres serveurs et données temporaires ; ne pas remplacer leurs chemins de stockage par ceux de la classe. Exécuter les scénarios Chromium successivement pour éviter la concurrence sur le rendu logiciel.
