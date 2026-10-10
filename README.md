# Dashboards IA — prototype

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

## Charte graphique

Page « Charte graphique » (propriétaire ou administrateur) : import du logo (PNG, JPEG, WebP ou SVG, réencodé en PNG redimensionné dans le navigateur, sans script ni métadonnées), couleurs détectées automatiquement dans le logo puis ajustables. Logo et couleurs s'appliquent à tous les dashboards de l'organisation : écran, PDF, export Excel (logo et en-têtes) et liens partagés. Une couleur trop claire est assombrie pour les textes (contraste ≥ 4,5:1) ; les couleurs de signification (hausse, baisse, alertes) ne changent pas.

## Personnalisation de l'affichage

« Personnaliser l'affichage » permet de cocher les indicateurs, graphiques et sections à afficher (constats, analyse des variations, et dans l'analyse : explications et/ou suggestions). Chaque graphique peut changer de type (barres, courbe, secteurs, tableau) et masquer des catégories ou des périodes. Les valeurs ne sont jamais recalculées : on masque, on ne modifie pas. La sélection est mémorisée dans le navigateur et s'applique au PDF et aux exports Excel / CSV (paramètre `vue`, positions des catégories uniquement, jamais leurs noms).

## Limites connues du prototype

- Une seule organisation par utilisateur ; l'invitation de membres et la gestion des rôles dans l'interface arrivent au sprint suivant.
- Double authentification (TOTP) et journal d'audit : sprint suivant.
- La détection des colonnes identifiantes repose sur le nom et le format des colonnes ; le texte libre est exclu en attendant une détection d'entités (Presidio).
- Le seuil de petits groupes ne protège pas contre les déductions par différence (total − groupes affichés) ; à traiter avant les données RH.
- Pas encore de filtres interactifs sur les données (recalcul par période ou segment) ni de réimport : sprint 4.
