# Lisio (ex-Dashboards IA) — prototype

SaaS de génération de tableaux de bord à partir de fichiers Excel et CSV. L'IA (Claude) conçoit le dashboard **sur des données pseudonymisées** ; le backend vérifie sa proposition, calcule chaque chiffre sur les vraies données et restitue le dashboard **en clair**.

> Prototype : n'importez que des données fictives. Le traitement IA passe par l'API Anthropic, qui n'est pas hébergée en UE. La bascule vers Vertex AI (région UE) ou Bedrock (Paris / Francfort) est prévue avant tout usage sur des données clients.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseigner PSEUDONYMIZATION_KEY et, si souhaité, ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Sans `ANTHROPIC_API_KEY`, l'application fonctionne en **mode démonstration** : un concepteur déterministe reçoit le même contexte pseudonymisé que Claude et renvoie le même format. Le bouton « Essayer avec le fichier de démonstration » charge `public/demo/ventes-demo.csv` (données entièrement fictives, régénérables avec `node scripts/generate-demo-data.mjs`).

Vérifications : `npm run typecheck`, `npm run lint`, `npm test`.

## Comptes, organisations et sauvegarde (sprint 2)

- **Authentification Supabase** (email + mot de passe) : inscription avec confirmation par email, connexion, mot de passe oublié, réinitialisation (les autres sessions sont fermées), déconnexion. Mot de passe de 12 caractères minimum, messages d'erreur qui ne révèlent pas quels comptes existent, redirections limitées aux chemins internes.
- **Organisations** : à l'inscription, une organisation est créée et l'utilisateur en devient propriétaire (rôles : propriétaire, administrateur, éditeur, lecteur).
- **Dashboards enregistrés** : chaque dashboard généré est sauvegardé dans l'organisation (`/dashboards`). Le fichier importé n'est **jamais conservé** : seul le résultat est stocké.
- **Isolation** : RLS PostgreSQL sur toutes les tables (`supabase/migrations`). Test d'isolation entre deux organisations : `supabase/tests/isolation.sql`.
- **Journal des appels IA** (`ai_calls`) : fournisseur, modèle, mode, nombre de jetons. Jamais le contenu.
- La clé de pseudonymisation est dérivée **par organisation** : deux clients n'obtiennent jamais les mêmes jetons.

### Téléchargement du dashboard (US-09)

