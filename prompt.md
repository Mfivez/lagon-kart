Tu es un développeur senior spécialisé dans les jeux navigateur, le multijoueur temps réel et Docker.

Construis directement dans le projet un jeu de kart 3D arcade inspiré de Mario Kart, jouable entre amis dans leur navigateur. Le serveur doit fonctionner sur mon ordinateur avec Docker, et les autres joueurs doivent pouvoir rejoindre une partie via une URL publique fournie par un tunnel web.

Tu as carte blanche sur les choix techniques secondaires, le nom, les circuits et la direction artistique. Prends les décisions courantes toi-même et avance jusqu’à une version jouable et vérifiée.

## 1. Résultat attendu

Je veux pouvoir :

1. Récupérer le projet et lancer une commande Docker Compose.
2. Ouvrir le jeu dans mon navigateur.
3. Activer un tunnel avec une commande.
4. Copier l’URL publique et l’envoyer à mes amis.
5. Créer un salon, choisir un pseudo et une couleur de kart.
6. Faire une course complète ensemble, avec drift, objets, classement et revanche.

L’installation sur mon ordinateur doit seulement nécessiter Docker avec Compose. Mes amis doivent uniquement avoir besoin d’un navigateur.

Le jeu doit fonctionner localement sans hébergement applicatif externe. Le tunnel est le seul intermédiaire nécessaire pour rendre la partie accessible depuis Internet.

Cible initiale : 2 à 8 joueurs par salon. Prévois plusieurs salons indépendants sur un même serveur, avec des limites configurables. Documente la capacité réellement testée.

## 2. Réutilise les bonnes briques

Commence par inspecter le projet existant, puis fais un audit rapide des bibliothèques, exemples et assets qui peuvent accélérer la réalisation.

Références à examiner :

- Démonstrateur de course : https://github.com/colyseus/react-racing-game
- Framework multijoueur et documentation : https://docs.colyseus.io/
- Prédiction et synchronisation : https://docs.colyseus.io/netcode
- Véhicules et karts : https://kenney.nl/assets/car-kit
- Éléments de circuit : https://kenney.nl/assets/racing-kit
- Tunnel : https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

Réutilise le code, les modèles, les sons et les composants pertinents après vérification des licences et des dépendances.

Pour le démonstrateur de course, vérifie particulièrement comment les déplacements sont calculés et validés. Complète les mécanismes nécessaires pour obtenir une simulation serveur fiable.

Choisis entre adapter une base existante et assembler des bibliothèques éprouvées selon le travail réellement économisé. Limite cette comparaison à quelques candidats, puis implémente.

Conserve les notices nécessaires dans un fichier THIRD_PARTY_NOTICES.md. Utilise une identité visuelle originale et des assets dont la réutilisation est autorisée.

Tous les assets nécessaires à la partie doivent être inclus dans le projet et servis par l’application. Évite les dépendances à des CDN pendant le jeu.

## 3. Architecture recommandée

Pars sur :

- TypeScript.
- Vite et Three.js pour le client.
- React Three Fiber si la base réutilisée le justifie.
- Node.js et Colyseus pour les salons, les sessions et le réseau.
- Une logique de conduite et des types partagés entre client et serveur.
- Un processus serveur unique pour la première version.
- Un service Docker `app` et un service optionnel `tunnel`.

Choisis des versions stables, publiées et compatibles. Vérifie les API dans la documentation correspondant aux versions installées. Fournis le lockfile et un build reproductible.

Réutilise les fonctions de synchronisation, de reconnexion et de prédiction du framework lorsqu’elles conviennent. Garde la logique spécifique au jeu dans des modules séparés : conduite, circuit, progression, objets et règles de course.

Une conduite arcade simplifiée avec rendu 3D convient très bien. Si un moteur physique existant apporte un avantage concret, utilise-le ; privilégie la maniabilité et la cohérence réseau.

L’application doit fonctionner avec son état de partie en mémoire. Une base de données ou un service supplémentaire doit répondre à un besoin démontré.

## 4. Une seule origine pour tout faire fonctionner derrière le tunnel

Le serveur Node doit servir sur un même port :

- Le client compilé.
- Les assets.
- Les routes HTTP de matchmaking.
- Les connexions WebSocket de Colyseus.
- Une route `/healthz`.

Le client doit calculer ses adresses réseau à partir de `window.location`.

Exigences :

