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

`src/lib/ai/gateway.ts` appelle `claude-opus-5-5` via le SDK officiel (`client.beta.messages.parse` + sortie structurée Zod), effort `medium`, avec le repli serveur `fallbacks: "default"` en cas de refus du modèle. `AI_PROVIDER` choisit le fournisseur ; `vertex` et `bedrock` sont réservés à la production UE et restent à brancher.

## Limites connues du prototype

- Pas d'authentification ni de persistance : une organisation unique (`prototype`), table de correspondance en mémoire le temps de la requête. Supabase (Auth, PostgreSQL + RLS, Storage) arrive au sprint suivant.
- La détection des colonnes identifiantes repose sur le nom et le format des colonnes ; le texte libre est exclu en attendant une détection d'entités (Presidio).
- Le seuil de petits groupes ne protège pas contre les déductions par différence (total − groupes affichés) ; à traiter avant les données RH.
- Pas encore de filtres interactifs, d'export ni de réimport.
