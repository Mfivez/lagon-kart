# Tournois interrompus après deux courses

Correctif du 7 octobre 2026.

## Cause reproduite

Le formulaire permettait de choisir huit courses sans les appliquer immédiatement.
Activer ensuite les équipes envoyait uniquement ce changement au serveur. Comme
le serveur avait encore une course simple, il préparait son tournoi par défaut de
deux courses. Le prochain instantané écrasait alors le programme de huit courses
encore présent dans le formulaire. Modifier les CPU ou les événements pouvait
aussi effacer le programme choisi.

Le moteur de tournoi n’avait pas de plafond de deux courses : une fois un
programme de quatre courses correctement appliqué, les quatre courses se
terminent normalement. Les courses classées gardent leur format existant.

Reproduction avant correction : [rapport](configuration-before.json) et
[capture](configuration-before.png).

## Comportement corrigé

- Les choix de circuits et de durée restent dans le formulaire après modification
  des équipes, des CPU ou des événements.
- Un message distingue le programme choisi de celui actuellement appliqué.
- L’hôte doit appliquer ses modifications avant de se déclarer prêt ou de lancer
  le départ. Les gestionnaires des boutons vérifient également cette condition.
- La confirmation du serveur lève ce blocage. Revenir au programme déjà appliqué
  le lève aussi ; un nouveau salon ne reprend pas le brouillon du précédent.
- La simulation, le comptage des tours et la progression des manches restent
  inchangés.

## Vérifications exécutées

`node --import tsx --test --test-concurrency=1 tests/tournament.test.ts tests/tournament-continuation.test.ts` :
**9/9 tests réussis**. Le nouveau test de transport vérifie quatre manches
manuelles puis huit manches aléatoires parmi seulement deux circuits, avec
points, nouveaux départs, séquences de commandes et refus d’une manche de trop.
Ses décomptes et arrivées sont des fixtures privées raccourcies.

`BASE_URL=http://127.0.0.1:3012 CLIENTS=2 npm run test:tournament` :
**quatre courses complètes**, deux clients Colyseus et trois tours par course,
en **300,428 secondes**. Commandes ordinaires, sans imposer de position ni
d’arrivée ; reconnexion en deuxième manche, passages aux troisième et quatrième,
points, podium et revanche vérifiés. Ce contrôle du serveur inchangé ne prouve
pas à lui seul le correctif du formulaire.
[Rapport réseau](network-four-races.json).

`npm run test:tournament-configuration` : **8 contrôles Chromium réussis** sur
le client corrigé `index-D1bdMCxt.js`, sans erreur JavaScript. Deux navigateurs
indépendants vérifient le brouillon de huit courses après CPU/événements/équipes,
le blocage des boutons et de leurs gestionnaires, la publication du programme,
le passage de huit à quatre, un changement de circuit à nombre égal, le pool
aléatoire et un nouveau salon débarrassé de l’ancien brouillon. Ce scénario
de configuration ne force ni position ni arrivée et ne termine aucune course.
[Rapport](configuration-after.json) · [Huit courses appliquées](configuration-eight-applied.png).

`npm run test:browser-tournament` : **15 contrôles réussis** dans deux navigateurs,
avec deux humains et six CPU. Les huit départs et déplacements clavier utilisent
les commandes normales ; les arrivées et chronos sont imposés sur le serveur
privé pour vérifier les transitions, notamment **2 → 3**, jusqu’au podium **8/8**.
Scores, revanche, tirage de huit courses parmi deux circuits, et sauvegarde puis
relecture des huit replays synthétiques passent. Aucune erreur JavaScript,
d’asset ou de sauvegarde dans cette exécution finale. Ces fixtures ne prouvent
pas huit courses intégralement conduites.
[Rapport](browser-transitions.json) · [Après la deuxième course](after-race-two-next-course.png) ·
[Podium de huit courses](podium-eight-races.png).

Les données des contrôles privés sont isolées dans `/tmp`. Les rapports de ce
dossier distinguent les véritables courses et les arrivées synthétiques utilisées
pour vérifier rapidement toutes les transitions de l’interface.

Le build hôte, TypeScript et Docker passent. L’application déployée sert
`index-D1bdMCxt.js` / `index-Jqpo2WEV.css`, identiques au build par SHA-256.
Sa recréation conserve les **22 fichiers de données**, les **29 profils** présents
à cet instant et le circuit personnalisé publié. Le tunnel conserve son
conteneur, son heure de démarrage et son URL. [Déploiement](deployment.json).

Le contrôle Chromium public réussit également : **4 contrôles**, brouillon de
huit courses conservé après les trois réglages, blocage avant application,
programme de huit reçu par le serveur et vrai départ **course 1/8** avec sept CPU.
Le kart parcourt **34,13 m** avec les touches ordinaires ; aucune erreur JavaScript
ni réponse d’asset en échec, zéro salon avant/après. Aucune arrivée imposée et
aucune course publique complète dans ce scénario.
[Rapport public](public.json) · [Départ public](public-race-start.png).
