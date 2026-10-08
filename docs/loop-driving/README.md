# Conduite dans les loopings

Validation ciblée du maintien du kart sur la piste magnétique, de la direction et du cadrage.

## Correctif

- La direction agit dans le repère du ruban : le kart suit la courbure, gauche/droite permettent de changer de ligne, puis le cap se stabilise au relâchement. Accélération, freinage et marche arrière restent pilotés par le joueur.
- Les rails retiennent toute la carrosserie avant le calcul de l'adhérence, y compris après un contact entre karts. Leur limite se mesure sur la surface magnétique, même tête en bas. Les murs ordinaires gardent leur hauteur finie et peuvent toujours être franchis par un vrai saut.
- La caméra suit la direction de la route avec une visée deux mètres devant le kart. De petits chevrons donnent un repère sur les surfaces unies, notamment en portrait ; ils ajoutent un seul appel de dessin par looping.
- Les modules de looping jointifs ou superposés d'un circuit personnalisé forment un seul ruban continu, avec hauteur et écartement maximaux des modules concernés. Les sources restent intactes et chaque bouton d'essai de l'éditeur rejoint le bon passage.

Le mouvement reste partagé entre serveur et prédiction client. Ce correctif n'ajoute ni dépendance, ni asset externe, ni champ au protocole réseau.

## Reproduction avant correction

