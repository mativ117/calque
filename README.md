# Calque

**Du PDF au Word, en toute confidentialité.**

Calque transforme vos PDF et scans en documents Word, simplement et en toute confidentialité. Les images PNG/JPEG de documents sont également acceptées. Le résultat contient du texte modifiable avec une présentation reconstruite, à vérifier page par page.

Un seul fichier d’entrée, aucun choix de mode, aucune entrée Word. Le traitement se fait dans le navigateur ; les documents et le texte ne sont pas envoyés à un serveur.

## Ce que cette version fait

- PDF jusqu’à 150 pages, fichier jusqu’à 50 Mo ; PNG/JPEG jusqu’à 40 millions de pixels. Vérification du format par le contenu, refus des documents illisibles ou protégés.
- Extraction du texte des PDF. Lecture automatique des pages sans texte exploitable, y compris les PDF mixtes. Les encodages manifestement invalides déclenchent aussi la lecture de la page rendue.
- Reconnaissance simultanée français, anglais et néerlandais. La langue du site ne limite pas celle du document et le contenu n’est pas traduit. Interface, erreurs, alertes et notes Word dans les trois langues.
- Lecture des images avec orientation EXIF du navigateur ; commandes pour tourner chaque page avant conversion. Ajustement du contraste lorsque les niveaux s’y prêtent, correction de légère inclinaison par Tesseract et essais de quarts de tour si la première lecture est peu convaincante. Ces corrections ne sont ni systématiques ni garanties.
- Alertes heuristiques pour page sombre, faible contraste, flou possible et petite image. Les seuils sont des indications, pas des mesures de fidélité certifiées.
- Mots reconnus avec une confiance inférieure à 85/100 (ou sans score valide) surlignés en jaune. Page sans texte reconnue signalée explicitement.
- Texte natif replacé dans des zones Word modifiables : positions, tailles, couleurs et styles. Les photos, fonds et traits restent dans une couche image séparée, sans texte aplati. Une petite photo ne déclenche plus la reconnaissance de toute la page. Le texte contenu uniquement dans une petite illustration peut manquer.
- Alertes dans le bilan et les commentaires Word, sans ajout dans le contenu des pages. Annotations et champs signalés.
- Comparaison page par page : **original rendu** à gauche, **texte récupéré** à droite, avec mots incertains surlignés. Ce panneau ne simule pas la mise en page de Microsoft Word. Une rotation après conversion invalide le résultat pour le recréer avec le réglage.
- Vérification du ZIP/CRC, des fichiers Word requis, du XML et d’une section de sortie par page source avant d’offrir le téléchargement. Une erreur de structure empêche le téléchargement.

## Limites importantes

Le texte natif est placé dans des zones indépendantes pour préserver les colonnes. Les polices peuvent être remplacées par des équivalents ; des modifications longues peuvent nécessiter de déplacer ou agrandir une zone. Les visuels sont une couche image, non modifiables individuellement ; les tableaux ne deviennent pas de vrais tableaux Word. Pour les scans, les positions sont estimées et les illustrations ne sont pas reconstruites. Une fidélité parfaite à tout PDF n’est pas garantie.

Les photos de documents en PNG/JPEG sont acceptées, mais la correction de perspective, des reflets, des ombres locales et des pages courbées n’est pas implémentée. Photographier une page plane, bien cadrée et uniformément éclairée. HEIC, TIFF, SVG et Word ne sont pas acceptés. Les langues autres que français, anglais et néerlandais peuvent fonctionner pour le texte natif d’un PDF selon son encodage ; elles ne sont pas prises en charge pour la lecture d’images.

La vérification de structure ne certifie ni la pagination réelle après ouverture dans Word, ni l’exhaustivité du contenu, ni l’apparence. L’aperçu original est produit par PDF.js : il n’est pas un contrôle indépendant de ce moteur. Les tests publics sont synthétiques, dont un CV fictif à deux colonnes avec photo et fonds. Une comparaison privée sur un CV réel a été effectuée via LibreOffice, sans publier le document ; une validation sous Microsoft Word reste nécessaire. Voir `tests/corpus/README.md`.

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


## Documents longs : limites et gestion mémoire

Les limites restent **50 Mo par fichier et 150 pages par PDF**. L’aide de l’interface distingue la taille du fichier du nombre de pages et explique que le contenu et l’appareil influencent le coût du traitement. Une réussite sur un document ne garantit pas les mêmes capacités sur un autre.

- Conversion de toutes les pages par défaut ; intervalle facultatif pour travailler par étapes, sans modifier la source. Le Word partiel, son nom et le bilan indiquent l’intervalle ; les notes conservent les numéros source. Les pages non incluses sont explicitement signalées dans la comparaison.
- Lecture FileReader annulable dès l’ouverture. L’annulation pendant la conversion se produit au prochain point de contrôle ; l’assemblage ZIP final n’est pas un processus immédiatement interruptible.
- Progression par page source, nombre de pages sélectionnées traitées et temps écoulé réel, sans estimation artificielle de la durée restante.
- Rendu de l’aperçu uniquement pour la page consultée ; images de travail libérées après chaque page. Nettoyage PDF global demandé toutes les huit pages, moteur de lecture recréé après douze pages scannées si d’autres pages restent.
- Objets de construction du Word libérés avant la validation ; XML vérifié progressivement avec le lecteur sax déjà utilisé par les dépendances, sans construire un arbre DOM pour tout le document.
- Garde-fou supplémentaire de 2 000 000 unités UTF-16 de texte par conversion, pour limiter les documents anormalement denses. Un dépassement demande un intervalle plus court ou une copie plus légère. Ce garde-fou ne garantit pas l’absence d’épuisement mémoire.

Les scénarios synthétiques comprennent un PDF texte de 150 pages avec vérification de chaque identifiant de page, le refus de 151 pages, un intervalle de trois pages avec contrôle de numérotation, l’annulation d’une lecture lente et un scan de treize pages qui franchit le renouvellement du moteur. Les durées sont consignées dans les logs des tests, pour l’environnement de test uniquement. Ils ne constituent pas un benchmark sur les appareils des utilisateurs ni une validation de 150 pages scannées.
