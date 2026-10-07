# Profondeur des panoramas

Contrôle privé du 6 octobre 2026 : un seul contexte Chromium/SwiftShader,
1440 × 900, rendu direct de `GameRenderer` servi par Vite. Aucune course,
aucune modification de physique et aucun changement de source pendant l'essai.
Le navigateur et le serveur privé ont été fermés après les captures.

Le ruban coloré des branches est à `y = 0,023`, leur chaussée à `y = 0,035` :
leur séparation est de 1,2 cm. Le contexte WebGL possède bien un tampon de
profondeur de 24 bits. Dans le panorama, une partie de ces surfaces se trouve
à plus de 500 m de profondeur caméra. Avec `near = 1`, leur écart projeté est
parfois inférieur à un pas du tampon ; le ruban inférieur apparaît alors sous
forme de stries et de triangles sur la chaussée.

Les huit captures comparent `near = 1` et `near = 10`, avec et sans ombres,
sans changer la position, la cible, le champ de vision ou les géométries entre
les deux valeurs. À `near = 10`, les stries parasites observées sur les branches
disparaissent dans ces vues de la Fonderie et de la Citadelle, avec et sans
ombres. Les surfaces claires continues de glace sur la voie technique restent
visibles : elles appartiennent au circuit.

| Circuit | Avant, near 1 | Après, near 10 |
| --- | --- | --- |
| Fonderie, sans ombres | [Capture](foundry-near1-no-shadows.png) | [Capture](foundry-near10-no-shadows.png) |
| Fonderie, avec ombres | [Capture](foundry-near1-shadows.png) | [Capture](foundry-near10-shadows.png) |
| Citadelle, sans ombres | [Capture](castle-near1-no-shadows.png) | [Capture](castle-near10-no-shadows.png) |
| Citadelle, avec ombres | [Capture](castle-near1-shadows.png) | [Capture](castle-near10-shadows.png) |

Une mesure mathématique complémentaire reprend la caméra d'accueil sur
32 angles d'orbite et tous les points des branches ouvertes :

| Circuit | Plus petit écart, near 1 | Plus petit écart, near 10 | Échantillons sous un pas, near 1 → 10 |
| --- | --- | --- | --- |
| Fonderie | 0,433 pas | 4,375 pas | 3162/6208 → 0/6208 |
| Citadelle | 0,442 pas | 4,469 pas | 3021/6208 → 0/6208 |

Le correctif proposé est donc `near = 10` uniquement pour le panorama,
en conservant `near = 1` pour la caméra de conduite. Il préserve les hauteurs,
les collisions et les matériaux. Cet essai compare ces réglages en mémoire ;
la compilation et le déploiement du correctif sont des vérifications distinctes.
Il ne constitue pas un essai GPU matériel ni une course publique.

[Métadonnées des captures](validation.json) · [Mesures de projection](depth-math.json).

Le réglage a ensuite été appliqué dans `client/renderer.ts` et compilé dans `index-DCnyszy_.js`. TypeScript et build ont réussi ; ce bundle est servi par Docker et son empreinte publique correspond au fichier local ([preuve](../final-public-assets.json)). Les captures comparatives ci-dessus restent le test discriminant effectué en mémoire avant cette intégration.
