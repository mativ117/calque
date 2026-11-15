# Calque

**Du PDF au Word, en toute confidentialité.**

Calque est un site statique qui convertit les PDF et documents scannés en Word dans le navigateur. Les documents et le texte reconnu ne sont pas envoyés à un serveur. Il fonctionne sur GitHub Pages, sans compte, API de conversion, backend ou clé secrète.

## Fonctionnalités

- **Garder l’apparence** : chaque page devient une image dans Word, aux dimensions de la page source. Rendu jusqu’à 216 dpi, limité à 12 millions de pixels par page. Texte non modifiable, fidélité limitée par la résolution.
- **Pouvoir modifier le texte** : extraction du texte et de ses tailles avec une mise en page simplifiée ; passage automatique à l’OCR sur les pages sans texte extractible.
- **Option de reprise « Relire toutes les pages comme des images »**, dans l’aide « Le texte récupéré est incomplet ? » : toutes les pages sont analysées en français, anglais et néerlandais, jusqu’à 300 dpi, avec la même limite de pixels. Le texte est produit en Arial 11 ; les polices d’origine ne sont pas reconstituées.
- Mots OCR dont le score est inférieur à **85/100**, ou sans score valide, surlignés en jaune. Bilan des pages concernées. Une page sans texte reconnu reçoit une note explicite dans le Word et le bilan.
- Téléchargement explicite du `.docx`, progression, annulation, retrait du document et interface responsive.

Le score OCR n’est pas une probabilité d’exactitude. Une erreur ou une omission peut passer sans alerte : relire le texte, en particulier les chiffres, noms et dates. Un Word entièrement modifiable et strictement identique à n’importe quel PDF ne peut pas être garanti. Colonnes, tableaux, images et positions ne sont pas reconstruits dans les modes texte/OCR.

Limites : **50 Mo, 150 pages**, dimensions de page entre 2,54 et 55,88 cm par côté, pas de PDF protégé par mot de passe. PDF uniquement, y compris scans et documents mixtes ; pas de JPEG/PNG directement. Les gros documents peuvent épuiser la mémoire disponible. Les navigateurs modernes avec WebAssembly et Web Workers sont nécessaires. Chromium a été testé ; la compatibilité complète des autres navigateurs reste à vérifier.

## Langues et compréhension

L’interface est disponible en **français, anglais et néerlandais**. Les descriptions expliquent le résultat attendu, sans jargon. Les deux choix principaux sont « Garder l’apparence » (images non modifiables) et « Pouvoir modifier le texte » (reconnaissance des scans automatique). La reprise de toutes les pages est proposée dans une aide repliable si le premier résultat est incomplet.

Le sélecteur de langue traduit la navigation, les descriptions, les erreurs, la progression, les alertes et les notes ajoutées au Word. Le PDF reste sélectionné lorsque l’utilisateur change de langue ; un éventuel résultat précédent est libéré pour pouvoir le recréer avec les notes dans la nouvelle langue. Le sélecteur est désactivé pendant la conversion.

La langue initiale suit le navigateur, avec repli français. Les liens `?lang=fr`, `?lang=en` et `?lang=nl` permettent de choisir explicitement. Cette préférence est seulement dans l’URL, sans cookie ni stockage local.

**La langue de l’interface ne limite pas celle du document.** Le moteur reconnaît simultanément les scans en français, anglais et néerlandais, y compris un document multilingue. Les PDF contenant déjà du texte sont extraits sans limitation à ces trois langues, selon les polices et encodages pris en charge par PDF.js. Calque ne traduit pas le contenu : les mots restent dans leur langue d’origine. Les notes de relecture ajoutées dans le Word sont dans la langue choisie pour le site au lancement de la conversion.

Les textes sont centralisés dans `src/i18n.js`. La complétude des traductions et leurs paramètres sont testés. Les licences tierces restent dans leur texte original.

## Développement

Node.js 22 ou 24 :

```sh
npm ci
npm run build
npm run dev
```

