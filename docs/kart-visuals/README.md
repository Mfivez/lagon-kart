# Comparaison des karts

Les captures comparent le modèle procédural du commit
`51bbbab3c78cc5454124ae67682fad2fdfcd5dde` au kart importé dans le même
circuit, avec les mêmes positions, couleurs, transformations de caméra et
éclairages. Le test vérifie ces paramètres avant d'enregistrer les images.

| Vue | Avant | Après |
| --- | --- | --- |
| Huit couleurs | [Référence](kart-before.png) | [Kart importé](kart-after.png) |
| Détail du pilote et du véhicule | [Référence](kart-before-detail.png) | [Kart importé](kart-after-detail.png) |

Les images mesurent 1280 × 800 pixels, avec une densité de pixels de 1. Le
temps visuel est fixé à 5 secondes. Les paramètres et contrôles sont consignés
dans [comparison.json](comparison.json). Les captures utilisent Chromium
avec SwiftShader ; elles ne mesurent pas les performances d'un GPU matériel.

Pour les régénérer depuis la racine du projet :

```bash
npm ci
npx playwright install chromium
node --import tsx scripts/kart-visual-check.ts
```

Le script démarre son propre serveur Vite sur un port local temporaire,
instancie directement les deux moteurs de rendu dans une page de test et
ferme ses processus après les captures. Il ne crée aucun salon et ne modifie
aucune position dans le jeu Docker. Le modèle procédural et ses données de
circuit sont archivés dans `tests/fixtures/kart-baseline/`.

La validation contrôle un seul téléchargement du GLB, huit peintures
indépendantes, le partage des géométries, les quatre roues animées, le
braquage, l'inclinaison de la carrosserie et sa garde au sol. Elle vérifie
également le départ puis la recréation d'un kart sans détruire les géométries
partagées, et le modèle de secours lorsque le GLB répond 404. Les détails
techniques et la capture du secours sont conservés dans `test-results/`.

Un contrôle ciblé de la caméra normale peut être exécuté sans régénérer les
images : `node --import tsx scripts/kart-visual-check.ts --camera-only`.
Il déplace uniquement le kart de la fixture à 40 m/s, avec une image toutes
les 333 ms et un pas de simulation borné à 0,1 s comme dans le client. Après
établissement, son centre doit rester dans le champ et la caméra à moins de
4,5 m de sa position cible. Le rendu ne doit modifier aucun état du monde.
Les projections détaillées sont enregistrées dans `test-results/kart-camera.json`.

Le véhicule adapté provient de **Go Kart**, par **Zsky**, distribué sur
[Poly Pizza](https://poly.pizza/m/MkByxZCSMA) sous
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Les modifications
comprennent l'échelle, le centrage, les pivots des roues et les matériaux.
Le pilote est une géométrie originale ajoutée pour Lagon Kart. Voir les
[notices du projet](../../THIRD_PARTY_NOTICES.md) et
[l'inspection de la source](../../assets/sources/zsky/inspection.json).
