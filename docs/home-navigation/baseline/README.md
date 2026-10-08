# Accueil avant refonte

Captures du déploiement local `http://127.0.0.1:3000`, le 7 octobre 2026. Chromium, résolution CSS indiquée dans le nom du fichier, zoom 100 %, rendu logiciel. Les mutations `/api/**` sont bloquées dans le navigateur pour ne créer ni profil, ni salon, ni circuit. Le classement affiche donc son état invité ; les positions des éléments restent mesurables.

| Taille | Problème constaté à l'ouverture |
| --- | --- |
| 1827 × 860 | Catalogue avec défilement interne et rangée coupée ; accueil lui-même défilant. |
| 1366 × 768 | Description et caractéristiques du circuit sous la zone visible. |
| 1024 × 768 | Description et caractéristiques du circuit sous la zone visible. |
| 320 × 568 | Aucun nom ni résumé du circuit actif ; informations secondaires coupées. |
| 390 × 844 | Aucun nom ni résumé du circuit actif ; catalogue sous les actions et options. |
| 568 × 320 | Créer, rejoindre, entraînement et changement de circuit sous la zone visible. |

Les mesures dans `validation.json` comparent les rectangles des éléments à la fenêtre et au menu qui les découpe. Le `body` de hauteur nulle n'est pas traité comme une zone de découpage, car son contenu utilise des positions fixes. La recherche historique `online-panel` ne correspond pas au composant présent : cette entrée est signalée manquante et ne constitue pas une preuve de défaillance du panneau des joueurs.

Le défaut principal est la juxtaposition d'une longue colonne d'actions et d'une bibliothèque complète, avec plusieurs défilements et une fiche de circuit repoussée en dessous. La validation après refonte doit garder ensemble les actions de jeu, le classement et le circuit actif ; isoler les réglages ; et rendre le catalogue consultable et confirmable au clavier comme au toucher.
