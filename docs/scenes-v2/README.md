# Décors et loopings — validation du 7 octobre 2026

Le script `node --import tsx scripts/scenes-browser-check.ts` utilise un serveur Colyseus éphémère, un dossier de profils temporaire et **un seul contexte Chromium**. Il sélectionne les douze circuits dans le menu, photographie leurs décors, puis pilote les loopings de Sky et Foundry par commandes SDK normales.

Pour cadrer une boucle, le kart est initialement posé au sol trois mètres avant son entrée. Une place spectateur supplémentaire est ouverte uniquement dans ce salon privé d’entraînement. Les commandes font réellement atteindre les fractions 0,25 / 0,50 / 0,75 / 0,82 ; le tick de simulation est alors suspendu pour la photo et repris ensuite. Les snapshots continuent pendant la pause. Aucune altitude, orientation, fraction ou appartenance au looping n’est imposée au kart en mouvement. La sortie au sol est obtenue par la simulation normale.

Les mesures comparent la position et l’orientation rendues à la pose partagée de simulation, contrôlent l’inversion au sommet et le cadrage desktop, 390 × 844 et 667 × 375. Le cache Kenney doit effectuer une seule requête GLB depuis la même origine sur toute la page, y compris après douze changements de circuit et deux courses. Les erreurs JavaScript et réponses HTTP en erreur font échouer les assertions.

**La projection dans le cadre ne garantit pas qu’un kart est visible.** Le script marque donc la revue d’images comme `pending` après les assertions. La validation globale n’est acquise qu’après inspection effective des captures.

Le [diagnostic initial](diagnostic-initial/validation.json), conservé avec ses 22 captures, a précisément révélé ce cas : assertions mathématiques correctes mais kart occulté par la chaussée au sommet, rayures causées par les surfaces superposées, panoramas coupés et brouillard trop proche. Son statut global reste `passed: false`.

## Preuves finales par périmètre

**Panoramas du build courant :** [branches-final/validation.json](branches-final/validation.json), bundle `index-wc3mK_Sw.js` / `index-DhaT9t6d.css`. **14/14 contrôles automatisés et revue visuelle des 12 images validés**, aucune erreur JavaScript/HTTP et une seule requête du GLB Kenney. Les rayures résiduelles des bifurcations Harbor, Foundry et Castle ont disparu. Cette passe ne rejoue aucune course ni aucun looping.

| Circuit | Capture du build courant |
| --- | --- |
| Île des Alizés | [Lagon](branches-final/lagon-overview.png) |
| Canyon solaire | [Canyon](branches-final/canyon-overview.png) |
| Banquise boréale | [Glacier](branches-final/glacier-overview.png) |
| Métropole néon | [Néon](branches-final/neon-overview.png) |
| Mangrove sinueuse | [Mangrove](branches-final/mangrove-overview.png) |
| Dunes de cuivre | [Dunes](branches-final/dunes-overview.png) |
| Caldeira ardente | [Volcan](branches-final/volcan-overview.png) |
| Forêt des géants | [Forêt](branches-final/forest-overview.png) |
| Port des cargos | [Port](branches-final/harbor-overview.png) |
| Archipel céleste | [Archipel](branches-final/sky-overview.png) |
| Fonderie des pistons | [Fonderie](branches-final/foundry-overview.png) |
| Citadelle royale | [Citadelle](branches-final/castle-overview.png) |

Reproduction de ce périmètre :

```sh
DESTINATION=docs/scenes-v2/branches-final node --import tsx scripts/scenes-browser-check.ts --panoramas-only
```

**Loopings :** la preuve reste celle du bundle `index-Dh7OcoeP.js` / `index-BgIIk5rT.css`, dans [validation.json](validation.json). Les deux boucles sont parcourues par commandes ordinaires et leurs **12 images ont passé la revue visuelle**. Le code de la physique, du maillage et de la caméra des loopings est inchangé depuis cette passe. Le rapport conserve honnêtement son statut global `passed: false` : ses panoramas intermédiaires contenaient les défauts de branches corrigés ensuite. Ses anciens PNG de panorama restent un diagnostic, pas les images du build courant.

| Looping | Montée | Sommet | Descente | Sortie 0,82 | Sommet mobile |
| --- | --- | --- | --- | --- | --- |
| Archipel céleste | [0,25](sky-loop-ascent.png) | [0,50](sky-loop-inverted.png) | [0,75](sky-loop-descent.png) | [0,82](sky-loop-exit-turn.png) | [390 × 844](sky-loop-inverted-390x844.png), [667 × 375](sky-loop-inverted-667x375.png) |
| Fonderie | [0,25](foundry-loop-ascent.png) | [0,50](foundry-loop-inverted.png) | [0,75](foundry-loop-descent.png) | [0,82](foundry-loop-exit-turn.png) | [390 × 844](foundry-loop-inverted-390x844.png), [667 × 375](foundry-loop-inverted-667x375.png) |

Les [contrôles mobiles et deux fixtures de visibilité ciblées](../MOBILE_CONTROLS.md) sont validés séparément sur le build courant. Le bilan global de livraison est dans [VALIDATION.md](../../VALIDATION.md).

Ces essais ne remplacent pas une course complète ni un essai sur deux ordinateurs ou un téléphone physique. SwiftShader ne mesure pas les performances GPU réelles.
