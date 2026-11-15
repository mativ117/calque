# Calque

**Du PDF au Word, en toute confidentialité.**

Calque transforme vos PDF et scans en documents Word, simplement et en toute confidentialité. Les images PNG/JPEG de documents sont également acceptées. Le résultat contient du texte modifiable avec une présentation encore simplifiée, à vérifier page par page.

Un seul fichier d’entrée, aucun choix de mode, aucune entrée Word. Le traitement se fait dans le navigateur ; les documents et le texte ne sont pas envoyés à un serveur.

## Ce que cette version fait

- PDF jusqu’à 150 pages, fichier jusqu’à 50 Mo ; PNG/JPEG jusqu’à 40 millions de pixels. Vérification du format par le contenu, refus des documents illisibles ou protégés.
- Extraction du texte des PDF. Lecture automatique des pages sans texte exploitable ou contenant des images, y compris les PDF mixtes. Les encodages manifestement invalides déclenchent aussi la lecture de la page rendue.
- Reconnaissance simultanée français, anglais et néerlandais. La langue du site ne limite pas celle du document et le contenu n’est pas traduit. Interface, erreurs, alertes et notes Word dans les trois langues.
- Lecture des images avec orientation EXIF du navigateur ; commandes pour tourner chaque page avant conversion. Ajustement du contraste lorsque les niveaux s’y prêtent, correction de légère inclinaison par Tesseract et essais de quarts de tour si la première lecture est peu convaincante. Ces corrections ne sont ni systématiques ni garanties.
- Alertes heuristiques pour page sombre, faible contraste, flou possible et petite image. Les seuils sont des indications, pas des mesures de fidélité certifiées.
- Mots reconnus avec une confiance inférieure à 85/100 (ou sans score valide) surlignés en jaune. Page sans texte reconnue signalée explicitement.
- Signalement des éléments PDF détectés mais non reconstruits : dessins, lignes, images, annotations ou champs. Un PDF contenant une image est relu dans son ensemble pour limiter la perte de texte contenu dans cette image.
- Comparaison page par page : **original rendu** à gauche, **texte récupéré** à droite, avec mots incertains surlignés. Ce panneau ne simule pas la mise en page de Microsoft Word. Une rotation après conversion invalide le résultat pour le recréer avec le réglage.
- Vérification du ZIP/CRC, des fichiers Word requis, du XML et d’une section de sortie par page source avant d’offrir le téléchargement. Une erreur de structure empêche le téléchargement.

## Limites importantes

**Le moteur de reconstruction reste à développer.** La sortie contient du texte modifiable avec une présentation simplifiée ; elle ne recrée pas encore de tableaux Word, illustrations, graphiques, colonnes ou mises en page complexes. Les notes et alertes ne corrigent pas cette limitation. Des éléments non détectés peuvent également manquer. Le Word ne doit pas être présenté comme une copie fidèle de l’original.

Les photos de documents en PNG/JPEG sont acceptées, mais la correction de perspective, des reflets, des ombres locales et des pages courbées n’est pas implémentée. Photographier une page plane, bien cadrée et uniformément éclairée. HEIC, TIFF, SVG et Word ne sont pas acceptés. Les langues autres que français, anglais et néerlandais peuvent fonctionner pour le texte natif d’un PDF selon son encodage ; elles ne sont pas prises en charge pour la lecture d’images.

La vérification de structure ne certifie ni la pagination réelle après ouverture dans Word, ni l’exhaustivité du contenu, ni l’apparence. L’aperçu original est produit par PDF.js : il n’est pas un contrôle indépendant de ce moteur. Les tests sont synthétiques ; **un corpus réel anonymisé et une validation visuelle sous Microsoft Word restent à constituer**. Voir `tests/corpus/README.md`.

## Confidentialité et sécurité

- Aucun envoi du document ou du texte à un serveur. Requêtes de lecture uniquement pour les composants du site, tous servis avec le site.
- Pas d’historique applicatif, télémétrie, cookies de suivi, localStorage, sessionStorage, IndexedDB ou service worker. Le cache persistant Tesseract est désactivé.
- Source, images de travail, texte et Word conservés en mémoire dans l’onglet. Remplacement/retrait du document ou fermeture de l’onglet libère les références ; la mémoire n’est pas effacée de façon cryptographique.
- PDF.js : évaluation de code et XFA désactivés. Les liens et les pièces jointes ne sont pas transférés dans le Word. Les annotations ou champs détectés déclenchent un avertissement.
- CSP : scripts et connexions même origine, WebAssembly autorisé, pas d’objet intégré ni d’envoi de formulaire. Aucun composant externe n’est chargé pendant une conversion. Les workers Blob sont permis pour la compatibilité du moteur PDF.
- Les modèles OCR officiels `tessdata_fast` 4.1.0 sont téléchargés à la construction, vérifiés par SHA-256 puis hébergés avec le site. Licences et provenance sont conservées.

GitHub Pages et les intermédiaires peuvent journaliser les connexions au site. Navigateur, mémoire virtuelle, téléchargements, antivirus et outils d’entreprise échappent à Calque. Choisir un dossier non synchronisé pour garder le Word local. Le chargement du site et de ses composants nécessite une connexion ; ce n’est pas une installation hors ligne. Aucune porte dérobée n’a été ajoutée au code applicatif ; aucun audit indépendant des dépendances ou garantie absolue de sécurité n’est fourni.

## Développement et publication

Node.js 22 ou 24 :

```sh
npm ci
npm run build
npm run dev
```

La construction prépare les ressources PDF/OCR et écrit le site statique dans `dist/`. Aucun backend, clé secrète ou compte utilisateur n’est nécessaire. Les fichiers générés et les données d’essai sont exclus du dépôt.

La publication GitHub Pages est automatique après validation du workflow sur `main`, ou par lancement manuel. Source **GitHub Actions** dans Settings → Pages. Adresse : https://mativ117.github.io/calque/

Les actions sont verrouillées par SHA. Permissions par job : lecture du dépôt et des métadonnées Pages pour la construction ; publication Pages et OIDC pour le déploiement. La CSP meta ne permet pas `frame-ancestors` et GitHub Pages ne permet pas d’en-têtes arbitraires.

## Langues

Sélecteur français/English/Nederlands ; préférence initiale du navigateur, repli français. `?lang=fr`, `?lang=en`, `?lang=nl` choisissent explicitement, sans stockage local. Le changement de langue conserve la source mais libère un résultat existant pour recréer les notes dans la nouvelle langue. Changement désactivé pendant la conversion.

Les chaînes sont dans `src/i18n.js` et `src/document-messages.js`. Les licences tierces gardent leur texte original.

## Tests

```sh
# Avec Chromium système sous Linux :
npm test
# Ou avec le navigateur Playwright (CI) :
npx playwright install --with-deps chromium
CI=1 npm test
```

`CHROMIUM_PATH` peut désigner un autre binaire. Les tests génèrent des documents fictifs uniquement. Ils couvrent notamment : sources de dimensions différentes, JPEG/PNG, scan multilingue, image sombre, image de petite taille, rotation, page vide, tableau non reconstruit signalé, mauvais format, fichier invalide, annulation, limites de pixels, comparaison, traduction et contrôle de structure Word.

Le test de confidentialité observe les requêtes même origine et GET/HEAD uniquement ; localStorage, sessionStorage et IndexedDB restent vides. Les captures vont dans `tests/interface-*.png`, hors du dépôt. Cela ne remplace pas un audit ou un essai sur un corpus réel.
