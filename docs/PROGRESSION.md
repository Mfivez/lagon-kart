# Carrière, classement et sauvegardes

Le serveur conserve les profils dans un répertoire de données local. Aucun
compte externe, abonnement, base de données payante ou API supplémentaire n’est
nécessaire. Cette persistance sert tous les joueurs de la même instance ; les
classements ne sont pas fédérés entre plusieurs serveurs indépendants.

## Identité et données

`PlayerStore.open(directory)` ouvre le registre `players.json` et le dossier
`replays`. Le répertoire doit être monté dans Docker pour survivre au remplacement
du conteneur. Une seule instance de serveur écrit dans un même répertoire : ce
stockage n’est pas une base distribuée multi-processus.

`createPlayer(name)` renvoie une seule fois un jeton opaque aléatoire de 256 bits,
préfixé `lk_`, avec le profil public. Le navigateur conserve ce jeton ; le serveur
ne stocke que son empreinte SHA-256. Les profils, classements, replays et ghosts
ne contiennent aucun jeton ni empreinte. Le jeton autorise l’accès au profil via
les routes authentifiées intégrées par l’application. L’effacer du navigateur
fait perdre cet accès, sans mécanisme OAuth ou récupération par courriel.

Les écritures sont sérialisées, écrites dans un fichier temporaire privé,
synchronisées puis remplacées atomiquement. Une écriture échouée ne modifie pas
le profil en mémoire. Un registre corrompu provoque une erreur et reste conservé
pour récupération ; il n’est jamais effacé silencieusement. Les valeurs et les
tailles sont vérifiées au chargement. La limite par défaut est de 5 000 profils.

## Championnats et garage

| Championnat | Circuits | Niveau requis | Niveau obtenu sur le podium |
| --- | --- | --- | --- |
| Premiers virages | Lagon, Lagon | 0 | 1 |
| Les explorateurs | Lagon, Canyon | 1 | 1 |
| La traversée | Canyon, Glacier, Mangrove | 1 | 2 |
| Au millimètre | Néon, Dunes, Port | 2 | 2 |
| Rien ne reste en place | Forêt, Volcan, Fonderie, Château | 2 | 3 |
| La grande tournée | Néon, Glacier, Mangrove, Dunes, Volcan, Archipel céleste, Fonderie, Château | 3 | 3 |

Le catalogue associe à chaque coupe les notions introduites : drift et objets,
terrains et branches, météo, précision, transformations puis événements
combinés. Le salon applique ces niveaux aux événements réellement disponibles.
Le niveau `careerLevel` de 0 à 3 déverrouille les pièces des six emplacements du
garage ; les récompenses sont fondées sur les championnats terminés et ne peuvent
pas être obtenues en envoyant un niveau depuis le client.

Une coupe est validée lorsque le pilote termine toutes ses manches et arrive
dans les trois premiers au classement final. `completeChampionship` reçoit
exclusivement les résultats du tournoi calculés par le serveur. Chaque coupe
n’accorde sa récompense d’XP et son déblocage qu’une seule fois. Les courses
accordent aussi de l’XP et des statistiques, sans déverrouiller directement les
pièces les plus avancées par simple accumulation de courses.

## Classement et matchmaking

Un nouveau pilote commence à 800 MMR. Les seuils sont Bronze 0, Silver 900,
Gold 1 100, Platinum 1 350, Diamond 1 650, Master 1 950. Le changement utilise les
duels implicites de la course avec un Elo normalisé de coefficient 40 : battre un
adversaire mieux classé rapporte davantage. Tous les calculs emploient les MMR
d’avant la course. Un pilote non arrivé perd face aux arrivés ; deux abandons
sont à égalité. Une course classée exige au moins deux identités humaines
distinctes. Les CPU ne gagnent ni MMR ni progression.

Les saisons suivent les trimestres UTC (`2026-Q4`, etc.). Au début d’une nouvelle
saison, le MMR se rapproche à moitié de 800, les compteurs saisonniers repartent
à zéro et la carrière demeure. Les quatre dernières saisons jouées restent
archivées. Le classement public affiche seulement les pilotes ayant déjà une
course classée dans la saison demandée.

`MatchmakingQueue` regroupe de deux à huit joueurs. La fenêtre commence à 125 MMR
et s’élargit de 20 MMR par seconde jusqu’à 1 200 ; les deux joueurs doivent être
compatibles. Une attente initiale de trois secondes permet de regrouper les
arrivées. Le même profil n’entre qu’une fois dans la file. Les appels de suivi
servent de présence ; une absence de 45 secondes libère la place. La création
d’un salon réussie appelle `assignMatch`, une erreur `releaseMatch`, et une
connexion confirmée `consume`. Le salon contrôle séparément les identités
autorisées : la file ne remplace pas son contrôle d’accès.

## Replays et ghosts

Le `ReplayRecorder` échantillonne les positions autoritaires à 5 Hz, sans rejouer
les entrées du navigateur et sans enregistrer les secrets d’identité. Un fichier
contient au plus huit pilotes, 1 802 points par pilote et 2 Mio. Chaque point est
une petite liste d’entiers : temps en millisecondes, X/Z en centimètres, angle en
milliradians, vitesse en centimètres/seconde, tour et indicateurs d’effets. Ces
indicateurs codent turbo, étoile, bouclier, étourdissement et arrivée.

Ce format constitue une trace visuelle de la course ; il ne prétend pas permettre
une resimulation exacte de tous les objets et collisions. Un ghost ne participe
pas aux collisions ni au classement de la course observée.

La rétention conserve au maximum 40 fichiers par défaut (configurable entre 16 et
100). Elle donne priorité aux meilleurs ghosts classés de chaque circuit, puis
aux records ouverts et enfin aux courses récentes. Le plafond reste strict même
si les douze circuits produisent davantage de records distincts que de places
disponibles : dans ce cas, certains anciens records ouverts sont supprimés. Les
index sont atomiques et les noms ne permettent pas de
sortir du dossier des replays. Les résultats de course sont idempotents : un
identifiant de manche ne compte qu’une fois. Le registre conserve 20 000 reçus et
refuse les résultats antérieurs au seuil de rétention ; une clôture reçue avec
plus de 24 heures de retard est également rejetée.

## Tests exécutés

`node --import tsx --test tests/laps.test.ts tests/progression.test.ts tests/simulation.test.ts` :
**57 tests réussis**, dont **13 tests de progression et persistance**.
Les tests couvrent les récompenses répétées, verrous, concurrence, redémarrage,
confidentialité des jetons, idempotence des résultats, MMR, saisons, matchmaking,
expiration, traces quantisées, ghosts, rétention, fichier corrompu et échec
d’écriture, y compris 24 records concurrents sur douze pistes avec un plafond de
16 fichiers et une réouverture du registre.

`node --import tsx --test tests/career-server.test.ts` : **7 tests réussis** sur
un serveur privé et un répertoire temporaire. Ils vérifient les vrais échanges
HTTP et Colyseus : identité, données forgées, verrous du garage et des coupes,
réservations classées, annulation, lancement après arrivée de tous les inscrits,
équipes et persistance. Les arrivées accélérées dans ces fixtures servent à
tester les récompenses ; elles ne constituent pas une preuve de course conduite.
Les vérifications navigateur et Docker restent distinctes et figurent dans le
rapport de livraison principal.
