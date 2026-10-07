# Joueurs en ligne

Le panneau de l’accueil affiche les pseudos connectés, leur nombre et ceux qui
recherchent une course classée. Chaque ligne précise l’activité : accueil,
salon, entraînement, course, spectateur, recherche ou course classée trouvée.
La liste défile si la classe compte beaucoup de joueurs.

Un joueur qui ouvre plusieurs onglets ou appareils avec le même compte est
compté une seule fois. Fermer un onglet ne fait pas disparaître ses autres
connexions. Les CPU ne sont pas comptés.

La page actualise la présence toutes les 12 secondes, également pendant une
course. Une fermeture normale signale le départ ; après une coupure brutale,
la présence de l’accueil expire en 45 secondes. La recherche classée et les
salons sont lus depuis le serveur ; observer la liste ne prolonge pas une file
abandonnée. Un message indique si la liste est temporairement indisponible.

Les présences sont temporaires en mémoire. Elles ne créent aucun fichier
supplémentaire dans `data/` ; le profil invité ou compte et sa progression
utilisent toujours le stockage existant. Le client publie seulement son battement
authentifié ; l’API renvoie les identifiants publics, pseudos et activités.
Tout passe par la même origine que le jeu et fonctionne derrière le tunnel.

Validation serveur et navigateur : voir [VALIDATION.md](../VALIDATION.md).
Les [captures et le protocole](presence/README.md) détaillent les 13 tests
serveur et les 8 parcours Chromium exécutés.
