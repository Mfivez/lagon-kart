# Commandes mobiles — 7 octobre 2026

## Analyse et décisions

Les anciennes commandes imposaient de tenir simultanément une flèche de direction, l’accélérateur et le drift. Sur 320 px, elles se mélangeaient au compteur, à la mini-carte et au rappel clavier. Les [captures avant](mobile-controls/before-320x568.png) documentent cette situation.

Deux références officielles ont guidé la nouvelle disposition :

- **Mario Kart Tour** propose explicitement direction à gauche / objets à droite en paysage, ainsi que l’inversion. Le jeu distingue aussi direction et drift via un bouton dédié. Nous retenons deux zones stables sous les pouces et un drift séparé. Sources : [orientation et commandes gauche/droite](https://faq.mariokarttour.com/hc/en-us/articles/4409338306073--Android-How-do-the-controls-work-in-Landscape-mode), [bouton direction/drift](https://faq.mariokarttour.com/hc/en-us/articles/4409314167321-What-does-the-Steer-Drift-Button-Display-option-do).
- **Asphalt Legends** propose un choix entre commandes manuelles et TouchDrive et présente cette assistance comme un moyen de rendre le jeu accessible. Nous retenons le choix d’une accélération automatique, sans assistance sur la trajectoire réelle du kart. Sources : [présentation officielle](https://asphaltlegends.com/fr), [explication du directeur du jeu](https://asphaltlegends.com/news/game-manager-ignacio-nacho-marin-shares-his-asphalt-story).

Ces choix sont une adaptation à Lagon Kart, pas une reproduction exacte des commandes de ces jeux. La recherche sur Real Racing 3 n’a pas fourni de documentation officielle suffisamment précise et accessible pour en reprendre des réglages. Aucun asset, code ou musique de ces jeux n’est utilisé ; coût 0 €, aucune dépendance ajoutée.

## Pilotage

| Geste | Résultat |
| --- | --- |
| Pouce gauche sur le joystick, glisser horizontalement | Direction analogique progressive, petite zone neutre au centre |
| Glisser le joystick vers le haut | Accélération manuelle, avec ou sans AUTO |
| Glisser le joystick vers le bas | Frein prioritaire sur AUTO et l’accélérateur, puis marche arrière |
| Glisser en diagonale | Tourner et accélérer ou freiner/reculer en un seul geste |
| `AUTO ON` | Accélération dès le GO ; réglage mémorisé sur cet appareil |
| `AUTO OFF` | Pilotage manuel au joystick ; les pédales séparées restent disponibles |
| Joystick vers le haut ou pédale ↑ pendant la dernière seconde du départ | Départ turbo selon les règles existantes |
| Maintenir FREIN / RECUL | Frein prioritaire sur le gaz automatique, puis marche arrière |
| Maintenir DRIFT, relâcher | Drift puis mini-turbo selon la charge existante |
| Toucher OBJET | Utilisation unique ; l’icône indique l’objet tenu |
| Toucher REPLACER | Retour au dernier point autorisé par le serveur |

Le clavier reste utilisable. Les doigts ne modifient plus le jeu de touches clavier. Deux doigts sur une même action ne l’annulent pas quand un seul se relève. Le joystick conserve son doigt propriétaire jusqu’au relâchement.

Au relâchement, le pouce se recentre sur les deux axes. Avec **AUTO ON**, les gaz reprennent ; avec **AUTO OFF**, le kart roule sur son élan. La zone neutre verticale permet de tourner horizontalement sans déclencher involontairement le frein. Un second doigt peut utiliser DRIFT ou OBJET pendant un geste diagonal.

Une annulation tactile par le système, une perte de focus ou un changement portrait/paysage libère tous les appuis **et suspend le gaz automatique**. Une nouvelle action ou `Reprendre` réactive les commandes. Les spectateurs et pilotes ayant terminé ne voient pas de commandes actives. Le mode automatique attend le GO pour ne pas provoquer de faux départ.

## Écran

Les commandes restent dans les coins inférieurs. Le centre est transparent et ne capture aucun geste. Les zones tactiles font au moins 44 × 44 px ; les actions principales font 62 × 62 px en portrait et 56 × 56 px en paysage compact. Les marges tiennent compte des encoches et de l’indicateur d’accueil (`safe-area-inset-*`, `viewport-fit=cover`). La mini-carte et les tours occupent les coins supérieurs ; le classement détaillé, la carte d’objet redondante et les raccourcis clavier sont retirés du HUD tactile en course. Les menus restent disponibles hors course.

## Validation du joystick sur deux axes

Le 7 octobre 2026 : **11/11 tests d’état**, puis **12 contrôles Chromium** à
320 × 568 et 667 × 375. Accélération, freinage puis vitesse négative, diagonales,
priorité sur AUTO/pédales, relâchements indépendants, drift/objet multitouch,
annulation, changement de format et clavier sont vérifiés. Aucune erreur JS.
Les trois captures ont été inspectées : [portrait](mobile-stick/stick-320x568.png),
[paysage](mobile-stick/stick-667x375.png), [retour au centre](mobile-stick/stick-320x568-neutral.png).

```sh
npm run build
node --import tsx --test tests/mobile-controls.test.ts
npm run test:mobile-stick
```

Le script démarre un serveur et un stockage temporaires ; chaque format ouvre
un entraînement neuf par l’interface. Les gestes CDP produisent les déplacements
réels et les entrées Colyseus sont lues sans modification. Un triple turbo
attribué sur le serveur privé permet de tester une seule charge par pression ;
la perte de focus est un événement synthétique. [Rapport détaillé](mobile-stick/validation.json).
La suite complète intégrée passe également : [349/349 tests](mobile-stick/unit-validation.json).
Les essais sur téléphone physique et Safari iOS restent à faire.

## Validation historique de la disposition initiale

Exécuté le 7 octobre 2026 : **6/6 tests d’état et 15/15 vérifications navigateur**, aucune erreur JavaScript. Formats : 320 × 568, 360 × 640, 390 × 844, 568 × 320 et 667 × 375. La dernière passe utilise le build intégré `index-wc3mK_Sw.js` / `index-DhaT9t6d.css`. Elle couvre les treize contrôles de disposition et de pilotage, puis deux contrôles visuels ciblés ; sept captures ont été produites.

```sh
node --import tsx --test tests/mobile-controls.test.ts
npm exec vite build
node --import tsx scripts/mobile-browser-check.ts
```

Le script démarre son propre serveur éphémère et son stockage isolé. Il utilise une vraie page Chromium et des gestes multitouch CDP, puis vérifie les commandes reçues dans la salle Colyseus. Un triple turbo attribué artificiellement est indiqué comme fixture dans le rapport ; son utilisation passe par le geste normal et le serveur. La perte de focus est injectée par événement, contrairement aux touchers qui sont injectés via CDP.

Deux fixtures visuelles supplémentaires suspendent la simulation privée et placent le kart au sol devant une pancarte de bifurcation, sans en tirer de preuve de pilotage. La [capture à 390 × 844](mobile-controls/after-near-sign-390x844.png) vérifie que la pancarte située à 5,03 m de la caméra disparaît et laisse le kart visible. La [capture à 320 × 568](mobile-controls/after-hud-clearance-320x568.png) vérifie que le kart reste dégagé du compteur : projection à (160 ; 335) px, compteur de y = 251 à 302 px, marge minimale exigée de 12 px. Ces deux images ont été inspectées ; les assertions seules ne suffisent pas à prouver l’absence d’occlusion.

Les mesures, formats, captures et limites d’exécution se trouvent dans [mobile-controls/validation.json](mobile-controls/validation.json). Comparaison : [avant 320 × 568](mobile-controls/before-320x568.png), [après 320 × 568](mobile-controls/after-320x568.png), [avant paysage 568 × 320](mobile-controls/before-568x320.png), [après paysage 568 × 320](mobile-controls/after-568x320.png). Les cinq captures de disposition accompagnent une course normale : même piste et même format que les captures initiales, mais caméra améliorée et position variable. Les deux captures ciblées indiquées plus haut utilisent la fixture déclarée.

**À vérifier sur appareils physiques** : confort des pouces, Safari iOS, interruptions système réelles, encoche réelle, fluidité GPU et latence réseau mobile. L’émulation Chromium/SwiftShader ne remplace pas ces essais.
