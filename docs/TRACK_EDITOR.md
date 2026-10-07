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
   le sens de circulation et signale les virages trop serrés ou les croisements.
4. Donner un nom, choisir l’un des dix thèmes et régler la largeur de la route.
   Les zones turbo, glace et boue sont facultatives ; leur position est exprimée
   en pourcentage du tour. Les décors du thème sont générés autour de la piste.
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

- Boucle lissée à 6–32 points, route de 14–28 m, longueur de 400–2 400 m.
- Dix thèmes et jusqu’à douze zones turbo/glace/boue ; objets mystères et bots
  restent ceux du jeu normal.
- Checkpoints, grille et bordures calculés automatiquement. Validation du même
  tracé côté éditeur et côté serveur, avec erreurs en français.
- Les créations sont des routes au sol : l’atelier ne dessine pas encore de pont,
  tremplin, looping ou déviation. Les événements automatiques de fermeture sont
  désactivés sur ces tracés ; ceux des circuits officiels sont conservés.

## Vérifications

La suite de tests et les vérifications spécifiques couvrent la géométrie,
la sauvegarde, la propriété, les conflits, les versions de course et les
checkpoints. Les résultats exécutés, captures et limites du parcours navigateur
sont consignés dans [VALIDATION.md](../VALIDATION.md).

Captures inspectées : [éditeur sur ordinateur](editor/editor-desktop.png),
[éditeur sur mobile 320 px](editor/editor-mobile-320.png) et
[circuit forêt en jeu](editor/editor-trial-forest.png).
