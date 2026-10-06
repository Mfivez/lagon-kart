# Personnages cartoon

Le garage dispose de cinq pilotes, compatibles avec chacun des trois châssis :

| ID | Personnage | Apparence et accessoire |
| --- | --- | --- |
| `racer` | Pilote | Casque intégral, visière sombre, combinaison aux couleurs du joueur |
| `queen` | La Reine | Caricature de reine britannique : cheveux argentés, couronne, perles, tenue bleue et mini-trône |
| `obama` | Obama | Caricature en costume bleu, cheveux courts grisonnants aux tempes, grandes oreilles, cravate et mini-pupitre avec micro |
| `trump` | Trump | Caricature à la mèche blonde exagérée, costume, grande cravate rouge et petit portique doré |
| `kim` | Kim Jong-un | Caricature au visage rond et à la coupe haute, veste boutonnée, siège avec deux antennes |

![Les cinq pilotes dans le même kart](characters/lineup.png)

Il s'agit de créations géométriques originales du projet, volontairement
cartoon, sans photographie, texture téléchargée, modèle de personne importé ni
service de génération. **Coût ajouté : 0 €.** Ces représentations parodiques ne
sont pas des produits officiels ni une indication de soutien des personnes
représentées. Les géométries et le code des personnages suivent les conditions
du code du projet ; aucune licence tierce supplémentaire n'est nécessaire pour
ces créations. Les licences des véhicules importés restent décrites dans
[KART_MODELS.md](KART_MODELS.md).

## Construction et comportement

[`shared/characters.ts`](../shared/characters.ts) fournit les identifiants,
noms, descriptions et fonctions de validation. Les valeurs inconnues reviennent
au pilote casqué. Le choix ne change aucun paramètre de simulation ni de collision.

[`client/kart-character.ts`](../client/kart-character.ts) construit les quatre
caricatures à partir de sphères, cylindres, boîtes, cônes et anneaux Three.js.
Les pièces rigides sont regroupées par matériau. Le modèle original du kart
reste importé avec `GLTFLoader` ; les personnages et accessoires sont ajoutés
à son repère de siège. Les bras sont ajustés au repère du volant de chaque
châssis.

`createKartModel(color, modelId = 'zsky', characterId = 'racer')` réutilise une
promesse de chargement par véhicule et un modèle préparé par couple
véhicule/personnage. Deux instances partagent les géométries et matériaux
fixes, mais possèdent leurs transformations et leurs peintures. Les visages
réagissent par transformation de pièces : aucun matériau partagé n'est modifié
pour animer une expression. La peinture du kart et les petits rappels sur la
tenue sont indépendants pour chaque joueur ; la peau et les traits distinctifs
gardent leur couleur.

Pendant la conduite, la tête suit légèrement le braquage et l'accélération.
Un impact fait osciller la tête, monter les sourcils et ouvrir la bouche des
caricatures. À l'arrivée, elles sourient et saluent du bras ; le pilote casqué
accompagne la célébration par des mouvements de tête. Les accessoires restent
attachés à la carrosserie. Ces effets ne modifient jamais les coordonnées,
la direction réelle, les entrées de conduite ou les collisions.

## Vérifications exécutées

```sh
npm run typecheck
node --import tsx --test tests/kart-assets.test.ts tests/characters.test.ts
node --import tsx scripts/characters-check.ts
node --import tsx scripts/kart-library-check.ts
```

Le typage et les **7 tests ciblés** des modèles/catalogues passent. Le catalogue
rejette notamment objets, tableaux, URL et identifiants non autorisés.

Les **5 contrôles Chromium des personnages** sont passés :

- 30 instances : cinq personnages sur trois châssis avec deux peintures,
  seulement trois téléchargements GLB sur la même origine, aucun secours.
- Géométries partagées entre copies et peintures indépendantes.
- Impact appliqué à une seule instance : elle réagit sans modifier les autres
  pilotes ni les entrées de simulation.
- Impact et victoire sur tous les pilotes : mouvements de tête, expressions
  et salut des caricatures, coordonnées inchangées et carrosserie au-dessus du sol.
- Recoloration puis recréation d'un couple personnage/véhicule sans nouveau
  téléchargement ni destruction des géométries partagées ; zéro erreur JavaScript.

Le [rapport JSON](characters/validation.json) contient les mesures. Les captures
[Pilote](characters/racer.png), [Reine](characters/queen.png),
[Obama](characters/obama.png), [Trump](characters/trump.png),
[Kim Jong-un](characters/kim.png) et [salut de la Reine](characters/queen-victory.png)
proviennent du rendu réel et ont été inspectées visuellement.

Selon le châssis, le pilote casqué représente 4 292 à 6 440 triangles avec son
véhicule. Les caricatures restent sous 11 900 triangles et 44 meshes par
véhicule. La séparation du casque animé ajoute un mesh au pilote existant,
sans ajouter de triangles. Les cinq contrôles de la bibliothèque des véhicules
ont été rejoués après cette modification.

Ces contrôles utilisent Chromium avec SwiftShader. Ils ne remplacent ni une
mesure de performances sur GPU, ni la validation réseau du choix du personnage
et de sa conservation entre manches/reconnexions, décrite séparément dans le
rapport d'intégration.
