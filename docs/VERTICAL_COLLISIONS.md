# Sauts et hauteur des obstacles

Les murs n’ont plus une collision infinie vers le haut. La simulation et la
prédiction du navigateur utilisent les mêmes constantes et la même trajectoire
verticale. Le booléen `airborne` ne supprime pas les collisions : la base du kart
doit réellement dépasser le sommet du mur au moment où il le franchit.

| Élément | Sommet au-dessus du sol local | Position latérale |
| --- | --- | --- |
| Rail ordinaire | 0,72 m | Bord de piste + 5 m |
| Rail de pont | 1,22 m | Bord de piste + 1,5 m |
| Poteaux des branches | 0,65 m | Corridor propre à la branche |
| Débris en caisses | 1,60 m | Zone du barrage |
| Débris rocheux | 2,40 m | Zone du barrage |

`shared/obstacle-heights.ts` expose les dimensions partagées avec le rendu, la
marge du tablier et le calcul de hauteur du sol. `trackBoundaryGap` partage avec
le rendu les ouvertures des branches effectivement ouvertes dans la phase et
le niveau actuels. Un circuit classique garde donc ses rails fermés ; le passage
d’un raccourci fermé ne s’ouvre pas prématurément. Le rail ordinaire est masqué sur les ponts, où le tablier et
son rail propre occupent la même largeur physique et visuelle.

Le passage d’un rail est recherché sur le segment parcouru, dans les deux sens.
Les barrages emploient une intersection de volumes X/Z/Y : une fin de mouvement
au-dessus du barrage n’efface pas un choc survenu plus tôt dans la même image.
Inversement, l’apparition de débris à un nouveau tour ne repousse pas un pilote
qui vole déjà au-dessus de leur sommet.

Après avoir sauté un rail, le kart peut atterrir sur le terrain extérieur. Il ne
se téléporte pas à travers le mur. Un retour au sol par un rail fermé reste
bloqué ; le pilote revient par une ouverture, par un autre saut ou avec la
commande de repositionnement. Hors d’un tablier surélevé, le sol extérieur est à
la hauteur du terrain, et non celle d’un pont invisible.
Revenir sous un pont ne remonte pas automatiquement le kart sur son tablier.
La réponse au choc conserve le glissement tangent le long d’un rail.

Les portes restent ordonnées pendant les sauts : voler au-dessus d’un obstacle
ne valide aucun checkpoint sauté et ne crée aucun tour supplémentaire.

## Vérifications

L’exécution ciblée des fichiers `vertical-collisions`, `elevation`,
`laps` et `simulation` termine avec **64 tests réussis**. Les onze tests de
collision verticale couvrent rails ordinaires et ponts, vol trop bas ou assez
haut, descente rapide, glissement tangent, sortie et atterrissage, réentrée,
passage sous un pont, hauteur finie de trois types de barrages, changement de
phase et contrôle des checkpoints. Le contrôle TypeScript du projet réussit.

Une relance ciblée après correction des ouvertures exécute **4 tests avec
succès** : ouverture selon la phase, course classique Néon, course évolutive
Néon sans repositionnement et comparaison des secteurs sur les douze pistes
avec deux configurations de kart. Les huit pilotes terminent Néon en 71,73 s
en mode classique et 70,57 s avec événements. Les 85 autres tests du filtre sont
ignorés dans cette relance ; ils ne sont pas comptés comme exécutés.

Après la suite complète **237/237**, une preuve supplémentaire utilise le vrai
tremplin de l’Archipel céleste. Le kart démarre sur sa surface à 32 m/s, puis
reçoit seulement les commandes ordinaires : `stepKart` déclenche le saut,
le kart franchit le rail latéral fermé et atterrit sur le terrain extérieur.
Aucune altitude ni aucun drapeau de vol n’est imposé pendant cette trajectoire.
Ce nouveau cas a réussi dans une exécution ciblée (**1 exécuté, 12 hors filtre**).
Il porte le catalogue à 238 tests ; il est postérieur à l’exécution complète de
237 tests et n’est pas présenté comme faisant partie de celle-ci.

Les tests sont des simulations déterministes. Les contrôles de courses CPU,
les essais SDK et les captures navigateur sont consignés séparément dans le
rapport de validation ; ils ne sont pas remplacés par ces fixtures de collision.
