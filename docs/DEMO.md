# Démo intégrée — karts, objets et musique

Version vérifiée le **6 octobre 2026**, construite à partir du projet existant.
Budget : **0 €**, sans asset payant, abonnement, API IA payante ou nouvelle dépendance npm.

## Ouvrir et partager

- **Démo publique : https://cube-dense-operator-dont.trycloudflare.com**
- Local : http://localhost:3103
- Projet Docker : `lagon-kart-play`.

Ouvrir l'adresse publique, créer un salon et partager son lien avec les collègues.
Le tunnel est temporaire : l'ordinateur, Docker et cloudflared doivent rester actifs.
Un redémarrage du tunnel peut changer l'adresse. Le salon de la version visuelle
précédente sur le port 3102 a été conservé pendant l'intégration.

```bash
HOST_PORT=3103 docker compose -p lagon-kart-play --profile tunnel ps
docker compose -p lagon-kart-play logs -f tunnel

# Reconstruction ultérieure, après la fin des parties actives
HOST_PORT=3103 docker compose -p lagon-kart-play up --build --no-deps -d app
```

La compilation servie contient `index-BcLJLuu2.js` et `index-BwIgMnGH.css`.
Le client et les MP3 ont été copiés depuis l'image Docker reconstruite, index publié
en dernier, sans redémarrage du serveur ni changement du tunnel.
GLB, MP3, client, crédits et connexions WSS utilisent l'origine publique du jeu.
Aucun appel à un CDN d'assets n'est nécessaire en course.

## Ce qui est intégré

- **Un kart Zsky, huit couleurs** : modèle gratuit sous CC BY 3.0, pivots préparés,
  roues et braquage animés, carrosserie inclinée, ombre de contact et caméra
  rapprochée. Chargement GLTF unique, géométries partagées et peintures indépendantes.
  Le kart procédural sert de secours au chargement.
- **Huit objets mystères** : turbo, triple turbo, balise piège, disque vert,
  fusée rouge, comète bleue visant le leader, étoile d'énergie et bouclier.
  Charges, cibles, impacts et protections sont décidés par le serveur.
- **Musiques MP3 fournies** : `Lap 1.mp3` au premier tour et `Lap 2.mp3` aux
  deuxième et troisième tours, sur tous les circuits. Lecture après interaction,
  volume commun aux effets, pause/reprise et arrêt hors course. Les deux lecteurs
  sont réutilisés, avec un seul morceau actif.
- [**todo.md**](../todo.md) : réalisations et vérifications restantes.

Les circuits, les tournois, le protocole des commandes Colyseus, les fichiers Docker
et les dépendances restent en place. Le lot visuel ne touche pas la physique ;
les nouveaux objets étendent les règles de simulation.

## Captures et extraits

| Preuve | Fichiers |
| --- | --- |
| Kart, cadrage identique | [Avant](kart-visuals/kart-before-detail.png) · [Après](kart-visuals/kart-after-detail.png) |
| Huit couleurs, cadrage identique | [Avant](kart-visuals/kart-before.png) · [Après](kart-visuals/kart-after.png) |
| Objets et protections | [Capture du test privé](demo-results/items-effects.png) |
| Musiques fournies | [Lap 1](../assets/audios/Lap%201.mp3) · [Lap 2](../assets/audios/Lap%202.mp3) |
| Répartition par tour et contrôles | [Intégration des MP3](MUSIC.md) |

Les comparatifs des karts fixent caméra, éclairage, positions et temps. La capture
des objets est une scène privée volontairement suspendue pour rendre tous les
effets visibles ; elle ne prouve pas une course complète.

## Tests exécutés

Les contrôles de préparation des MP3, les dix contrôles audio, le build hôte et
la reconstruction Docker ont été exécutés après le remplacement musical.
Une nouvelle course publique complète avec les MP3 a également réussi.
Les validations des karts, objets et tournois ci-dessous précèdent ce remplacement ;
leurs résultats sont conservés sans prétendre avoir rejoué toutes ces suites.

