# Éditeur : brouillons privés et placement direct

Le brouillon est conservé automatiquement **sur cet appareil**. **Essayer en privé** ouvre le circuit entier dans un atelier solo ; **Essayer ce passage** commence avant le module choisi. Les essais ne publient rien et ne donnent ni XP, ni record, ni replay. **Publier pour la classe** est l’action explicite qui crée ou met à jour le circuit partagé.

| État | Où sont les données ? | Qui peut jouer ? |
| --- | --- | --- |
| Brouillon | Stockage local du navigateur, séparé par profil | Son auteur sur cet appareil |
| Essai privé | Mémoire du salon serveur, supprimée à sa fermeture | Le pilote de cet atelier solo |
| Version publiée | Fichier immuable dans le dossier `data/tracks` du serveur | Les joueurs qui choisissent le circuit |

Un essai d’une nouvelle modification ne remplace pas la version déjà publiée. Le bouton **Retour à l’éditeur** retrouve le brouillon et ses réglages. **Recommencer** réarme les effets et replace le kart au début du passage. Ctrl/Cmd + S conserve le brouillon local ; ce raccourci ne publie pas.

## Placer un module sans calculer son pourcentage

Les repères colorés du plan représentent les zones, ponts/tremplins, loopings, événements et cibles d’interrupteurs. Faites glisser un repère le long de la route : le module garde sa longueur, y compris près de la ligne d’arrivée. Le cercle numéroté d’un interrupteur déplace sa plaque indépendamment de sa cible. Les zones et plaques restent dans la largeur de la route.

Touchez un repère pour ouvrir ses réglages détaillés. Le panneau de sélection propose aussi **Réglages** et **Essayer en privé**. Les champs numériques restent disponibles pour un placement précis. Au clavier : tabulation pour sélectionner un repère, flèches pour le déplacer, Maj pour affiner, Entrée pour ses réglages. **Annuler** ou **Rétablir** traite un glissement complet comme une seule modification.

## Isolation et compatibilité

Le client envoie seulement le brouillon à valider. Le serveur le compile avec les mêmes règles que les circuits publiés, lui attribue un identifiant privé et conserve l’autorité sur la conduite. Cette définition est transmise uniquement au salon propriétaire. Elle est exclue du catalogue et des identifiants admis par les salons ordinaires, les tournois et les replays. La définition et son cache d’événements sont supprimés à la fermeture de l’atelier.

Les fichiers des versions publiées et leur géométrie restent inchangés. Aucun nouveau service, asset, abonnement ou dépendance n’est utilisé.

## Vérifications

Commande exécutée :

```sh
node --import tsx --test tests/custom-track-preview.test.ts tests/track-interactions.test.ts tests/custom-tracks.test.ts
```

**20 tests réussis** : isolation du registre, source privée immuable, absence du catalogue et des fichiers, refus de réutilisation par un autre salon, hydratation et accusé de réception, conduite réseau ordinaire, recommencement, progression inchangée, nettoyage, publication volontaire après essais, déplacement des cinq types de modules et conservation de longueur, compatibilité des anciens circuits et courses CPU complètes.

Commande navigateur exécutée le 7 octobre 2026 :

```sh
node --import tsx scripts/ux-editor-browser-check.ts
```

**4 parcours réussis**, zéro erreur JavaScript, sur les bundles `index-DNUBohE_.js` et `index-CpYYGxpj.css`. Le [rapport détaillé](browser-validation.json) contient les valeurs avant/après, les trois identifiants privés et les relevés de progression.

- Souris et clavier : déplacement des cinq groupes de modules et de la plaque indépendante, conservation de leur longueur, annuler/rétablir chaque glissement en une action, flèches et accès aux réglages.
- Trois essais réels : looping, circuit entier, puis looping modifié après publication. L’accélération normale produit 5,18 à 6,60 m/s et plus d’un mètre de déplacement avant relâchement. Chaque définition privée est libérée au retour dans l’éditeur. Aucune course complète ni traversée intégrale du looping n’est revendiquée par ce scénario.
- Avant publication : catalogue et dossier de circuits vides, brouillon retrouvé après rechargement. Publication explicite de la version 1, puis modification et essai sans changer cette version. XP, statistiques, MMR et liste des replays identiques avant/après.
- À 320 × 568 : glisser tactile réel, toucher du repère ouvrant les champs, boutons contrôlés d’au moins 44 × 44 px et aucun débordement horizontal du dialogue. La zone passe de 22,48 % à 26,95 % en gardant sa longueur de 2,5 %. La seconde publication explicite crée seule la version 2.

