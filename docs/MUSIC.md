# Musiques fournies en MP3

Le jeu utilise les deux fichiers fournis dans `assets/audios/`. Les originaux sont conservés sans modification ; les copies publiques ont exactement les mêmes octets et des noms versionnés. La composition synthétique précédente a été remplacée. Aucun abonnement, API, téléchargement musical externe ou dépendance n’a été ajouté : **coût de cette intégration : 0 €**.

| Fichier fourni | Copie servie par le jeu | Utilisation | Taille | Durée encodée |
| --- | --- | --- | --- | --- |
| `Lap 1.mp3` | `/audio/lap-1-v1.mp3` | Premier tour, tous les circuits | 3 916 673 octets | 174,48 s |
| `Lap 2.mp3` | `/audio/lap-2-v1.mp3` | Deuxième et troisième tours, tous les circuits | 2 323 191 octets | 99,72 s |

Les deux fichiers sont des MP3 MPEG-1 Layer III, à débit variable, stéréo 48 kHz, avec des tags ID3v2.4. Leurs métadonnées indiquent le champ artiste `ancestraldrummers512`, le commentaire `made with suno` et des liens Suno. Les deux titres internes sont `Lap 1` : l’association des tours suit donc les **noms des fichiers fournis**. Ces métadonnées ne constituent pas une licence ; aucune licence supplémentaire ne leur est attribuée par le projet.

Les empreintes SHA-256, liens présents dans les tags et données techniques figurent dans [l’inspection conservée avec les sources](../assets/audios/inspection.json). La durée calculée à partir des trames inclut le délai/padding d’encodage ; celle décodée par le navigateur peut différer légèrement.

## Lecture et volume

- `GameAudio.update(speed, active, item, boost, countdown, trackId, musicActive, lap)` accepte le numéro de tour **à partir de zéro** : `0` sélectionne Lap 1, `1` et `2` sélectionnent Lap 2. Le passage du deuxième au troisième tour conserve la position de lecture.
- Les lecteurs natifs `HTMLAudioElement` sont raccordés au mixage Web Audio existant. Ils évitent de conserver les deux morceaux entièrement décodés en gros `AudioBuffer`. Deux lecteurs au maximum sont créés, chacun à la première utilisation de sa piste ; leurs URL restent ensuite inchangées.
- Une seule piste joue à la fois. Elle boucle si elle atteint sa fin. Le changement de morceau arrête l’ancien lecteur avant de démarrer le nouveau avec un court fondu d’entrée.
- Le volume existant règle musique, moteur et effets. Le gain musical vaut `1,5` avant le gain général `0,18 × volume`, soit `0,27` au maximum à 100 % pour la musique seule. Le moteur et les effets gardent leur réglage.
- La musique nécessite l’activation audio issue d’une interaction utilisateur. Un refus d’autoplay est silencieux et peut être retenté à l’interaction suivante ; aucun lecteur n’est relancé à chaque image.
- Le volume nul et l’onglet masqué mettent la piste en pause en conservant sa position. La fin de course ou la déconnexion la remet au début. Les lecteurs sont réutilisés lors de la course suivante, sans recréer de graphe audio.
- Une erreur de fichier ou de décodage conserve le silence et un diagnostic lisible, sans boucle de tentatives ni retour à l’ancienne composition. La simulation et le réseau de jeu n’en dépendent pas.

Tous les fichiers sont servis depuis la même origine que le jeu ; le lecteur ne suit pas les liens Suno présents dans les métadonnées. Les navigateurs peuvent effectuer leurs propres requêtes HTTP de média, mais le code ne télécharge ni ne réassigne la source à chaque tour/image. Aucun serveur ou service audio externe n’est nécessaire.

## Préparation et vérification

```bash
# Inspecter les originaux et recopier les deux MP3, sans conversion.
python3 scripts/prepare-music.py

# Vérifier les empreintes, les copies et le rapport sans écrire de fichier.
python3 scripts/prepare-music.py --check

# Tester le lecteur dans Chromium ; le script ne crée plus de WAV synthétiques.
node --import tsx scripts/music-check.ts
```

Python sert uniquement à la préparation facultative des assets. Les copies MP3 sont incluses dans le projet ; le lancement et l’image Docker n’ont besoin ni de Python, ni de FFmpeg, ni de Blender.

## Résultats exécutés

`python3 scripts/prepare-music.py --check` et `npm run typecheck` passent. Le contrôle Chromium passe **10 vérifications**, détaillées dans [le rapport conservé](music-validation.json) et recopiées dans `test-results/music.json` :

- silence et aucun téléchargement MP3 avant le geste utilisateur ; lecture réelle et progression de `currentTime` après le clic ;
- sélection des deux fichiers sur les quatre circuits, sans redémarrage au troisième tour ;
- 1 200 mises à jour identiques sans nouvel appel à `play()`, `load()` ni nouvelle requête ;
- bouclage réel des deux fichiers après recherche près de leur fin ;
- pause/reprise au volume nul et lors d’un événement de visibilité simulé, puis remise à zéro en fin de course ;
- décodage complet, empreintes identiques aux sources, erreur HTTP 404 silencieuse sans boucle de requêtes ni erreur JavaScript.

Deux lecteurs au maximum et une seule piste active ont été observés, avec une requête de lecture par fichier dans ce test. Les durées décodées sont **174,41349 s** et **99,65349 s**. Le contexte de test a rééchantillonné les MP3 en stéréo 44,1 kHz, sans modifier les fichiers 48 kHz.

Les amplitudes RMS décodées sont respectivement **0,12995** et **0,11715** ; les pics bruts valent **1,00612** et **0,98399**. Le premier MP3 présente donc un léger dépassement flottant au décodage. Le gain maximal de lecture `0,27` ramène les pics musicaux estimés à **0,272** et **0,266**, avec de la marge pour le moteur et les effets. Aucun changement ni réencodage des sources n’a été effectué.

Ces résultats sont des mesures automatiques et ne constituent pas une écoute humaine. L’équilibre sur les haut-parleurs des collègues et les particularités d’autoplay/reprise sur appareils mobiles restent à essayer à l’oreille et sur matériel réel. La visibilité a été exercée par un événement contrôlé dans la fixture.

## Vérification dans le jeu public

Le client et les MP3 ont été publiés depuis l'image Docker reconstruite dans le conteneur existant, sans redémarrage du serveur ni du tunnel. La compilation servie est `index-BcLJLuu2.js`.

`BASE_URL=https://cube-dense-operator-dont.trycloudflare.com REPORT_PATH=test-results/mp3-public.json npm run test:kart-demo` a réussi en **67,4 s**, avec le code de sortie 0. Quatre pilotes SDK utilisent les commandes ordinaires et terminent trois tours ; deux contextes Chromium indépendants les observent :

- progression de lecture de Lap 1, puis de Lap 2 après le passage réel au deuxième tour ;
- volume nul puis rétabli, lecture arrêtée et position remise à zéro à l'arrivée ;
- deux lecteurs réutilisés par page, une requête par fichier observée, aucune erreur JavaScript ni erreur média ;
- classement identique et kart GLB chargé une fois par page.

Le serveur Docker sert les deux MP3 avec HTTP 200 et `Content-Type: audio/mpeg` ; leurs octets et SHA-256 correspondent aux sources. Crédits et nouvelle compilation vérifiés sur la même origine. Preuves : [course publique](mp3-public.json), [intégrité publique](mp3-public-assets.json).

Ce contrôle utilise Chromium/SwiftShader sur un seul hôte, sans écoute physique. Les essais à deux ordinateurs et l'équilibre sonore sur leur matériel restent à réaliser.