| Contrôle | Résultat |
| --- | --- |
| `npm test` | **63 tests réussis**, dont 13 nouveaux tests d'objets ; huit pilotes terminent les quatre circuits en simulation déterministe. |
| `npm run build` + Docker | Types, client et serveur compilés ; conteneur sain et tunnel enregistré. |
| `npm run check:kart` | Original vérifié par SHA-256, conversion reproductible. |
| `npm run test:kart-visual` | 8 contrôles réussis : chargement unique, huit peintures, partage, animations et secours HTTP 404. |
| `npm run test:kart-visual -- --camera-only` | Kart dans le champ à 3 FPS et 40 m/s, sans mutation du monde par le rendu. |
| `npm run test:items-browser` | 7 groupes de contrôles couvrant les huit objets ; trois pressions E réelles consomment les trois charges. Étoile : 5,53 s ; bouclier : 8,03 s. |
| Ancienne musique synthétique | 12 contrôles avaient validé le séquenceur initial ; il est remplacé par les MP3 fournis. Ces résultats restent archivés. |
| `npm run check:music` + `npm run test:music` | Copies MP3 identiques ; **10 contrôles Chromium réussis** : lecture, tours, boucles, volume, pause/reprise, arrêt et erreur 404. |
| Course publique avec les MP3 | **67,4 s, sortie 0** : quatre pilotes SDK terminent trois tours ; deux navigateurs lisent Lap 1 puis Lap 2, volume et arrêt à l'arrivée vérifiés, aucune erreur JavaScript. |
| Fichiers MP3 publics | Les deux fichiers répondent en `audio/mpeg` avec SHA-256 identiques aux originaux ; une requête par fichier et par navigateur observée pendant cette course. |
| Course publique précédente | **65,036 s réelles** : quatre pilotes SDK terminent trois tours, deux navigateurs reçoivent les mêmes résultats, aucune erreur JavaScript. |
| Tournoi public complet | **303,565 s réelles, sortie 0** : deux pilotes SDK terminent trois tours sur chacun des quatre circuits ; scores, reconnexion, revanche, sélection aléatoire et isolation des salons vérifiés. |
| Audio dans le jeu public | Musique active après interaction dans les deux navigateurs ; volume nul puis rétabli ; arrêt en fin de course. |
| Fichiers publics | GLB de 94 668 octets identique au fichier local, une requête par navigateur ; crédits accessibles. |

Rapports conservés : [course](demo-results/race.json), [tournoi](demo-results/tournament.json), [objets et fixtures](demo-results/items.json),
[ancienne musique](demo-results/music.json) et [intégrité des fichiers](demo-results/assets.json).
Le [nouveau rapport audio MP3](music-validation.json) documente la version actuelle.
La [nouvelle course publique](mp3-public.json) et [l'intégrité des MP3 publics](mp3-public-assets.json)
confirment cette version sur le tunnel. La course utilise un seul hôte avec
deux contextes navigateur indépendants ; ce ne sont pas deux machines physiques.

La course publique utilise les commandes ordinaires, sans imposer positions ou
arrivées. Les deux navigateurs sont des observateurs dans le même Chromium.
Cette course a montré turbo, triple turbo, piège, étoile et bouclier ; les huit
types sont couverts par les règles et le test navigateur privé, qui attribue
explicitement les objets.

Un premier tournoi à quatre pilotes avait également terminé les quatre courses
et ses dix contrôles, puis reçu SIGTERM après l'enregistrement du rapport.
Sa cause n'est pas établie ; ce lancement n'est pas présenté comme une sortie
normale. Le contrôle court de fermeture après reconnexion et le tournoi complet
à deux pilotes ont ensuite tous deux terminé avec le code 0.
[Historique du premier essai](demo-results/tournament-four-drivers.json).

## Vérifications humaines restantes

- Deux ordinateurs physiques : clavier, objets, reconnexion et course suivante.
- Fluidité sur les GPU des collègues, lisibilité et équilibrage en groupe.
- Écoute et équilibre musique/moteur sur leurs haut-parleurs ; préférences de volume.
- Téléphone réel et reprise audio après verrouillage, si ce support est prévu.

Le navigateur utilise ici SwiftShader. Lors de la validation initiale avec tests concurrents, les échantillons
de fin de course sont de 1,1 à 1,6 FPS ; un rattrapage du séquenceur audio a été
observé dans chaque navigateur. Ces mesures ne représentent pas un GPU matériel
et ne prouvent pas une fluidité ou une écoute satisfaisante sur les machines de
démo. Ces observations concernent l'ancien séquenceur synthétique, remplacé par
les MP3. L'écoute sur le matériel des collègues reste à réaliser.

Détails : [modèle](KART_ASSET.md), [lot visuel](KART_DEMO.md), [objets](ITEMS.md),
[musique](MUSIC.md) et [validation du projet](../VALIDATION.md).