- En accès HTTPS, les connexions de jeu utilisent WSS.
- En accès HTTP local, elles utilisent WS.
- Le matchmaking et la reconnexion restent sur la même origine publique.
- Aucune adresse `localhost`, IP privée ou adresse Docker ne doit être envoyée aux navigateurs distants.
- Aucune URL temporaire de tunnel ne doit être inscrite dans le bundle.
- Vérifie les éventuelles adresses annoncées dans les réponses de réservation Colyseus.
- Les chemins utilisés par Colyseus doivent rester accessibles intégralement.
- Un lien direct vers un salon doit fonctionner après actualisation de la page.
- Un changement d’URL du tunnel doit fonctionner sans reconstruction de l’application.

Utilise le client compilé dans le conteneur destiné aux parties. Prévois séparément une commande de développement avec rechargement automatique.

## 5. Docker et tunnel prêts à l’emploi

Fournis :

- Un Dockerfile avec plusieurs étapes de construction.
- Un fichier `compose.yaml`.
- Un `.dockerignore`.
- Un `.env.example` avec des valeurs par défaut utilisables.
- Un contrôle de santé fonctionnel.
- Des commandes de lancement, de consultation des logs et d’arrêt.
- Un README en français.

Le service `app` doit écouter sur `0.0.0.0:3000` à l’intérieur du conteneur. Publie par défaut ce port sur `127.0.0.1:3000` côté ordinateur, avec un port hôte configurable.

Le service `tunnel` doit :

- Utiliser l’image officielle de cloudflared avec une version explicitement choisie.
- Être activé par le profil Compose `tunnel`.
- Attendre que l’application soit prête.
- Ouvrir un Quick Tunnel vers `http://app:3000`.
- Afficher l’URL publique dans ses logs.
- Fonctionner sans compte Cloudflare ni nom de domaine.
- Être arrêtable indépendamment du jeu.

Fais fonctionner ces commandes :

```bash
# Démarrer le jeu en local
docker compose up --build -d

# Démarrer le jeu avec le tunnel
docker compose --profile tunnel up --build -d

# Afficher les logs contenant l’URL publique
docker compose logs -f tunnel

# Couper seulement l’accès public
docker compose stop tunnel

# Tout arrêter
docker compose --profile tunnel down
```

Ajoute si utile un petit script pour afficher clairement l’URL publique, tout en conservant les commandes Docker comme méthode principale.

Documente le fonctionnement sur Windows avec Docker Desktop, macOS et Linux.

Explique que l’ordinateur doit rester allumé, que le tunnel doit rester actif, que son URL est temporaire et que sa disponibilité dépend du service de tunnel. Documente ses limites sans les présenter comme une capacité garantie en nombre de joueurs.

## 6. Contenu de la première version

### Course et conduite

Livre au minimum :

- Un circuit complet de trois tours.
- Une caméra de poursuite agréable.
- Une accélération, un freinage et une direction faciles à prendre en main.
- Un drift avec effet visuel et mini-turbo.
- Des collisions avec les limites du circuit et entre karts.
- Un ralentissement hors piste.
- Une remise en piste au dernier point valide.
- Des checkpoints ordonnés pour valider les tours.
- Un compte à rebours synchronisé.
- Un classement pendant la course et un résultat final commun à tous.

Prévois un mode entraînement permettant de rouler seul.

### Objets

Ajoute trois objets simples et opérationnels :

- Un turbo temporaire.
- Un piège déposé sur la piste.
- Un projectile lancé vers l’avant.

Les objets doivent pouvoir être récupérés, utilisés et subir une expiration ou une disparition cohérente pour tous les joueurs.

Le serveur décide de leur attribution, de leur activation et de leurs effets.

### Salon

Prévois :

- Création et accès par code ou lien.
- Pseudo et couleur de kart.
- Liste des participants et état « prêt ».
- Bouton de lancement pour le créateur du salon.
- Transfert de ce rôle s’il quitte la partie.
- Attente de la prochaine course pour les nouveaux arrivants pendant une manche.
- Bouton de revanche.
- Messages compréhensibles pour les salons pleins, inexistants ou expirés.

### Présentation

Choisis une direction artistique low poly colorée et cohérente.

L’interface doit être en français et afficher :

- Position et nombre de participants.
- Tour en cours.
- Vitesse.
- Objet disponible.
- Mini-carte.
- État de connexion.
- Commandes.
- Réglage du volume.

Prends en charge les flèches ainsi que ZQSD et WASD. Prévois des touches simples pour le drift, l’objet et la remise en piste.

Priorise les navigateurs d’ordinateur. Ajoute les commandes tactiles ou la manette après validation du parcours principal, si cela reste raisonnable.

## 7. Multijoueur fiable et agréable

Le serveur doit être l’autorité sur la partie.

