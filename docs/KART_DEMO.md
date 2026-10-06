# Kart Zsky pour la démo

Le kart simplifié est remplacé par **Go Kart de Zsky**, décliné dans les huit
couleurs du jeu. Coût : **0 €**. Aucune API IA, aucun abonnement, aucun asset
payant et aucune nouvelle dépendance npm. Le lot visuel conserve la simulation,
les collisions, les circuits, les salons Colyseus et les fichiers Docker.
Les extensions de gameplay sont documentées séparément dans [ITEMS.md](ITEMS.md).

## Modèle et présentation

La distribution individuelle [Poly Pizza](https://poly.pizza/m/MkByxZCSMA)
est sous [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
Le pack modulaire OpenGameArt, sous CC BY 4.0, n'a pas été utilisé : son archive
a répondu HTTP 403. Les crédits mentionnent [Zsky](https://www.patreon.com/Zsky),
la source, la licence et les adaptations, dans le projet et via le lien
**Crédits** du jeu.

Le fichier original, sa licence et son inspection sont conservés dans
`assets/sources/zsky/`. L'inspection a identifié quatre roues séparées, mais
des pivots à l'origine mondiale : ils ont été recentrés avant l'intégration.
Le convertisseur Python standard, reproductible et sans téléchargement, produit
`client/public/models/kart-zsky-v1.glb` : **94 668 octets**, 1 680 triangles,
7 matériaux, aucune texture externe. Voir [l'inspection détaillée](KART_ASSET.md).
Python et Blender ne sont pas nécessaires pour construire Docker ou jouer.

`GLTFLoader` charge le GLB une seule fois par page. Les karts partagent leurs
géométries et leurs matériaux fixes ; chaque instance possède ses matériaux
de peinture. Le pilote original ajouté au modèle est regroupé par matériau.
L'ensemble véhicule et pilote compte 4 292 triangles et 20 meshes.

Les roues tournent suivant la vitesse et leur rayon respectif ; les roues avant
braquent sur des pivots distincts. La carrosserie prend un léger roulis en
virage et tangue à l'accélération. Ces effets ne modifient aucun état de
simulation. Sa garde au sol est conservée même au freinage et au roulis maximal.
Une ombre de contact locale reste visible en qualité réduite. Les matériaux
différencient peinture, pneus, jantes, siège et métal, sans post-traitement ajouté.

La caméra de poursuite est plus basse et rapprochée. Son lissage utilise le
temps réel de rendu, indépendamment du pas borné de la simulation, pour éviter
de perdre le kart de vue quand le navigateur affiche peu d'images par seconde.
Après une longue absence de l'onglet, elle se réancre sur le kart.
L'ancien kart reste disponible uniquement si le chargement ou la validation
du GLB échoue.

## Captures avant et après

| Vue | Avant | Après |
| --- | --- | --- |
| Détail du véhicule | [Kart procédural](kart-visuals/kart-before-detail.png) | [Kart Zsky](kart-visuals/kart-after-detail.png) |
| Huit couleurs | [Kart procédural](kart-visuals/kart-before.png) | [Kart Zsky](kart-visuals/kart-after.png) |

Les comparatifs utilisent **le même cadrage, les mêmes positions, éclairages,
couleurs et dimensions de 1280 × 800 pixels**. La référence provient du commit
`51bbbab3c78cc5454124ae67682fad2fdfcd5dde`. La fixture isolée ne modifie aucune
partie serveur. [Paramètres et reproduction](kart-visuals/README.md).

## Vérifications exécutées le 6 octobre 2026

| Vérification | Résultat |
| --- | --- |
| `python3 scripts/prepare-kart.py --check` | GLB et inspection identiques à la conversion, SHA-256 de l'original vérifié. |
| `npm test` | **50 tests réussis, aucun échec** : règles et serveur existants, plus 3 contrôles structurels du GLB. |
| `npm run build` et construction Docker | TypeScript, client Vite et serveur compilés. |
| `npm run test:kart-visual` | 8 contrôles réussis : comparatifs, origine unique, chargement unique, partage de géométrie, peintures indépendantes, animations, garde au sol et secours. |
| `npm run test:kart-visual -- --camera-only` | À 3 FPS et 40 m/s, le kart reste dans le champ ; retard de poursuite maximal de 3,108 m ; monde inchangé par le rendu. |
| Retrait et recréation d'un kart | Géométries partagées conservées ; pas de second téléchargement. |
| GLB volontairement indisponible (HTTP 404) | Huit karts de secours affichés ; aucune boucle de requêtes. |
| Course publique Docker / tunnel | Quatre pilotes SDK terminent réellement trois tours sur l'Île des Alizés ; deux sessions Chromium observent et reçoivent les mêmes résultats. Dernier essai avec caméra corrigée : 70,02 s réelles. |
| Chargement public | Une requête GLB par navigateur, depuis la même origine HTTPS ; WebSocket WSS sur cette origine ; aucune erreur JavaScript. |
| Crédits et intégrité publique | Crédits accessibles ; MIME `model/gltf-binary`, taille et SHA-256 du GLB public identiques au fichier local. |

La course emploie les commandes ordinaires d'accélération, direction, objets et
remise en piste via le SDK Colyseus, sans imposer de positions ni de résultats.
Les deux navigateurs sont des **observateurs**, dans deux contextes indépendants
du même Chromium. Ce test ne représente pas deux personnes au clavier ni deux
machines physiques. Les rapports détaillés sont dans `test-results/` ; les
preuves du lot visuel sont aussi conservées avec les captures :
[course](kart-visuals/multiplayer.json), [caméra](kart-visuals/camera.json) et
[fichiers publics](kart-visuals/public-assets.json).

Le client final de ce lot utilise `index-2OYoI3xI.js` et `index-D3XtaGAo.css`.
Ses fichiers ont été copiés depuis l'image Docker reconstruite vers le
conteneur actif, sans redémarrer le serveur ni interrompre le salon occupé.

Pour reproduire la course contre un serveur actif :

```bash
BASE_URL=http://localhost:3103 npm run test:kart-demo
```

## Instance utilisée pour le lot visuel

La version complète avec objets et musique est indiquée dans [DEMO.md](DEMO.md).
Les adresses ci-dessous correspondent au lot visuel initial.

- Local : http://localhost:3102
- Public : https://forward-buses-were-mom.trycloudflare.com
- Projet Docker : `lagon-kart-demo`.

L'adresse publique est temporaire ; Docker, le tunnel et l'ordinateur hôte
doivent rester actifs. Ouvrir l'adresse publique avant de créer le salon pour
partager un lien utilisable par les collègues. Le déploiement visuel n'a pas
interrompu les salons des instances précédentes.

```bash
# Consulter les services et retrouver l'adresse du tunnel
HOST_PORT=3102 docker compose -p lagon-kart-demo --profile tunnel ps
docker compose -p lagon-kart-demo logs -f tunnel

# Pour une future reconstruction, une fois les salons libérés
HOST_PORT=3102 docker compose -p lagon-kart-demo up --build --no-deps -d app
```

## Vérifications restant à faire

- Une partie jouée au clavier sur deux machines physiques, idéalement sur deux réseaux.
- La fluidité sur le GPU des ordinateurs de la démo et dans leurs navigateurs habituels.
- Un essai manuel sur téléphone si ce support est prévu pour la démo.

Chromium utilise ici **SwiftShader**, un rendu logiciel, et réduit automatiquement
la qualité ; les échantillons en fin de course étaient de 3,5 à 3,8 FPS. Les
captures prouvent la présentation ; elles ne prouvent pas une
cadence de 60 FPS sur GPU. Dans la scène comparative à huit karts, les compteurs
Three.js passent de 360 à 432 appels de dessin et d'environ 40 800 à 101 200
triangles rendus, ombres comprises. Les géométries allouées dans la scène passent
de 71 à 51 grâce au partage. Ces compteurs ne constituent pas un benchmark matériel.
