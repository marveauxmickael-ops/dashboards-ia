-- US-12 : ajout de données. Empreinte (HMAC) du fichier source de chaque version, pour reconnaître le fichier
-- de la version en cours sans en conserver le contenu ; libellé de version (« Ajout : 120 lignes »).
alter table public.dashboards
  add column source_fingerprint text check (source_fingerprint ~ '^[0-9a-f]{64}$');
alter table public.dashboard_versions
  add column source_fingerprint text check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  add column label text check (char_length(label) <= 120);