Les clients envoient leurs commandes de conduite. Le serveur calcule ou valide les déplacements, collisions, checkpoints, tours, objets et résultats.

Un client ne doit pas pouvoir imposer directement une position, une vitesse, un tour terminé ou une victoire.

Implémente :

- Une simulation à pas de temps fixe.
- Une fréquence initiale de simulation de 30 Hz et des mises à jour réseau autour de 20 Hz, configurables et ajustables après mesure.
- Une prédiction locale pour rendre la conduite réactive.
- Une réconciliation avec l’état serveur.
- Une interpolation des autres karts.
- Une boucle de rendu indépendante de la fréquence réseau.
- Des commandes numérotées et validées.
- Une limite raisonnable de taille et de fréquence des messages.

Réutilise les mécanismes éprouvés du framework. Vise un rendu fluide, autour de 60 images par seconde sur une machine courante, et rapporte les mesures disponibles.

Prévois une fenêtre de reconnexion d’environ 30 secondes :

- Conserve temporairement le joueur et sa progression.
- Affiche la coupure et la tentative de reprise.
- Neutralise les commandes pendant la déconnexion.
- Évite les doublons de joueur.
- Gère la reprise après actualisation avec le mécanisme prévu par Colyseus.
- Actualise le jeton de reconnexion et conserve-le par onglet.
- Rejette les anciennes commandes devenues périmées.
- Empêche leur rejeu en rafale après la reprise.

Remets également les commandes à zéro lorsque la fenêtre perd le focus. Une touche relâchée hors de la fenêtre ne doit pas laisser le kart accélérer indéfiniment.

Définis un comportement clair pour les abandons et une fin de course qui ne reste pas bloquée par un joueur inactif. Nettoie les salons vides et réinitialise correctement les manches.

## 8. Organisation du travail

Avance par étapes vérifiables :

1. Audit rapide des ressources et choix de la base.
2. Docker fonctionnel et connexion de deux clients au même salon.
3. Circuit et conduite synchronisée.
4. Course complète, checkpoints et classement.
5. Drift, objets et présentation.
6. Reconnexion et cas limites.
7. Validation via le tunnel et documentation.

Pour chaque étape, donne un bref état de ce qui fonctionne et de ce qu’il reste à résoudre.

Priorité : permettre à deux personnes de terminer ensemble une course, puis stabiliser huit participants, puis améliorer les effets et les fonctionnalités secondaires.

Travaille dans les fichiers du projet jusqu’à obtenir le résultat. Respecte les conventions existantes lorsque le dépôt contient déjà du code.

## 9. Vérification obligatoire

Exécute les vérifications possibles et corrige les erreurs rencontrées.

Vérifie au minimum :

1. Construction et démarrage depuis Docker.
2. Chargement du client et de ses assets.
3. Deux sessions navigateur indépendantes dans le même salon.
4. Déplacements visibles et cohérents entre les deux sessions.
5. Course complète avec un classement final identique.
6. Utilisation d’objets et effets partagés.
7. Reconnexion sans doublon ni perte injustifiée de progression.
8. Refus des commandes invalides et des faux résultats.
9. Actualisation d’un lien direct vers un salon.
10. Nouvelle manche correctement réinitialisée.
11. Test réseau avec huit clients, en précisant s’il s’agit de clients simulés ou de navigateurs.
12. Connexion via l’URL publique : assets HTTPS, matchmaking et WebSocket WSS.
13. Nouvelle URL de tunnel utilisable sans reconstruire le client.

Ajoute des tests ciblés pour les checkpoints, le comptage des tours, les objets et les transitions de course.

Teste si possible avec une latence simulée de 100 à 150 ms pour repérer les mouvements saccadés et les corrections excessives.

Pour valider le tunnel, vérifie une vraie session multijoueur au-delà du simple chargement de la page d’accueil.

Si Docker, le navigateur ou le tunnel ne peuvent pas être exécutés dans ton environnement, indique exactement ce qui reste non testé et fournis la procédure de vérification correspondante.

## 10. Livraison

À la fin, fournis :

- Le projet complet.
- Les commandes exactes pour démarrer et arrêter.
- L’adresse locale.
- La méthode pour récupérer et partager l’URL publique.
- La procédure pour créer et rejoindre une partie.
- Les commandes de jeu.
- Les ressources réutilisées et leurs licences.
- Un récapitulatif des tests exécutés.
- Les limites connues et les éventuelles étapes non vérifiées.

Le README doit permettre à une personne qui connaît peu Docker de lancer une partie entre amis.

Commence maintenant par l’inspection du projet et le choix des briques réutilisables, puis passe à l’implémentation.