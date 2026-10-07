# Atelier des circuits

L’atelier crée de vrais circuits utilisables en entraînement, en salon multijoueur
et en tournoi, avec la simulation et les collisions habituelles. Aucun asset,
abonnement, service externe ou dépendance supplémentaire : **0 €**.

## Dessiner et essayer

1. À l’accueil, choisir **Créer un circuit**. Le profil invité suffit ; un compte
   permet de retrouver la propriété des créations depuis un autre navigateur.
2. Partir du **Grand ovale** ou des **Courbes des bois**, puis faire glisser les
   points blancs. **Ajouter un point** insère un virage ; **Annuler/Rétablir**
   aide à expérimenter. **Tout voir** recadre le plan.
3. Choisir un point puis **Départ ici** pour déplacer la ligne. Le plan indique
   le sens de circulation. Virages serrés, points collés et croisements sont autorisés.
4. Donner un nom, choisir l’un des dix thèmes et régler la largeur de la route.
   Les zones turbo, glace et boue sont facultatives ; leur position est exprimée
   en pourcentage du tour. Les décors du thème sont générés autour de la piste.
   Ouvrir les sections **Durée**, **Reliefs et loopings** et **Événements** pour
   personnaliser aussi le nombre de tours et le déroulement de la course.
5. **Sauvegarder** publie le circuit pour la classe. **Sauvegarder et essayer**
   ouvre un entraînement réel. **Retour à l’éditeur** ramène au même brouillon.
6. Pour jouer ensemble, quitter l’atelier, sélectionner la création à l’accueil
   et créer un salon. Les autres joueurs utilisent son lien habituel. Dans le
   salon, l’hôte peut aussi mélanger créations et circuits officiels en tournoi.
   **Actualiser les circuits** charge les dernières publications des collègues.

Le brouillon reste local à ce navigateur et à ce profil, même après rechargement.
Seule la sauvegarde serveur rend un circuit visible aux autres. Fermer ou
remplacer un brouillon modifié affiche un choix explicite. Les commandes du
plan fonctionnent au pointeur, au tactile et au clavier : tabulation, flèches,
Maj pour affiner, Ctrl/Cmd+Z et Ctrl/Cmd+S.

Un auteur peut modifier ses propres créations. **Dupliquer** ouvre une copie
de la création d’un autre joueur. Deux onglets qui modifient la même version
ne s’écrasent pas : le second reçoit un message invitant à recharger.

## Tours, ponts, tremplins et loopings

Le nombre de tours se règle de **1 à 20** et suit le circuit en entraînement,
salon et tournoi. L’accueil et le compteur en course affichent cette valeur.
Les anciens circuits personnalisés restent à trois tours tant qu’ils ne sont
pas modifiés. Les replays et la limite de durée suivent les courses plus longues.

Dans la section des reliefs, **Ajouter un pont**, **Ajouter un tremplin** ou
**Ajouter un looping** place un module avec des réglages initiaux. Sa position
et sa longueur sont exprimées en pourcentage du tracé. Les hauteurs, rampes et
écartements sont en mètres. Le tremplin possède aussi une impulsion de saut.
Le plan marque les modules ; le bouton de suppression et Annuler/Rétablir
permettent d’expérimenter. Jusqu’à 16 ponts/tremplins et 16 loopings sont conservés.

Les loopings utilisent la piste magnétique du jeu : le kart suit réellement
la boucle en trois dimensions. Ponts et tremplins reprennent la hauteur et les
sauts de la simulation serveur. Des modules superposés ou un tracé extrême
peuvent être difficiles à parcourir : **Sauvegarder et essayer** sert à ajuster
le résultat. Le niveau de détail visuel est plafonné pour les très longs modules,
sans réduire leurs dimensions ni modifier leur physique.

## Programmer les événements

Chaque événement indique un **numéro de tour**, un type et une portion du tracé.
Il s’active quand le premier pilote atteint ce tour et dure jusqu’au tour suivant
de ce pilote. Tous les joueurs voient le même état, même s’ils ont du retard.

| Choix | Effet pendant le tour choisi |
| --- | --- |
| Pluie, cendres, tempête | Météo visible et portion boueuse qui ralentit |
| Neige | Météo visible et portion de verglas |
| Turbo temporaire | Bande d’accélération sur la portion choisie |
| Glace ou boue temporaire | Adhérence ou vitesse modifiée sur cette portion |
| Éclaircie | Météo claire |