`before/validation.json` provient de l'ancien serveur compilé et de son client, sur un serveur temporaire. Sur Archipel céleste, maintenir la direction à fond après l'entrée faisait perdre `loopId` au kart. Son centre atteignait 16,999 m du centre de la route, à la limite extérieure du rail (12 m de demi-chaussée + 5 m d'accotement) : une partie de sa carrosserie traversait donc le rail. Il retombait au sol sans terminer le looping dans les 12 secondes observées. Les deux clients SDK recevaient plus de 300 snapshots chacun.

Le champ `passed: true` du rapport avant signifie que le protocole de reproduction et de capture s'est terminé ; il ne signifie pas que ce comportement était correct. Le cas reproduit contient explicitement `exited: false` et `lostAdhesion: true`.

## Protocole reproductible

```sh
node --import tsx scripts/loop-driving-check.ts --baseline
# Après reconstruction du client et du serveur :
node --import tsx scripts/loop-driving-check.ts
```

La première commande doit être exécutée avec les anciens fichiers `dist`. La seconde charge le serveur source actuel et sert le client `dist/client` ; reconstruire celui-ci avant le test.

Le script crée son propre serveur HTTP/WebSocket, ses comptes et son circuit atelier dans un répertoire temporaire, puis les supprime. Il n'utilise pas les données Docker ni le tunnel public. Une fixture place le pilote à l'arrêt, au sol, 3 m avant l'entrée ; vitesse, altitude, position et orientation suivantes sont produites par la simulation normale. Le turbo des essais gauche est attribué avant le départ du parcours puis activé par la commande d'objet habituelle.

Les parcours réseau se font dans des courses ordinaires avec deux SDK Colyseus. Ils maintiennent le braquage à gauche avec turbo, puis à droite, sur Archipel céleste, Fonderie des pistons et un ovale créé par la même API que l'éditeur. Les essais navigateur finaux maintiennent réellement les touches de direction, puis un joystick tactile CDP, dans deux autres courses ordinaires. Les entrées reçues par le serveur sont vérifiées.

Pour les captures uniquement, un navigateur spectateur suit un pilote SDK. La simulation privée est suspendue aux fractions réellement atteintes 0,25, 0,50 et 0,75 ; elle reprend ensuite jusqu'à la sortie. Les comparaisons utilisent les mêmes circuits, fractions visées, dimensions et qualité graphique. Les quelques centimètres d'écart entre fractions viennent du pas normal de simulation.

## Captures comparables

| Point de vue | Avant | Après |
| --- | --- | --- |
| Entrée 1280 × 800 | [Avant](before/sky-entry-1280x800.png) | [Après](after/sky-entry-1280x800.png) |
| Sommet 1280 × 800 | [Avant](before/sky-apex-1280x800.png) | [Après](after/sky-apex-1280x800.png) |
| Sommet 390 × 844 | [Avant](before/sky-apex-390x844.png) | [Après](after/sky-apex-390x844.png) |
| Sommet 667 × 375 | [Avant](before/sky-apex-667x375.png) | [Après](after/sky-apex-667x375.png) |
| Sortie 1280 × 800 | [Avant](before/sky-exit-1280x800.png) | [Après](after/sky-exit-1280x800.png) |

Les quinze captures finales ont été inspectées : kart visible, chevrons lisibles au sommet en portrait et repères de route présents. [Rapport navigateur et réseau](after/validation.json).

## Tests exécutés

- **473/473 tests** réussis, sans test ignoré, dans un conteneur isolé sans volume joueur : **117,397 s**. Ils couvrent notamment les 22 nouveaux cas de conduite et de limites des loopings, les murs à hauteur finie, les croisements à plusieurs étages, la progression et les circuits personnalisés. [Rapport complet](unit-validation.json).
- Build TypeScript/Vite/serveur et image Docker réussis. Client testé : `index-DGtnJrd4.js`.
- **Six traversées SDK et deux parcours navigateur** réussis sur le build final, en course normale. Aucune perte d'adhérence, sommet et sortie atteints, corps du kart contenu avant les rails. Les touches maintenues et le joystick tactile sont réellement reçus par le serveur. **Quinze captures** contrôlent la pose autoritaire, le cadrage, la garde de caméra et sa visée. Aucune erreur JavaScript ni ressource manquante. [Résultats détaillés](after/validation.json).
- Inspection en lecture seule des circuits sauvegardés : « Mon grand ovale » garde ses 15 modules éditables et produit quatre boucles effectives ; les 15 sélections d'essai restent valides. « L'atelier des loopings » conserve sa boucle. Leurs traversées simulées restent continues, sans modifier les fichiers sources.

## Déploiement et contrôle du tunnel

Le conteneur du jeu a été recréé après vérification qu'aucun salon n'était actif. Les **49 fichiers de données** avaient la même empreinte avant et après ; le conteneur du tunnel est resté en place. Les fichiers JavaScript et CSS publics correspondent à ceux servis localement. [Rapport de déploiement](deployment.json).

Deux contrôles Chromium en lecture seule sur le tunnel passent à **1366 × 768** et **320 × 568**, avec identité de test existante : accueil, grade/MMR, catalogue et choix conservé, sans erreur JavaScript. Ces contrôles ne créent ni compte ni circuit. [Rapport navigateur public](public-browser/validation.json).

La course publique finale sur **Archipel céleste** passe avec **deux clients SDK anonymes**, trois tours chacun, en **125,17 s simulées** : **six passages complets**, sommet inversé et sortie observés, aucun détachement et **2 493 snapshots strictement identiques** entre les deux clients. Commandes normales, aucun reset ni fixture, direction neutre puis droite et gauche sur les trois tours. Catalogue inchangé et aucun profil/MMR modifié ; seul le replay anonyme normal de cette course est ajouté par le jeu (`f3cd1287-e52d-45b5-a4c2-c3e7797dac0a`). Les connexions sont fermées et le serveur revient à zéro salon. [Rapport de course HTTPS/WSS](public-validation.json).

## Limites

- Chromium avec SwiftShader et émulation tactile ; pas de téléphone physique ni Safari iOS.
- Clients distincts sur la même machine ; pas deux machines physiques.
- Les parcours navigateur privés sont ciblés. La course publique SDK est complète sur Archipel céleste ; tous les circuits créatifs possibles ne sont pas couverts.
- Une projection du kart dans l'écran ne prouve pas à elle seule une route lisible : inspection visuelle des captures nécessaire.
