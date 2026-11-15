# Évaluation de fidélité

## État actuel

Le dépôt contient un générateur de documents **synthétiques**, sans données personnelles. Ils exercent les contrôles fonctionnels et les régressions : lettre simple, deux formats de page, facture avec grille de tableau, scan propre, scan multilingue, page vide, images PNG/JPEG, image sombre, floue, petite ou tournée. Les tests ne mesurent pas une précision globale et ne justifient aucun pourcentage de fidélité.

Aucun corpus réel anonymisé n’a été fourni ou testé. Il ne faut pas confondre « les tests passent » et « tout document sera fidèlement converti ».

## Corpus réel à constituer localement

Utiliser uniquement des documents autorisés et anonymisés avant l’évaluation. Ne pas envoyer de données confidentielles sur GitHub ou dans une discussion. Placer les sources sous `tests/private-corpus/` (exclu du dépôt), sans rendre les exemples publics par défaut.

Inclure, pour les trois langues : courrier, facture, formulaire, document à colonnes, tableaux avec/sans bordures, cellules fusionnées, en-têtes/pieds de page, illustrations, scan propre puis dégradé, rotation, photo avec perspective ou ombre. Conserver une transcription de référence vérifiée manuellement et les caractéristiques attendues.

## Protocole de réception

1. Conserver le fichier d’origine et sa référence ; noter son origine autorisée et son anonymisation.
2. Convertir localement et ouvrir le Word dans une version identifiée de Microsoft Word. Vérifier l’absence de message de réparation.
3. Vérifier que chaque page source est représentée ; distinguer ces pages de la pagination recalculée par Word.
4. Comparer le texte à la transcription : caractères manquants/ajoutés, nombres, noms, dates et ordre de lecture. Compter séparément les erreurs signalées et celles qui n’ont pas été signalées.
5. Vérifier les zones non textuelles, champs et annotations. Pour les fonctions non implémentées (tableaux, graphiques, colonnes), constater la perte et vérifier la présence d’une alerte ; ne pas les compter comme réussies.
6. Vérifier les faux positifs et les omissions des contrôles de qualité. Une photo ou un scan sans alerte peut rester mauvais.
7. Comparer le rendu visuellement : polices, couleurs, placements, dimensions et débordements. La fidélité de présentation est actuellement hors du niveau visé, pas un critère déjà acquis.
8. Noter navigateur, appareil, mémoire disponible, langue du site, version de Calque et temps de traitement.

Un modèle CSV vierge est fourni. Il ne contient aucun résultat prérempli. Les statistiques ne seront publiées qu’avec le périmètre exact, les documents autorisés et les limites connues.