- **PDF** : bouton « PDF » → impression du navigateur, choisir « Enregistrer au format PDF ». Mise en page A4 dédiée : navigation, formulaire et panneau technique masqués, calcul de chaque KPI affiché en clair, graphiques sans animation pour être capturés complets.
- **Excel** (`/api/dashboards/[id]/export?format=xlsx`) : onglet *Synthèse* (organisation, fichier source, dates de création et d'export, KPI avec leur calcul, constats et leur statut de vérification), un onglet par graphique avec ses valeurs, onglet *Données et confidentialité*.
- **CSV** (`?format=csv`) : KPI et valeurs des graphiques, séparateur `;`, virgule décimale, formules neutralisées.
- Les exports passent par la session de l'utilisateur : la RLS empêche d'exporter le dashboard d'une autre organisation.

### Configuration Supabase à faire dans le tableau de bord

Authentication → URL Configuration :
- *Site URL* : l'URL de production (ex. `https://dashboards-ia-creetacrea.vercel.app`) ;
- *Redirect URLs* : ajouter `https://dashboards-ia-creetacrea.vercel.app/auth/confirm` et `http://localhost:3000/auth/confirm`.

Authentication → Sign In / Providers → Email : *Minimum password length* = 12, et laisser *Confirm email* activé. Le contrôle est aussi fait par l'application, mais la règle doit être imposée par Supabase pour ne pas pouvoir être contournée.

## Le cycle de traitement

| Étape | Où | Fichier |
|---|---|---|
| 1. Import CSV / XLSX, limites (20 Mo, 200 000 lignes) | Backend | `src/lib/ingest/parse.ts` |
| 2. Profilage : types, anomalies, données personnelles et sensibles | Backend | `src/lib/ingest/profile.ts` |
| 3. **Aller** : pseudonymisation (jetons HMAC-SHA256 par organisation), agrégats, seuil de 5 lignes | Backend | `src/lib/privacy/pseudonymize.ts`, `src/lib/privacy/ai-context.ts` |
| 4. Conception du dashboard (spécification JSON en jetons) | IA | `src/lib/ai/gateway.ts`, `src/lib/ai/prompt.ts`, `src/lib/ai/spec.ts` |
| 5. Validation de la spécification | Backend | `src/lib/engine/compute.ts` (`validateSpec`) |
| 6. Calcul sur les vraies données + vérification des chiffres cités | Backend | `src/lib/engine/compute.ts` |
| 7. **Retour** : ré-identification des jetons, restitution en clair | Backend | `src/lib/pipeline.ts` |

L'interface affiche, par transparence, le traitement de chaque colonne et **la requête exacte envoyée à l'IA**.

### Traitement des colonnes

| Traitement | Exemples | Envoyé à l'IA |
|---|---|---|
| Transmise | Date, montant, région, produit | Oui |
| Jetons | Client, commercial, fournisseur | Jetons uniquement (`CLIENT_a3f91c02`) |
| Supprimée | Email, téléphone, IBAN, adresse | Non |
| Exclue | Commentaires, texte libre | Non |
| Bloquée (RGPD art. 9) | Santé, religion, opinions… | Non, et signalée |

### Modes IA

- **Standard** : structure, agrégats (groupes ≥ 5 lignes) et extrait de 15 lignes pseudonymisés.
- **Strict** : noms et types de colonnes uniquement ; l'IA conçoit la structure, le backend remplit toutes les valeurs.

### Fiabilité des chiffres

L'IA ne fournit aucune valeur affichée : KPI et graphiques sont calculés par le moteur. Chaque chiffre cité dans un constat doit être déclaré dans `citations` ; il est recalculé et le constat est marqué « Chiffres vérifiés », « À vérifier » (écart) ou « Chiffres non sourcés ».

## Configuration Claude

`src/lib/ai/gateway.ts` appelle `claude-opus-5-5` via le SDK officiel (`client.beta.messages.parse` + sortie structurée Zod), effort `medium`, avec le repli serveur `fallbacks: "default"` en cas de refus du modèle. Le repli serveur n'existe que sur l'API Anthropic directe. `AI_PROVIDER` choisit le fournisseur :

| Valeur | Traitement | Configuration |
|---|---|---|
| `vertex` | Google Cloud, région UE | `VERTEX_PROJECT_ID`, `VERTEX_REGION` (`eu` par défaut), `GOOGLE_VERTEX_CREDENTIALS` (JSON du compte de service) |
| `bedrock` | AWS Paris (`eu-west-3`) | `BEDROCK_REGION`, `BEDROCK_MODEL`, identifiants AWS de l'environnement |
| `anthropic` | API Anthropic (hors UE) | `ANTHROPIC_API_KEY` — prototypage sur données fictives uniquement |
| `demo` | aucun modèle | par défaut sans configuration |

Vérifier la disponibilité du modèle dans la région choisie avant la mise en production.

## Analyse des variations (US-10)

1. Le moteur détecte les hausses et baisses de plus de 10 % sur les indicateurs additifs : dernier mois complet contre le mois précédent, contre le même mois un an plus tôt, et trimestre glissant. Un dernier mois incomplet est écarté.
2. Chaque variation est décomposée par dimension (part de l'écart par segment, segments à contre-courant).
3. L'IA reçoit ces chiffres pseudonymisés (groupes de moins de 5 lignes retirés) et rédige constats, hypothèses (au conditionnel) et pistes d'amélioration en cas de baisse. Chaque chiffre cité est recalculé.
4. En mode strict, sans IA configurée ou en cas d'échec, les explications sont rédigées par des règles, sans modèle.
5. Les avis « Utile / Pas utile » sur les suggestions sont enregistrés dans `analysis_feedback` (RLS par organisation).

## Complétion automatique du dashboard

L'IA choisit les indicateurs clés et définit les mesures métier (marge, taux de marge…). Le moteur (`src/lib/engine/complete.ts`) ajoute ensuite tout ce que les colonnes permettent de calculer : un indicateur par colonne numérique (somme, ou moyenne pour les taux et prix unitaires), le nombre de clients, commerciaux ou produits distincts, l'évolution mensuelle de chaque mesure et la ventilation de chaque mesure par chaque dimension (jusqu'à 18 indicateurs et 48 graphiques). Les graphiques sont regroupés par section (évolutions, puis une section par dimension).

## Filtres, actualisation et historique (US-02, US-08, US-09)

- **Filtres** : période et valeurs par dimension ; tous les chiffres sont recalculés sur les lignes retenues, sans appel à l'IA. Le fichier source reste dans le navigateur et n'est lu par le serveur que le temps du calcul.
- **Actualisation** : « Mettre à jour le dashboard avec ce fichier » vérifie les colonnes et leurs types (`compatibilityProblems`), conserve KPI, graphiques et personnalisation, et n'enregistre rien en cas d'erreur : la dernière version valide reste affichée. La date de dernière actualisation réussie est affichée.
- **Historique** : chaque création et actualisation réussie est conservée dans `dashboard_versions` (ajout seul) ; une version précédente se consulte en lecture seule et se compare à la version actuelle, indicateur par indicateur.

## Fiabilité des KPI (US-03)

Chaque indicateur affiche sa définition, sa formule, la période couverte, les filtres appliqués et le nombre de lignes. Une valeur absente ou non conforme n'est jamais remplacée par zéro : elle est ignorée et signalée sur l'indicateur et dans l'export Excel.

## Marque Lisio, navigation et site web

- **Marque** : nom Lisio, symbole (axe et courbe montante) dans `src/components/lisio-logo.tsx` et `src/app/icon.svg`. Couleurs en jetons Tailwind `brand-*` (ardoise #1F3A4D) et `accent-*` (cuivre #C8743A) dans `src/app/globals.css` ; polices Bricolage Grotesque (titres), Source Sans 3 (texte) et IBM Plex Mono, servies par l'application via `next/font`. Palette des graphiques par défaut : `DEFAULT_PALETTE` (`src/lib/branding.ts`), remplacée par la charte de l'organisation si elle en a une.
- **Navigation** : trois onglets (Nouveau dashboard · Mes dashboards · Paramètres), menu « Compte » (sécurité, déconnexion). Paramètres regroupe Membres et invitations, Charte graphique, Journal d'audit et Sécurité (`SettingsShell`).
- **Page d'un dashboard** : onglets Dashboard · Partage · Historique · Données et confidentialité (`?onglet=`). Une version consultée (`?version=`) s'ouvre sur l'onglet Dashboard avec la comparaison.
- **Site web** (`site/`) : page statique responsive, polices auto-hébergées, démo navigateur intégrée dans `site/demo` (régénérer avec `npm run build:site`). Hébergé sur **Netlify** (projet `lisio`, configuration `site/netlify.toml`, aucune commande de build) : dans Netlify, *Project configuration* → *Build & deploy* → lier le dépôt GitHub `dashboards-ia`, *Base directory* `site`, *Publish directory* `.` ; chaque push sur `main` redéploie le site. Les liens « Se connecter » et « Créer un compte » pointent vers `https://dashboards-ia-creetacrea.vercel.app` : à remplacer dans `site/index.html` le jour où l'outil a son domaine.

## Renommer un dashboard

Depuis « Mes dashboards » ou la page d'un dashboard, les éditeurs, administrateurs et propriétaires peuvent le renommer (1 à 120 caractères). Seule la colonne `title` change : ni les chiffres, ni la date d'actualisation, ni l'historique des versions. Le nom enregistré prime sur le titre proposé à la création, à l'écran, dans le PDF, les exports, le lien partagé et après une actualisation. Chaque renommage est inscrit au journal d'audit (ancien et nouveau nom).

## Import PDF

Un PDF produit par un logiciel ou un tableur (pas un scan) est accepté comme fichier source (`src/lib/ingest/pdf.ts`, bibliothèque `unpdf`). Le tableau est reconstruit par le moteur à partir de la position du texte, sans IA ni service externe : la ligne d'en-têtes fixe les colonnes, les en-têtes répétés sur chaque page, les lignes « Total » et les lignes hors tableau (titres, pieds de page) sont écartés et signalés dans le contrôle qualité. Un PDF sans texte, protégé ou sans tableau est refusé avec un message clair. Exemple : `public/demo/ventes-demo.pdf`, régénéré par `node scripts/make-demo-pdf.mjs`.

## Contrôle qualité du fichier (US-11)

Dès qu'un fichier est choisi, le moteur (sans IA, route `/api/qualite` ou navigateur pour la démo) repère : doublons exacts (avec l'effet sur le chiffre d'affaires avant / après), quasi-doublons (même n° de commande ou de facture, lignes différentes), cellules vides par colonne, variantes d'une même catégorie (« Nord », « nord », « NORD ») et texte dans une colonne de montants ou de dates, ligne par ligne. Chaque correction est proposée, jamais appliquée d'office : l'utilisateur coche (doublons, fusion), choisit par colonne le traitement des vides (ignorer par défaut, exclure les lignes, « Non renseigné » pour une catégorie, 0 pour un montant après confirmation) et des valeurs incohérentes. Le plan validé (`CleaningPlan`, `src/lib/quality`) est appliqué à une copie avant le profilage ; le fichier source n'est ni modifié ni conservé. Les corrections sont rappelées sur le dashboard, dans le PDF et dans les exports Excel / CSV, et rejouées à chaque filtre, question ou actualisation. Le fichier corrigé peut être téléchargé en CSV (généré à la demande, non conservé).

## Partage par lien sécurisé (US-01)

- Jeton aléatoire de 256 bits ; seul son hachage SHA-256 est enregistré (`dashboard_shares`) et le lien n'est affiché qu'à sa création.
- Activer / désactiver, niveau d'accès (consultation seule, ou consultation et téléchargement), révocation définitive (un déclencheur empêche toute réactivation).
- La page `/partage/[jeton]` lit le dashboard par la fonction `shared_dashboard` (SECURITY DEFINER, exécutable sans compte par conception) : elle ne renvoie que les résultats calculés, sans contexte envoyé à l'IA, structure ni listes de filtres. Les données sources ne sont jamais conservées. En-têtes `no-referrer` et `noindex`.

## Organisation : membres, rôles, invitations et journal d'audit (AUTH-05)

- **Rôles** : propriétaire (tous les droits), administrateur (membres, invitations, charte, journal), éditeur (crée, actualise, partage, supprime des dashboards), lecteur (consulte et télécharge).
- **Invitations** par lien (jeton de 256 bits, seul le hachage est stocké, valable 7 jours, révocable). La personne invitée se connecte avec l'adresse invitée puis ouvre le lien ; la base vérifie le jeton, l'expiration et l'adresse (`accept_invitation`).
- **Garde-fous en base** : seul un propriétaire attribue ou retire le rôle de propriétaire, l'organisation garde toujours au moins un propriétaire (`set_member_role`, déclencheur sur le retrait d'un membre).
- **Plusieurs organisations** : sélecteur dans l'en-tête (cookie de l'organisation active, vérifié à chaque requête).
- **Journal d'audit** (`audit_log`, ajout seul, lisible par propriétaire et administrateurs) : connexions, dashboards créés, actualisés, téléchargés, supprimés, partages, charte, invitations, rôles et retraits. Métadonnées uniquement, jamais de données des fichiers.
- Les fonctions `invitation_info`, `accept_invitation`, `organization_members` et `set_member_role` sont SECURITY DEFINER et appelables par les utilisateurs connectés par conception (avertissement attendu du conseiller Supabase) : chacune vérifie elle-même les droits de l'appelant.

## Questions en langage naturel (US-07)

Panneau « Poser une question » (fichier source chargé) : l'IA traduit la question en requête structurée (`QuerySchema` : mesure, regroupement, filtres, période) à partir de la question pseudonymisée (noms de clients ou de commerciaux remplacés par leurs jetons) et de la structure du fichier ; le moteur calcule sur les vraies données et la réponse est rédigée par des règles : aucun chiffre ne vient de l'IA. En mode strict, en démonstration ou si l'IA échoue, la question est interprétée par mots-clés. La requête exécutée et le texte envoyé à l'IA sont affichés.

## Double authentification (AUTH-04)

Page « Sécurité du compte » (clic sur l'adresse dans l'en-tête) : activation par application TOTP (QR code puis premier code), désactivation depuis une session déjà vérifiée. Une fois activée, un code est demandé après le mot de passe (`/connexion/verification`) ; le proxy redirige toute page, les API refusent la session, et des politiques RLS restrictives (`private.mfa_ok()`) bloquent l'accès aux données tant que la session n'est pas au niveau aal2. Activation, désactivation et connexions sont journalisées.

## Disposition et PDF

- **Glisser-déposer** : poignée ⠿ (au survol d'un graphique) à déposer sur un autre graphique. « Par sections » : déplacement dans la section ; « Libre » : une seule grille où chaque graphique va n'importe où. La grille comble automatiquement les espaces vides (`grid-flow-row-dense`).
- **PDF (pages A4)** : impression classique. **PDF une page A4** : tout réduit sur une page paysage. **PDF continu** : une seule page aux dimensions du dashboard, mise en page figée telle qu'à l'écran, à faire défiler de haut en bas et de gauche à droite.

## Liens envoyés (partage, invitations)

Les liens sont construits à partir de `NEXT_PUBLIC_SITE_URL` (adresse de production), jamais de l'adresse affichée : un lien créé depuis une adresse de prévisualisation Vercel (`…-git-…` ou `…-<hash>-….vercel.app`), protégée par la « Deployment Protection » de Vercel, obligerait le destinataire à se connecter à Vercel. Sans `NEXT_PUBLIC_SITE_URL`, un avertissement s'affiche sur une adresse de prévisualisation.

## Charte graphique

Page « Charte graphique » (propriétaire ou administrateur) : import du logo (PNG, JPEG, WebP ou SVG, réencodé en PNG redimensionné dans le navigateur, sans script ni métadonnées), couleurs détectées automatiquement dans le logo puis ajustables. Logo et couleurs s'appliquent à tous les dashboards de l'organisation : écran, PDF, export Excel (logo et en-têtes) et liens partagés. Une couleur trop claire est assombrie pour les textes (contraste ≥ 4,5:1) ; les couleurs de signification (hausse, baisse, alertes) ne changent pas.

## Personnalisation de l'affichage

« Personnaliser l'affichage » permet de cocher les indicateurs, graphiques et sections à afficher (constats, analyse des variations, et dans l'analyse : explications et/ou suggestions). Chaque graphique peut changer de type (barres, courbe, secteurs, tableau) et masquer des catégories ou des périodes. Les valeurs ne sont jamais recalculées : on masque, on ne modifie pas. La sélection s'applique au PDF et aux exports Excel / CSV (paramètre `vue`, positions des catégories uniquement, jamais leurs noms).

Sur un dashboard enregistré, l'affichage choisi par un éditeur (propriétaire, administrateur ou éditeur) est enregistré avec le dashboard (colonne `dashboards.display`, validée par `ViewSchema`, action `saveDashboardView`) et le suit sur tous ses appareils. Les **lecteurs** de l'organisation et le **lien de partage** voient exactement cet affichage (indicateurs, graphiques, catégories et sections masqués, ordre, tailles, types de graphique, mise en page), sans les commandes de personnalisation. Pour le lien de partage, la fonction `shared_dashboard` renvoie l'affichage et le serveur l'applique (`applyView`) avant l'envoi : ce qui est masqué n'atteint jamais le navigateur du lecteur ni ses téléchargements Excel / CSV. Une sélection mémorisée auparavant dans le navigateur est reprise et enregistrée à la première ouverture du dashboard.

**Affichage habituel (US-13).** La case « Utiliser cet affichage pour mes prochains dashboards » (cochée par défaut) enregistre les réglages de l'utilisateur dans `display_preferences` (une ligne par utilisateur, RLS : chacun ne lit et ne modifie que la sienne). Seuls des réglages indépendants du fichier sont retenus (`src/lib/preferences.ts`) : mise en page, disposition, taille par défaut des graphiques, type préféré pour les évolutions et pour les répartitions, sections affichées ; jamais de catégorie, d'indicateur masqué ni d'identifiant. À la création, `/api/dashboard` les applique d'office ; un bandeau l'indique, avec « Revenir à l'affichage standard » (ce dashboard seulement). Les dashboards existants ne changent pas.

## Ajout de données (US-12)

« Ajouter des données » (à côté de « Remplacer les données par ce fichier ») fusionne le fichier de la version en cours et un nouveau fichier qui le recoupe, par le moteur et sans IA (`src/lib/merge.ts`, route `/api/dashboards/[id]/ajout`) :

- une ligne identique à une ligne du fichier précédent est « déjà présente » et ignorée (valeurs comparées quel que soit le format : « 12,5 » = « 12.5 », « 15/01/2024 » = « 2024-01-15 ») ;
- si une colonne d'identifiant unique existe (n° de commande, de facture…), une ligne au même identifiant mais aux valeurs différentes est « modifiée » ; l'utilisateur garde la nouvelle valeur (par défaut) ou l'ancienne ;
- le récapitulatif montre lignes déjà présentes, nouvelles, modifiées, période et indicateurs (montants d'abord) avant / après ; le contrôle de compatibilité (US-02) s'applique au nouveau fichier ; les corrections du contrôle qualité sont rejouées sur le résultat fusionné ;
- la validation crée une version « Ajout : n ligne(s) » dans l'historique et télécharge le fichier fusionné (CSV), à conserver pour le prochain ajout.

Lisio ne conserve aucun fichier : il reconnaît le fichier de la version en cours par son empreinte (`source_fingerprint`, HMAC-SHA-256 du contenu canonique avec une clé propre à l'organisation, dérivée de `PSEUDONYMIZATION_KEY`), enregistrée à la création, au remplacement et à l'ajout. Un dashboard antérieur à l'empreinte peut recevoir un ajout, avec un avertissement. Changer `PSEUDONYMIZATION_KEY` invalide les empreintes : le prochain ajout de chaque dashboard sera alors refusé ; remplacez une fois les données pour repartir d'une empreinte valide.

## Limites connues du prototype

- Une seule organisation par utilisateur ; l'invitation de membres et la gestion des rôles dans l'interface arrivent au sprint suivant.
- Double authentification (TOTP) et journal d'audit : sprint suivant.
- La détection des colonnes identifiantes repose sur le nom et le format des colonnes ; le texte libre est exclu en attendant une détection d'entités (Presidio).
- Le seuil de petits groupes ne protège pas contre les déductions par différence (total − groupes affichés) ; à traiter avant les données RH.
- Pas encore de filtres interactifs sur les données (recalcul par période ou segment) ni de réimport : sprint 4.