`build` prépare les composants PDF/OCR, puis construit le site dans `dist/`. Les modèles officiels `tessdata_fast` 4.1.0 sont téléchargés pendant la construction uniquement et vérifiés par SHA-256. Le moteur, les modèles et les ressources PDF sont ensuite tous hébergés avec le site. Les licences sont incluses avec ces ressources.

## Publication sur GitHub Pages

Le workflow `.github/workflows/pages.yml` teste, construit puis déploie le site après chaque push sur `main` ou lancement manuel. Dans **Settings → Pages → Build and deployment**, la source doit être **GitHub Actions**. Adresse prévue pour ce dépôt : https://mativ117.github.io/calque/

Le chemin relatif Vite permet le déploiement sous `/calque/`. Aucun secret applicatif à créer. Les permissions du workflow sont limitées par job : lecture du dépôt pour la construction, publication Pages et jeton OIDC uniquement pour le déploiement. Les actions sont verrouillées par SHA.

## Confidentialité et sécurité

- Aucun `fetch` documentaire, POST d’utilisateur, serveur de conversion, statistiques ou télémétrie applicative.
- Aucun stockage du document en localStorage, sessionStorage ou IndexedDB ; cache persistant Tesseract désactivé. Pas de service worker.
- PDF conservé en mémoire dans l’onglet ; résultat conservé via une URL Blob jusqu’au retrait/remplacement du document, changement de mode ou fermeture de l’onglet. Annuler interrompt la conversion mais conserve le PDF sélectionné pour permettre de réessayer.
- PDF.js est configuré avec `isEvalSupported: false` et XFA désactivé. Les liens, scripts, formulaires et pièces jointes du PDF ne sont pas exécutés intentionnellement ou transférés dans le Word.
- CSP dans la page : scripts et connexions limités à la même origine, compilation WebAssembly autorisée, pas d’objet intégré ni envoi de formulaire. Les workers Blob sont permis pour la compatibilité du moteur PDF. Les ressources OCR ont des chemins locaux explicites.
- Le chargement du site et du moteur nécessite Internet. GitHub Pages et les intermédiaires peuvent journaliser les connexions ; aucun document ne fait partie de ces requêtes. Ce site n’est pas une application hors ligne installable.
- Pas de garantie « zéro trace » : caches et téléchargements du navigateur, mémoire virtuelle, antivirus, synchronisation et outils d’entreprise échappent au site. Choisir un dossier non synchronisé pour le Word.

Aucune porte dérobée n’a été ajoutée au code applicatif. Cela ne constitue pas un audit indépendant des dépendances ou une garantie absolue de sécurité. Les PDF non fiables restent une surface d’attaque ; garder les dépendances et le navigateur à jour. La CSP en balise meta ne peut pas définir `frame-ancestors` et GitHub Pages ne permet pas d’ajouter des en-têtes de sécurité arbitraires.

## Vérification

```sh
# Installation des navigateurs de test (Linux CI) :
npx playwright install --with-deps chromium
CI=1 npm test
```

En local Linux avec Chromium installé : `npm test`. Pour un autre emplacement, définir `CHROMIUM_PATH`. Les tests génèrent uniquement des documents factices. Les captures d’interface sont produites dans `tests/`, hors du dépôt.

- Tests unitaires : traductions complètes et paramètres identiques, choix de langue, notes Word traduites sans traduction du document, mot incertain surligné, conservation du mot fiable sans surlignage, page concernée, score invalide et données OCR sans scores.
- Tests navigateur : descriptions sans jargon, rendu desktop/mobile dans les trois langues, erreurs traduites, changement de langue avec PDF conservé, scan multilingue réel et interface anglaise, deux tailles de pages, images intégrées sans lien externe, extraction du texte, OCR réel d’un scan, page sans texte reconnue, erreur sur PDF invalide et annulation.
- Le scénario OCR vérifie les requêtes : même origine uniquement, méthodes GET/HEAD uniquement ; localStorage, sessionStorage et IndexedDB restent vides.

Ces tests ne remplacent pas un audit de sécurité ou une vérification visuelle des Word dans Microsoft Word.
