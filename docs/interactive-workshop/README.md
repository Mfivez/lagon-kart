# Interrupteurs et essais de passage

Dans l’éditeur, ouvrez **Interrupteurs et effets partagés** et ajoutez une **plaque → turbo** ou une **plaque → tremplin**. Le cercle vert du plan représente la plaque ; un trait la relie à sa cible. Les panneaux en course portent le même numéro.

- **Plaque (%)** : position à franchir dans le sens normal de la course, au sol.
- **Position / longueur (%)** : portion cible du circuit, depuis le départ.
- **Durée active** : de 3 à 30 secondes après une annonce d’une seconde.
- **Largeur / décalage** : voie occupée par la plaque et le turbo.
- Pour un tremplin, **hauteur fixe** règle sa géométrie et **impulsion active** règle le saut supplémentaire. Le tremplin occupe la largeur de la route.

La plaque peut être franchie par n’importe quel pilote, CPU compris. L’état est partagé par le serveur : tous profitent du même effet. Rouler à répétition sur une plaque active ne prolonge pas sa durée. Elle se recharge deux secondes après expiration. Le turbo conserve la règle habituelle d’une activation par pilote et par tour.

Prévoyez assez de distance entre la plaque et sa cible pour l’annonce, puis ajustez par un essai. Une rampe reste présente quand son effet s’arrête : seule l’impulsion supplémentaire disparaît. Aucun mur ni fermeture n’apparaît sous les pilotes. Les superpositions conservent la priorité des loopings puis du premier relief ; les tremplins d’interrupteur viennent après les reliefs ordinaires.

## Essayer un passage

Chaque zone, pont, tremplin, looping, événement ou interrupteur possède **Essayer ce passage**. Le circuit est d’abord sauvegardé, puis une séance d’atelier démarre avant l’élément choisi. L’approche est calculée sur la version publiée, habituellement 35 mètres avant le passage. Pour un interrupteur, elle commence avant sa plaque. Un événement se teste avec sa phase de tour sélectionnée.

Dans la séance, **Recommencer** replace instantanément au même départ et réarme les plaques. **Retour à l’éditeur** rouvre les réglages conservés. Cette séance isolée ne produit pas d’XP, de record, de classement ni de résultat de carrière. Elle n’attribue pas de certification de jouabilité au circuit : essayez aussi une course entière avec les autres joueurs avant d’organiser un tournoi.

## Vérification ciblée

Commande exécutée :

```sh
node --import tsx --test tests/track-interactions.test.ts tests/custom-tracks.test.ts
```

16 tests réussis : compilation et réouverture du stockage, compatibilité des anciens circuits, annonce/activation/expiration partagées, impossibilité de prolonger par stationnement, traversées arrière/aériennes et téléportations ignorées, différence physique d’impulsion avec géométrie inchangée, approche d’atelier et indexes invalides, quatre CPU terminant trois tours avec les deux effets. `npx tsc --noEmit` réussit.

Ces tests de simulation placent explicitement des karts pour couvrir les limites d’une plaque et d’une rampe. Le test de course complète utilise uniquement les commandes ordinaires de l’autopilote.

## Vérification navigateur

Commande exécutée après compilation du client :

```sh
node --import tsx scripts/interactive-workshop-browser-check.ts
```

Le [rapport du 7 octobre 2026](browser-validation.json) contient **4 contrôles réussis**, aucune erreur JavaScript et les bundles vérifiés (`index-DSJ-VYI_.js`, `index-oCmcxhXo.css`). La création des deux plaques et tous les essais passent par l’interface. Un pilote automatisé calcule uniquement les touches clavier depuis les positions reçues ; il ne modifie jamais le monde, les trajectoires ni les résultats.

- Turbo activé réellement : vitesse observée de 38,8 m/s.
- Tremplin activé réellement : vitesse verticale de 8,33 m/s, altitude de 2,289 m, puis réception normale.
- **Recommencer** : coordonnées exactement identiques au départ de l’essai, plaques réarmées.
- **Retour à l’éditeur** : paramètres conservés, aucune nouvelle version publiée par les essais.
- Progression relue par API : XP, statistiques, MMR et liste des replays strictement identiques avant/après.
- Écran 320 × 568 : champs et boutons d’au moins 44 × 44 pixels, aucun débordement, ajout/suppression par toucher et modification d’un réglage.

Captures inspectées : [éditeur et modules](editor-interactive-modules.png), [turbo actif dans l’atelier](workshop-shared-turbo.png), [réglages sur mobile 320 px](editor-interactions-mobile-320.png). La capture du turbo suit le relâchement des touches ; les mesures physiques proviennent des snapshots prélevés pendant la conduite.

Le serveur, les profils et le circuit de ce scénario sont privés et temporaires. Le navigateur et le serveur ont été fermés, les données temporaires supprimées. Aucun circuit de la classe n’a été modifié. La séance étant solo, la synchronisation entre deux clients relève des tests réseau séparés. Téléphone physique et Safari iOS restent non testés.