On peut programmer jusqu’à 64 événements, y compris après le troisième tour.
Les surfaces actives apparaissent sur la route, également dans les loopings.
Si plusieurs surfaces temporaires se chevauchent, la première de la liste prime ;
pour plusieurs choix météo au même tour, le dernier donne l’ambiance visible.
Un numéro de tour au-delà de la durée choisie doit être corrigé avant publication.

## Sauvegardes et compatibilité

Le montage Docker existant de `data/` contient désormais :

```text
data/
  players/                         comptes, progression et replays
  tracks/custom-…-v1.json          première version d’un circuit
  tracks/custom-…-v2.json          version suivante du même circuit
```

Une modification ajoute un fichier sans écraser les précédents. Le serveur
charge toutes les versions au démarrage ; le catalogue propose la plus récente.
Le salon fixe sa version au moment du choix du circuit. Une publication pendant
une course ne déplace donc ni sa route, ni ses checkpoints, ni les autres joueurs.
Les définitions sont transmises aux clients qui rejoignent ou se reconnectent,
puis ne sont plus répétées une fois reçues.

Le dossier hôte survit à la recréation des conteneurs et à `docker compose down -v`.
`npm run data:backup` archive déjà tout `data/`, circuits compris. Ne pas supprimer
manuellement ce dossier pour réinitialiser Docker. `CUSTOM_TRACK_DATA_DIR` permet
un emplacement explicite hors configuration standard ; sinon il est voisin de
`PLAYER_DATA_DIR` lorsque ce dernier se termine par `players`.

Une sauvegarde corrompue est conservée et ignorée, sans bloquer les autres
circuits. Les références historiques à un circuit manquant ne rendent pas les
comptes illisibles. Les fichiers de sauvegarde restent exclus de Git.

## Ce que l’atelier autorise

- Boucle lissée à 3–128 points, route de 4–80 m, dessin jusqu’à 2 000 m autour
  du centre. La longueur n’est plus limitée à 400–2 400 m.
- Points voisins ou exactement superposés, épingles, croisements et portions
  de route superposées ne bloquent plus la sauvegarde. Le zoom permet de les affiner.
- Dix thèmes et jusqu’à 64 zones turbo/glace/boue ; objets mystères et bots
  restent ceux du jeu normal.
- Les zones peuvent occuper tout le tour et se superposer ; la première de la
  liste a priorité, comme dans la simulation.
- Checkpoints, grille et bordures calculés automatiquement. Validation du même
  tracé côté éditeur et côté serveur, avec erreurs en français.
- Ponts, tremplins, loopings et événements par tour sont configurables. Les
  bifurcations et barrages automatiques des circuits officiels ne sont pas
  générés sur les créations ; l’atelier ne dessine pas encore de route alternative.

Les contrôles restants assurent que les données sont lisibles et la route non
nulle : tous les points confondus sont refusés, mais plusieurs points collés
sur une boucle sont acceptés. Les anciennes versions conservent exactement
leur géométrie. Une création très serrée ou croisée peut être difficile à
parcourir, notamment pour les CPU ; l’atelier vous laisse l’essayer et l’ajuster.

## Vérifications

La suite de tests et les vérifications spécifiques couvrent la géométrie,
la sauvegarde, la propriété, les conflits, les versions de course et les
checkpoints. Les résultats exécutés, captures et limites du parcours navigateur
sont consignés dans [VALIDATION.md](../VALIDATION.md).

Captures inspectées : [éditeur sur ordinateur](editor/editor-desktop.png),
[éditeur sur mobile 320 px](editor/editor-mobile-320.png) et
[circuit forêt en jeu](editor/editor-trial-forest.png).

L’assouplissement des tracés possède ses propres preuves :
[6 contrôles navigateur](creative-tracks/browser-validation.json),
[points collés publiés](creative-tracks/editor-creative-curve.png) et
[duplication à 320 px](creative-tracks/editor-mobile-320.png). La sauvegarde
des points collés est relue via l’API ; après annulation, une version suivante
est essayée en jeu. Ce parcours vérifie le déplacement, pas une course complète.
