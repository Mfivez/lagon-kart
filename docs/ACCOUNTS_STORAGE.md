# Comptes et sauvegardes de la classe

Les sauvegardes sont dans **`data/players/` sur la machine qui héberge Docker** : profils, comptes, progression et replays. Compose monte ce dossier à `/app/data` dans le conteneur. Un redémarrage, un rebuild, une recréation ou même `docker compose down -v` conservent ce dossier. Un changement de nom de projet Compose le conserve également si `PLAYER_DATA_PATH` désigne le même dossier.

Sous Windows/WSL, avec ce projet sur le Bureau, le chemin par défaut est `C:\Users\bstorm_user\Desktop\project\data\players`. Sur une autre machine, c'est le sous-dossier `data/players` du projet. Ce stockage reste local : supprimer le dossier `data`, perdre le disque ou remplacer les fichiers efface les données. Les archives proposées ci-dessous permettent une copie séparée.

## Se connecter depuis une autre machine

Créer un compte avec un nom d'utilisateur et un mot de passe, puis utiliser **Se connecter** avec les mêmes identifiants sur un autre navigateur ou téléphone. L'identifiant contient 3 à 24 lettres, chiffres, points, tirets ou traits de soulignement ; la casse ne distingue pas deux comptes. Le mot de passe contient 6 à 128 caractères et est stocké sous forme de dérivation salée scrypt, jamais en clair. Les fichiers ne sont pas servis par le serveur web, ne sont pas ajoutés à Git et ne sont pas copiés dans l'image Docker.

La progression appartient au compte hébergé sur ce serveur. Les salons en cours ne sont pas sauvegardés : un reset coupe la course, mais garde les résultats déjà enregistrés. Une ancienne progression d'invité peut être rattachée à un compte en le créant depuis le navigateur qui possède encore son identité locale. Un nom identique ne suffit pas à récupérer un ancien invité si son jeton local a déjà été perdu.

## Premier lancement et dossier personnalisé

```bash
docker compose up --build -d
```

Le service ponctuel `data-init` crée les répertoires et leur attribue l'UID/GID `1000:1000` du processus Node. Le jeu lui-même reste exécuté avec l'utilisateur non-root `node`. Cela évite qu'un dossier neuf créé par Docker appartienne à root sur Linux. Sous WSL/NTFS, les droits affichés dépendent aussi des options du montage Windows.

Pour choisir un autre emplacement, copier `.env.example` en `.env` et définir **un dossier dédié** :

```dotenv
PLAYER_DATA_PATH=./data
# Exemple Windows depuis WSL :
# PLAYER_DATA_PATH=/mnt/c/Users/bstorm_user/Documents/lagon-kart-data
```

Changer ce chemin sélectionne un autre stockage. Copier les anciennes données avant de redémarrer sur un nouveau dossier. Ne jamais choisir la racine du projet ou un dossier partagé avec d'autres applications : `data-init` adapte le propriétaire des fichiers de ce dossier.

## Migration de l'ancien volume nommé

L'ancien volume `lagon-kart_player-data` reste intact après migration. Ne pas exécuter `down -v` avec l'ancien fichier Compose avant d'avoir copié son contenu.

```bash
# Construire sans arrêter le jeu ; attendre la fin d'une course avant la commande stop.
docker compose build app data-init
docker compose stop app
# À faire AVANT le premier up de la nouvelle configuration : cible vide.
npm run data:migrate
docker compose up -d app
```

La migration refuse un volume utilisé par un conteneur en cours et une destination non vide différente. Elle copie le contenu sans écrasement, compare la liste des fichiers et leur SHA-256, puis prépare les droits. Une seconde exécution avec exactement les mêmes fichiers est acceptée. Elle affiche uniquement les nombres de fichiers et d'octets, sans identifiants ni mots de passe. Le volume source est monté en lecture seule et n'est jamais supprimé.

Si le volume porte un autre nom : `node scripts/player-data.mjs migrate --volume NOM_DU_VOLUME`. Le dossier cible provient de `PLAYER_DATA_PATH` dans Compose/`.env`; `--path DOSSIER` permet une migration explicite. Si une migration interrompue a laissé une copie partielle, conserver cette copie et utiliser un nouveau dossier vide avant de recommencer.

## Reset pendant les tests

```bash
npm run data:reset
```

Cette commande reconstruit et recrée uniquement les services du jeu, conserve les fichiers et laisse tourner le tunnel pour garder son URL. Elle refuse de changer silencieusement le stockage d'un conteneur existant. Un simple redémarrage suffit si le code n'a pas changé : `docker compose restart app`.

## Archive locale et restauration

```bash
docker compose stop app
npm run data:backup
docker compose up -d app
```

L'archive complète est écrite dans `backups/players-DATE.tar.gz`, ignoré par Git et Docker. Le script demande que le jeu soit arrêté pour obtenir une copie cohérente. Conserver une copie sur un autre disque si nécessaire. Pour restaurer, arrêter le jeu, garder le dossier actuel de côté, extraire l'archive dans un nouveau dossier vide, configurer `PLAYER_DATA_PATH` vers ce dossier et relancer `docker compose up -d app`. Ne pas mélanger deux registres de joueurs.

## Vérifications reproductibles

```bash
npm run test:storage-migration
npm run test:accounts-persistence
```

Le premier contrôle utilise un volume et un dossier temporaires pour vérifier copie exacte, refus d'une source active, réexécution identique et refus d'écraser une destination divergente. Le second démarre l'image Docker locale sur le port 3105 : inscription HTTP, progression/replay de test enregistrés avec serveur arrêté, `compose down -v`, nouveau nom de projet, connexion sans ancien jeton et comparaison des données. **Cette fixture de progression n'est pas une course réellement jouée.** Les scripts nettoient uniquement leurs ressources temporaires ; ils ne touchent ni au jeu public ni aux sauvegardes de la classe.

Exécuté le 7 octobre 2026 : **8 contrôles de migration réussis**, dont archive extraite à l'identique, vrais liens symboliques refusés et alias WSL `Users/users` et `Desktop/desktop` reconnus sans autoriser une copie depuis un stockage actif. Résultat : [storage-migration-check.json](storage-migration-check.json).

**4 contrôles de comptes/persistance réussis en 13,036 s** sur l'image `sha256:2fac7b59c387f48032b58e31863ed067a822d55536d7af4b793b8c31680f205f`, bundle `index-Dk-_5CP3.js` : inscription HTTP, fixture de 1 victoire/45 XP/replay, suppression des conteneurs via `down -v`, autre projet Compose, connexion sans ancien jeton et déconnexion révoquée. Identité, progression et replay conservés à l'identique ; aucun mot de passe ni jeton brut dans le registre. Les conteneurs et fichiers temporaires ont été supprimés. Résultat : [accounts-persistence.json](accounts-persistence.json).

Ces essais n'ont pas touché aux données de la classe ni au tunnel. Une restauration manuelle d'une archive sur une autre machine reste une vérification distincte.