La fixture est créée entièrement dans l’interface : **Grand ovale**, nom **Mon brouillon confidentiel**, zone turbo initiale, pont de 8 % à partir de 30 %, looping initial de 9 % à partir de 55 %, pluie au tour 2 sur 4 % à partir de 72 %, plaque à 82 % reliée à un turbo de 3 % à partir de 88 %. Les gestes déplacent ensuite les repères d’environ 4,5 points de pourcentage ; les valeurs exactes sont dans le rapport. Le dernier essai réduit la hauteur du looping de 28 à 26 mètres. Les sources de la publication sont relues par API et les fichiers comptés.

Les captures réelles ont été inspectées : [placement des modules sur ordinateur](direct-module-placement.png), [atelier privé devant le looping](private-draft-workshop.png), [réglages après toucher à 320 px](mobile-touch-module-settings.png). Elles sont prises après relâchement des commandes : la vitesse affichée sur une capture ne constitue pas la mesure de conduite. Deux premières tentatives ont buté uniquement sur `page.screenshot` sous SwiftShader ; `Page.captureScreenshot` du viewport a donné les trois images sans changer la page ni la simulation. Aucun échec de capture dans le passage réussi.

Le scénario utilise un serveur local et des données temporaires, des commandes souris/clavier/toucher normales et la lecture des API ; aucune position ni progression de kart n’est imposée. Chromium, les salons, le serveur et le dossier temporaire ont été fermés ou supprimés. Aucune publication sur le serveur de la classe. Téléphone physique, Safari iOS et le tunnel ne sont pas couverts par ce parcours privé.

## Scénarios historiques

Les rapports et captures des lots précédents sont conservés. Les trois scénarios suivants ont été **adaptés mais non rejoués dans ce lot** ; leurs anciens rapports ne prouvent donc pas encore ces nouvelles versions des scripts.

| Script | Adaptation et couverture conservée |
| --- | --- |
| `scripts/track-editor-browser-check.ts` (`test:track-editor`) | Attend « Circuit publié » et la fermeture qui garde le brouillon local. Vérifie maintenant un identifiant privé et l’absence de version 3 implicite ; la version 2 aux points collés reste publiée. Erreur réseau simulée, récupération du brouillon, édition au clavier/toucher, conduite et duplication indépendante restent contrôlées. |
| `scripts/editor-features-browser-check.ts` (`test:editor-features`) | Attend la publication explicite ; l’essai du brouillon vérifie « LIBRE » et la publication/fichier v2 inchangés. Le contrôle du compteur « /6 » est conservé dans une vraie course partagée entre ses deux profils. Modules, événements, persistance et duplication mobile restent contrôlés. `REPORT_DIR` permet un nouveau dossier de preuves à la prochaine exécution. |
| `scripts/public-editor-presence-check.ts` | Attend « Circuit publié » et ouvre le sélecteur de circuits replié. Garde son journal de reprise, son unique exemple autorisé, les deux présences, la relecture API et la course partagée sur six tours ; aucune recherche classée ajoutée. |

Les trois scripts capturent le viewport réel par CDP pour éviter le blocage SwiftShader observé sous le dialogue de l’éditeur. Les relevés de conduite précèdent le relâchement des commandes ; les captures le suivent. Aucune assertion de partage n’a été remplacée par un simple essai local. À la prochaine exécution, utiliser un `REPORT_DIR` distinct pour conserver les preuves historiques.

`scripts/interactive-workshop-browser-check.ts`, du lot immédiatement précédent, a été adapté : il publie explicitement son circuit initial, attend « Circuit publié », puis vérifie des essais sur identifiants privés et une publication inchangée. Il n’a pas été relancé dans ce lot ; ses rapports historiques n’ont pas été remplacés. Aucun script npm n’est redirigé vers un autre périmètre de test.
