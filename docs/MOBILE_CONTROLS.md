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
| Pouce gauche sur le volant, glisser horizontalement | Direction analogique progressive, petite zone neutre au centre |
| `AUTO ON` | Accélération dès le GO ; réglage mémorisé sur cet appareil |
| `AUTO OFF`, maintenir ↑ | Accélération manuelle |
| Maintenir ↑ pendant la dernière seconde du départ | Départ turbo selon les règles existantes |
| Maintenir FREIN / RECUL | Frein prioritaire sur le gaz automatique, puis marche arrière |
| Maintenir DRIFT, relâcher | Drift puis mini-turbo selon la charge existante |
| Toucher OBJET | Utilisation unique ; l’icône indique l’objet tenu |
| Toucher REPLACER | Retour au dernier point autorisé par le serveur |

Le clavier reste utilisable. Les doigts ne modifient plus le jeu de touches clavier. Deux doigts sur une même action ne l’annulent pas quand un seul se relève. Le joystick conserve son doigt propriétaire jusqu’au relâchement.

Une annulation tactile par le système, une perte de focus ou un changement portrait/paysage libère tous les appuis **et suspend le gaz automatique**. Une nouvelle action ou `Reprendre` réactive les commandes. Les spectateurs et pilotes ayant terminé ne voient pas de commandes actives. Le mode automatique attend le GO pour ne pas provoquer de faux départ.

## Écran

Les commandes restent dans les coins inférieurs. Le centre est transparent et ne capture aucun geste. Les zones tactiles font au moins 44 × 44 px ; les actions principales font 62 × 62 px en portrait et 56 × 56 px en paysage compact. Les marges tiennent compte des encoches et de l’indicateur d’accueil (`safe-area-inset-*`, `viewport-fit=cover`). La mini-carte et les tours occupent les coins supérieurs ; le classement détaillé, la carte d’objet redondante et les raccourcis clavier sont retirés du HUD tactile en course. Les menus restent disponibles hors course.

## Validation reproductible

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
