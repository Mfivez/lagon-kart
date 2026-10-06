# Validation des fonctionnalités dans le navigateur

Exécution du 6 octobre 2026 : `npm run test:features-browser` (`scripts/features-browser-check.ts`). **11 contrôles réussis**, sans erreur JavaScript ni ressource modèle/audio/asset manquante. Rapport brut : [validation.json](feature-demo/validation.json).

Le script démarre un serveur Colyseus privé à partir du client compilé et un stockage de profils temporaire, puis ouvre deux contextes Chromium indépendants avec SwiftShader. Il nettoie le serveur et le stockage à la fin. Cette exécution couvre le lot de **six circuits** compilé avant l’ajout ultérieur des six circuits à ponts et tremplins.

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
