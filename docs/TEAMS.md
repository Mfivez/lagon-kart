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

Quand une fermeture apparaît, un CPU déjà au-delà du barrage termine la section
sur la route principale. Celui engagé sur une déviation, une voie turbo ou un
raccourci ouvert suit cette voie jusqu'à sa sortie ; son anticipation et sa
vitesse prennent en compte les virages de cette même voie. Il ne cherche plus
à rejoindre latéralement une autre route à travers ses rails.

Un CPU presque arrêté contre un rail fermé ou des débris peut demander la même
remise en piste qu'un humain, avec le même délai et le même dernier checkpoint.
La détection respecte les ouvertures et la hauteur réelle des murs ; elle ne
déclenche pas ce secours pendant un saut. Elle ne change pas les collisions,
les positions ou la progression directement.

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

`node --import tsx --test tests/teams.test.ts` : **16 tests réussis**. Huit CPU terminent
trois tours sur chacun des douze circuits au niveau maximal des événements,
avec des commandes ordinaires et les objets actifs. Les tests couvrent aussi
l’équilibrage 4 contre 4, les scores, les égalités, les abandons, l’absence de
mutation des karts et les choix d’objets face aux alliés et adversaires.

Les vérifications des salons, de l’interface et du déploiement Docker restent
des étapes d’intégration séparées consignées dans le rapport principal.

Le correctif du 7 octobre ajoute **29 tests**, dont 234 scénarios conduits sur
les douze circuits, les branches jusqu'à leur sortie et les conditions de
récupération contre un rail. Une matrice complémentaire de 360 placements
passe de 34 blocages avant correction à zéro après. La suite complète atteint
**312 tests réussis**, incluant les 96 arrivées CPU décrites ci-dessus.
[Résultats détaillés](cpu-obstacles/simulation-validation.json).

`npm run test:cpu-obstacles-browser` vérifie deux fermetures dans des salons
privés avec de vrais CPU serveur et un observateur Chromium : deux checkpoints
physiquement franchis à Mangrove et Citadelle, aucune erreur JavaScript ni asset
manquant. Les positions initiales sont des fixtures déclarées.
[Protocole et quatre captures](cpu-obstacles/README.md).

`BASE_URL=https://votre-tunnel npm run test:cpu-race` utilise uniquement les
API publiques et contrôle une course complète sur Mangrove : un pilote SDK
et sept CPU serveur. Exécution du 7 octobre réussie : **8/8 arrivées**, trois
phases, sept passages de déviation, **0 reset observé** et aucun blocage durable.
Le salon est libéré après le contrôle ; les résultats du pilote de test sont
réellement gagnés et enregistrés. [Rapport public](cpu-obstacles/public-race.json).
