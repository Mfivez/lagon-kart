# Compteur de tours et routes alternatives

Le défaut reproduit venait d’un écart entre le corridor praticable et la porte
de validation : les karts pouvaient rouler cinq mètres sur l’accotement, alors
que les checkpoints n’en acceptaient que deux. Passer trois mètres après le bord
visible permettait donc de rater définitivement une porte. Un départ exactement
sur le plan d’une porte pouvait également ne pas être reconnu. Les tests ajoutés
avant le correctif reproduisaient sept échecs sur les six circuits initiaux.

La validation emploie maintenant la même marge de cinq mètres que la contrainte
physique. Elle mesure l’intersection du segment parcouru avec la porte attendue,
dans le sens de la course. Elle accepte le départ sur le plan lorsqu’il y a un
mouvement vers l’avant. Une immobilité, un passage en sens inverse, une porte
sautée ou des allers-retours sur l’arrivée ne créent aucun tour.

Chaque branche ouverte possède ses propres portes physiques, alignées sur les
mêmes étapes de progression que la route principale. Un raccourci conserve donc
l’ordre obligatoire des étapes. Un segment peut franchir plusieurs portes très
proches uniquement dans l’ordre de leurs intersections. La recherche est bornée
au nombre de portes du circuit ; elle ne peut pas rejouer indéfiniment la ligne.

Le point de réapparition suit la porte réellement franchie, y compris sur une
branche. Le repositionnement n’est jamais interprété comme un déplacement à
travers les portes. Il remet aussi le kart à la hauteur de la chaussée choisie,
avec une vitesse verticale nulle. Les checkpoints utilisent X/Z : un kart
franchissant une porte pendant un saut valide bien cette étape.

## Vérifications exécutées

`node --import tsx --test tests/laps.test.ts tests/progression.test.ts tests/simulation.test.ts`
termine avec **57 tests réussis**, dont **31 tests ciblés sur les tours**.

Ces tests couvrent trois tours sur les accotements des douze circuits, chacune
des trois branches de chaque piste, le sens de passage, les portes manquées,
les déplacements de 100 ms, les oscillations à l’arrivée, les repositionnements,
le franchissement en l’air et la réapparition sur une branche élevée. Les tests
de frontière placent volontairement les karts près d’une porte ; ils vérifient
le compteur et ses protections, sans remplacer les courses continues pilotées
par les CPU ni les essais multijoueurs dans le navigateur.
