# Conduite, enchaînements et entraide

Les commandes et les huit objets existants sont conservés. La simulation serveur
accorde les nouveaux avantages ; le client prédit seulement le mouvement et lit
le dernier retour autoritaire dans `Kart.fun`. Les historiques de récompenses
restent dans des `WeakMap`, hors des snapshots réseau. `cloneKartForPrediction`
isole les sous-objets mutables pour ne pas modifier un état reçu du serveur.

## Valeurs et garde-fous

| Mécanique | Effet | Limites |
| --- | --- | --- |
| Frôlement | Un contact tangentiel garde environ 98 % de la vitesse, un choc frontal environ 20 %. | Après 0,22 s de contact accumulé, plafond à 72 % de la vitesse normale ; suppression du turbo et de la charge de drift. L'accotement conserve son ralentissement. Le message « Frôlement » n'accorde aucun turbo. |
| Enchaînement | Drift relâché après 0,65 s de charge, décollage depuis un vrai tremplin, boucle complète vers l'avant, réception alignée après au moins 0,2 s en l'air. | Une action de chaque type par chaîne de 8 s ; même tremplin/boucle/secteur de drift crédité une fois par tour. Choc, reset ou sortie sale interrompent la chaîne. |
| Bonus de chaîne | Actions 2, 3 et 4 : respectivement +0,18, +0,26 et +0,34 s de turbo. | Total supplémentaire de 0,9 s par tour ; la chaîne ne porte pas le turbo au-delà de 1,8 s et ne réduit pas un effet plus long déjà actif. Un reset ne renouvelle ni budget ni crédits. |
| Objet de remontée | Le retard au prochain adversaire devant, calculé sur la progression validée, oriente progressivement le tirage vers les outils de déplacement entre 2,5 et 10 s d'écart. | Une adaptation au plus par tour ; aucune boîte supplémentaire. Pas d'adaptation pendant les 8 premières secondes, pour le leader ou en mode Couronne. |
| Anti-attente | Il faut 3 s de conduite réelle vers l'avant, une vitesse d'au moins 10 m/s et 20 m depuis la précédente boîte. | Deux secondes sans progression déclenchent une exclusion de 8 s, un reset une exclusion de 10 s. Reculer sous la meilleure progression connue ne crée pas de nouveau droit. Les poids ordinaires historiques restent disponibles. |
| Relais allié | Charger l'aspiration existante puis dépasser ce même allié de 2 m dans les 4 s accorde +0,35 s de turbo aux deux. | Au moins 12 m parcourus depuis la charge ; une paire une fois par tour ; deux relais maximum par pilote et par tour ; repos de 8 s ; distance ≤25 m, même sens, au sol et sans dénivelé incompatible. Le relais ne porte pas le turbo au-delà de 1,5 s. |

Le champ `fun.feedbackKind` vaut `graze`, `combo`, `relay` ou `recovery`.
`feedbackValue` donne respectivement 1, la longueur de chaîne, 1 ou le retard
arrondi en secondes. `feedbackSeq` distingue les événements ; le HUD utilise le
snapshot autoritaire pour éviter des annonces répétées après correction réseau.

Les hooks Couronne transfèrent uniquement après une attaque réellement efficace
(protection initiale/de transfert, bouclier, étoile et grâce respectés). Les tours
continuent sans finir la manche ; le chrono de 90 s termine et classe par points.
Les mètres déjà payés à un pilote ne sont pas payés une seconde fois après recul.
Les interactions des circuits utilisent leurs horodatages serveur et une géométrie
fixe, avec le même état transmis à chaque prédiction.

## Vérifications exécutées

- `node --import tsx --test tests/race-fun.test.ts tests/crown-game.test.ts` :
  20 tests réussis. Contacts réels de rails, conduite contre le rail, message sur
  accotement, copies de prédiction, drift réellement chargé, tremplin/réception,
  boucle complète, répétition après reset, six tremplins conduits sur un même tour
  avec mesure du plafond de 0,9 s, tirages selon l'écart, attente/recul/reset,
  aspiration et dépassement réels entre alliés, protections et score Couronne,
  victoire d'un joueur actif devant un ancien haut score déconnecté.
- La manche Couronne de test est conduite par les commandes normales d'un CPU :
  il dépasse réellement le nombre de tours habituel, puis termine à 90 s. Aucune
  arrivée n'est imposée par un mock.
- Régression simulation/objets/équipes/collisions verticales/loopings : 57 tests
  réussis avant le dernier déplacement du seul retour visuel de frôlement.
- Le contrôle TypeScript global passe lors de l'intégration racine. Le build,
  les tests réseau/navigateur et le passage public sont coordonnés séparément.

À valider en partie humaine : le ressenti et l'équilibrage avec des niveaux très
différents, notamment sur de petits écrans. Les fenêtres anti-attente limitent
les stratégies simples de farming ; elles ne prétendent pas identifier toute
stratégie volontaire de ralentissement. Aucun test sur téléphone physique n'est
revendiqué ici.
