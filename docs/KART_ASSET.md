# Inspection et préparation du kart Zsky

Le jeu embarque un seul modèle gratuit Zsky, décliné par peinture dans les huit
couleurs des joueurs. Le GLB de production se trouve dans
[`client/public/models/kart-zsky-v1.glb`](../client/public/models/kart-zsky-v1.glb).
Il est servi depuis `/models/kart-zsky-v1.glb`, sur la même origine que le jeu,
y compris avec Docker et le tunnel. Aucun appel à Poly Pizza n'a lieu au lancement.

## Provenance et licence vérifiées

La page [Modular karts sur OpenGameArt](https://opengameart.org/content/modular-karts)
annonce un pack Zsky en OBJ, FBX et BLEND sous CC BY 4.0. Le téléchargement de son
archive a répondu HTTP 403 dans cet environnement. Le
[modèle individuel Go Kart proposé par l'utilisateur](https://poly.pizza/m/MkByxZCSMA)
était disponible gratuitement sur le CDN public officiel, sans compte. Il a été
téléchargé et inspecté avant toute conversion.

**Cette distribution individuelle est sous CC BY 3.0**, comme l'indiquent le
lien de licence et le champ `Licence` de la page Poly Pizza. Ne pas lui attribuer
par erreur la licence 4.0 du pack OpenGameArt. Le crédit est : **Go Kart par Zsky**,
avec les liens https://www.patreon.com/Zsky, https://poly.pizza/m/MkByxZCSMA et
https://creativecommons.org/licenses/by/3.0/. Les adaptations sont signalées dans
les crédits du jeu et [la notice source](../assets/sources/zsky/ATTRIBUTION.md).

Les originaux sont conservés dans `assets/sources/zsky/` : GLB intact, aperçu,
texte officiel de licence, métadonnées de provenance et rapport d'inspection.
Le script vérifie le SHA-256 de la source avant de travailler.

## Ce que contenait réellement le GLB

| Élément | Constat avant préparation |
| --- | --- |
| Générateur | `obj2gltf`, glTF 2.0 |
| Géométrie | 7 meshes, 21 primitives, **1 680 triangles réels** |
| Matériaux | 15 matériaux PBR unis ; aucune texture |
| Dimensions originales | 10,529 × 5,617 × 17,739 unités, axes X/Y/Z |
| Orientation | Haut +Y, avant +Z : phares devant, échappements derrière |
| Roues | Quatre meshes séparés, deux plus petites à l'avant |
| Pivots | Tous les nœuds à l'origine mondiale ; les sommets contiennent les positions |
| Animation | Aucun squelette ni clip ; les roues ne sont pas prêtes à tourner |
| Pilote | Aucun ; siège, pédales et volant présents |

La fiche commerciale affiche 804 triangles, mais l'addition des indices du GLB
donne 1 680. Le rapport décrit le fichier téléchargé, sans reprendre ce nombre
non concordant. Une roue avant porte le nom trompeur
`Lights_Kart1.021_Cylinder.030` : son identification repose sur sa géométrie et
sa position, pas uniquement sur son nom.

## Conversion reproductible sans Blender

```sh
python3 scripts/prepare-kart.py
python3 scripts/prepare-kart.py --check
```

Le convertisseur utilise uniquement la bibliothèque standard Python. Il ne
télécharge rien et ne dépend ni de Blender ni d'un service externe. Blender
reste utilisable pour modifier le GLB original, mais n'est nécessaire ni à la
conversion actuelle, ni au build Node/Docker, ni au lancement du jeu. Le second
mode reconstruit en mémoire et compare les octets du GLB et du rapport.

La mise à l'échelle uniforme conserve les proportions : **2,256 m de large,
3,800 m de long et 1,203 m de haut sans pilote**. L'origine X/Z est centrée dans
la boîte englobante et le pneu le plus bas est à Y=0. Tous les 1 680 triangles
sont conservés. Les primitives de carrosserie partageant un matériau sont
regroupées ; les UV sans texture sont retirés. Le résultat fait **94 668 octets**,
15 primitives et 7 matériaux, sans compression nécessitant un décodeur externe.

## Contrat d'animation

| Nœud | Pivot local / rôle |
| --- | --- |
| `Kart` | Racine, +Z avant et +Y haut, rotation et échelle identitaires |
| `Body` | Carrosserie, volant et repères du pilote ; inclinaison visuelle seulement |
| `Wheel_FL` | Avant gauche, position (+0,578 ; 0,235 ; +1,026), rayon 0,231 m |
| `Wheel_FR` | Avant droite, position (−0,513 ; 0,235 ; +1,026), rayon 0,231 m |
| `Wheel_RL` | Arrière gauche, position (+0,744 ; 0,306 ; −0,801), rayon 0,306 m |
| `Wheel_RR` | Arrière droite, position (−0,679 ; 0,306 ; −0,801), rayon 0,306 m |
| `SeatMount` | Dessus de l'assise, près de (0 ; 0,250 ; 0,023) |
| `SteeringMount` | Repère près du centre du volant : (0 ; 1,120 ; 0,690) |

Gauche/droite suivent le pilote regardant +Z, donc sa gauche correspond à +X.
Les sommets de chaque roue sont recentrés autour de son axe. La rotation de
roulement s'effectue sur **X** ; le braquage utilise un parent sur **Y** pour les
deux roues avant. Les nœuds de roues sont des frères de `Body` : l'inclinaison
de la carrosserie ne déplace pas les roues. Les petites asymétries latérales du
modèle original sont conservées. Le rayon est aussi présent dans `extras.radius`.

Le matériau **`KartPaint`** regroupe les anciens `Blue_Kart1` et `Blue_Hood1`.
Il est blanc dans le GLB afin d'être teinté par le client. Les pneus, jantes,
métaux, siège, réservoir et lampes ont des matériaux distincts. Les géométries
peuvent être partagées entre karts ; le matériau de peinture doit être cloné
par instance pour éviter qu'un changement de couleur affecte les autres joueurs.

Les paramètres de simulation, trajectoires, collisions et données Colyseus
n'entrent pas dans cette conversion. Les animations utilisent ces données
uniquement pour présenter visuellement les mouvements.

## Vérifications de préparation exécutées

- Inspection des véritables meshes, matériaux, dimensions, nœuds et pivots.
- Vérification du fichier original par SHA-256.
- Conversion puis `--check` : sortie identique, source intacte.
- Conservation du nombre de triangles, coordonnées finies et GLB autonome.
- Chargement réel via le `GLTFLoader` installé : 15 meshes, 1 680 triangles,
  les cinq nœuds d'animation attendus présents et la boîte englobante à Y=0.

Les tests de rendu, de secours au chargement, de couleurs indépendantes et de
course multijoueur sont documentés séparément dans le rapport de validation du
projet. Cette inspection ne vaut pas à elle seule validation navigateur.
