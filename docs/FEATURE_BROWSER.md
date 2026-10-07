# Validation des fonctionnalités dans le navigateur

Le dernier parcours du 6 octobre 2026, sur le catalogue de **douze circuits**, a réussi **11/11 contrôles**, sans erreur JavaScript ni ressource modèle/audio/asset manquante. Commande : `npm run test:features-browser` (`scripts/features-browser-check.ts`). [Rapport actuel](feature-demo-12/validation.json). Une première exécution sur les six pistes initiales avait également réussi 11/11 contrôles ; ses preuves restent conservées dans [le rapport initial](feature-demo/validation.json).

Le script démarre un serveur Colyseus privé à partir du client compilé et un stockage de profils temporaire, puis ouvre deux contextes Chromium indépendants avec SwiftShader. Il nettoie le serveur et le stockage à la fin. Les mesures et captures détaillées dans la première partie concernent le lot initial de six pistes ; la dernière section décrit la répétition complète avec douze pistes.

## Vérifications exécutées

- Les six cartes de circuits sont sélectionnables, ainsi que huit couleurs.
- Le garage expose trois modèles importés, cinq personnages, six catégories de pièces et douze pièces verrouillées au niveau zéro. Les deux joueurs choisissent des identités différentes.
- Les deux contextes rejoignent le même salon ; chaque client reçoit et rend le modèle et le personnage de l’autre. Une modification dans le garage se propage au salon.
- Après rechargement, la place, le profil, le modèle, le personnage et les préférences du garage sont conservés. Le transfert de l’hôte à l’autre client pendant cette déconnexion est respecté par le test.
- L’hôte configure les CPU, le mode quatre contre quatre (deux humains et six CPU), deux manches et les événements de niveau trois. Ces contrôles restent réservés à l’hôte.
- Les deux humains avancent réellement avec la touche `ArrowUp` envoyée à leurs pages : déplacements autoritaires mesurés de **4,00 m** et **4,37 m**, vitesses de **11,03 m/s** et **12,96 m/s**. Le script ne déplace pas leurs positions pour ce contrôle.
- L’interface de résultats par équipes et le passage à la manche suivante conservent les modèles/personnages et enregistrent les courses.
- La coupe découverte est démarrée via l’interface ; son achèvement ouvre le niveau un, les nouvelles coupes et les pneus tout-terrain. Le choix de pneus persiste après rechargement.
- Les six coupes et les paliers zéro à trois affichent les accès attendus et conservent leur progression.
- Un replay enregistré par le serveur est lu, mis en pause et parcouru avec le curseur.

## Limites et mises en scène explicites

Les deux manches du tournoi et les deux manches de découverte ont des **arrivées imposées dans le serveur privé**, après un départ normal et des échantillons de mouvement. Le script n’a pas conduit ces courses complètes. Les cinq coupes supérieures sont validées directement dans le stockage temporaire pour contrôler les menus de progression ; elles n’ont pas été parcourues. Les temps très courts du rapport appartiennent à ces fixtures et ne sont pas des performances de course.

Il s’agit de deux contextes sur la même machine, pas d’une connexion entre deux machines physiques ni d’une vérification du tunnel public. La conduite humaine complète des nouvelles pistes, le ressenti musical et la fluidité sur les ordinateurs des collègues restent des essais distincts. Ce test ne constitue pas une mesure de performance GPU.

## Captures

| Écran | Capture |
| --- | --- |
| Accueil et six circuits | [Accueil](feature-demo/home-six-tracks.png) |
| Garage au niveau zéro | [Garage](feature-demo/garage-level-zero.png) |
| Deux identités visibles | [Salon](feature-demo/lobby-two-humans.png) |
| Deux équipes de quatre | [Équipes](feature-demo/teams-eight-pilots.png) |
| Déplacement clavier réel | [Course](feature-demo/race-keyboard-two-humans.png) |
| Résultats imposés pour tester l’interface | [Résultats](feature-demo/team-results-staged.png) |
| Six coupes au niveau zéro | [Championnat](feature-demo/career-six-cups-level-zero.png) |
| Pièces déverrouillées au niveau un | [Garage débloqué](feature-demo/garage-level-one-unlocked.png) |
| Paliers supérieurs simulés | [Progression](feature-demo/career-level-three-staged.png) |
| Lecture d’un replay de test | [Replay](feature-demo/replay-private-race.png) |


## Deuxième exécution : catalogue à douze circuits

Le même parcours a ensuite été exécuté sur le client compilé `index-CU-Fug6i.js`, avec les douze cartes de circuits et les programmes de championnat étendus : **11/11 contrôles réussis**. Rapport : [validation du lot douze pistes](feature-demo-12/validation.json). Captures : [accueil](feature-demo-12/home-12-tracks.png), [garage et aperçu du personnage](feature-demo-12/garage-level-zero.png), [deux joueurs](feature-demo-12/lobby-two-humans.png), [équipes](feature-demo-12/teams-eight-pilots.png), [conduite réelle](feature-demo-12/race-keyboard-two-humans.png), [résultats imposés](feature-demo-12/team-results-staged.png), [niveau zéro](feature-demo-12/career-six-cups-level-zero.png), [garage déverrouillé](feature-demo-12/garage-level-one-unlocked.png), [progression simulée](feature-demo-12/career-level-three-staged.png), [replay](feature-demo-12/replay-private-race.png).

Le harnais attend désormais `DOMContentLoaded` puis l’état applicatif de connexion, et recherche l’hôte courant avant de passer à la manche suivante. Les premières tentatives avaient échoué sur une attente globale de chargement trop courte puis sur un bouton réservé à un hôte qui avait changé ; les diagnostics confirmaient les connexions et profils restaurés. Ces erreurs de ciblage du test ont été corrigées, puis tout le parcours a été relancé avec succès.

Les arrivées et paliers supérieurs restent les mêmes fixtures explicites que dans le premier lot. Le « joueur hôte » dans le texte des fixtures désigne le créateur initial, choisi gagnant pour le contrôle de progression ; l’autorité réseau peut avoir été transférée au second contexte. Ce deuxième passage n’inclut pas les corrections visuelles ultérieures de cadrage/profondeur et de panneau de circuits : elles font l’objet des captures de décor et du [contrôle de mise en page](home-layout/validation.json).
