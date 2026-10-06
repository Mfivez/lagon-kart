# Courses en équipes et pilotes CPU

Le mode équipes oppose **Corail** et **Lagon**, quatre places par équipe, dans une
série de courses distincte des championnats de carrière. Les joueurs humains
occupent leurs places ; le salon complète les places manquantes avec des CPU.
L’affectation automatique équilibre les équipes, garde les affectations déjà
choisies et refuse une neuvième place.

## Score collectif

Le résultat d’une course accorde respectivement 15, 12, 10, 8, 6, 4, 2 et 1 point
aux pilotes arrivés ; un abandon rapporte zéro. Le classement de l’équipe est
la somme des points des quatre membres dans toutes les manches. Une déconnexion
n’efface pas les points déjà inscrits au tournoi. Les spectateurs ne contribuent
pas au score.

En cas d’égalité de points, les équipes sont départagées par leurs victoires
individuelles, le nombre d’arrivées puis la somme de leurs temps. Une égalité
parfaite reste une égalité. `teamStandings` accepte le classement cumulé du
tournoi et les affectations d’équipe ; `teamScoreRound` calcule une manche seule.
Ces fonctions produisent des résultats sans modifier le tournoi existant.

## Conduite et rôles

Les CPU envoient exactement les mêmes contrôles bornés qu’un pilote humain :
accélération, freinage, direction, objet et replacer. Ils n’ont pas de vitesse
supplémentaire, de téléportation directe ou de checkpoints accordés gratuitement.
Leur conduite réutilise `autopilot` et le guidage partagé des routes évolutives.
Ils anticipent le barrage, ralentissent et suivent la déviation disponible ; leur
progression dépend toujours des vraies portes du circuit.

Les quatre places d’une équipe répartissent les préférences : éclaireur, soutien,
protecteur et stratège. Ce sont des préférences d’usage des objets, pas des
classes avec des statistiques cachées. L’éclaireur et le stratège utilisent
l’étoile pour avancer dans les portions droites ; le soutien prépare son
bouclier à l’approche d’une déviation. Tous évitent de gaspiller une charge de
triple turbo pendant un turbo déjà actif, de jeter un disque sans adversaire
devant ou de poser un piège sans adversaire derrière. Les objets guidés attendent
un adversaire mieux placé. Le ciblage CPU exclut les coéquipiers ; la simulation
du salon applique séparément les règles d’impact entre équipes.

La difficulté change le temps de réaction aux objets : environ 0,4 seconde pour
le niveau facile, 0,1 seconde pour le niveau normal et un tick pour le niveau
expert, à 30 ticks/s. Elle ne change ni le moteur, ni la gravité, ni les règles de
classement. Les pièces du garage utilisent les mêmes caractéristiques physiques
pour les humains et les CPU.

Le profil d’un CPU ne participe pas à la progression persistante, au MMR ou aux
classements de joueurs. Le serveur exclut ces pilotes des résultats persistés.

## Tests exécutés

`node --import tsx --test tests/teams.test.ts tests/progression.test.ts` :
**21 tests réussis**, dont dix consacrés aux équipes et CPU. Huit CPU terminent
trois tours sur chacun des six circuits au niveau maximal des événements,
avec des commandes ordinaires et les objets actifs. Les tests couvrent aussi
l’équilibrage 4 contre 4, les scores, les égalités, les abandons, l’absence de
mutation des karts et les choix d’objets face aux alliés et adversaires.

Les vérifications des salons, de l’interface et du déploiement Docker restent
des étapes d’intégration séparées consignées dans le rapport principal.
