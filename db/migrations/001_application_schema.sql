CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE reference_groups (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reference_values (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES reference_groups(code) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_code, code)
);

CREATE INDEX reference_values_active_order_idx
  ON reference_values (group_code, is_active, sort_order, label);

CREATE TABLE position_taxonomy (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category_code TEXT NOT NULL,
  category_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX position_taxonomy_active_order_idx
  ON position_taxonomy (is_active, category_label, sort_order, label);

CREATE TABLE experts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  primary_position TEXT,
  expert_type_code TEXT,
  education_level_code TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX experts_primary_position_idx ON experts (primary_position);
CREATE INDEX experts_expert_type_idx ON experts (expert_type_code);
CREATE INDEX experts_data_gin_idx ON experts USING GIN (data);

CREATE TABLE tenders (
  id TEXT PRIMARY KEY,
  internal_code TEXT,
  name TEXT NOT NULL,
  client TEXT,
  deadline TIMESTAMPTZ,
  status_code TEXT,
  tender_format_code TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tenders_internal_code_idx ON tenders (internal_code);
CREATE INDEX tenders_status_deadline_idx ON tenders (status_code, deadline);
CREATE INDEX tenders_data_gin_idx ON tenders USING GIN (data);

CREATE TABLE tender_documents (
  id TEXT PRIMARY KEY,
  tender_id TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  document_type_code TEXT,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  storage_provider TEXT,
  storage_key TEXT,
  size_bytes BIGINT,
  checksum_sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tender_documents_tender_idx ON tender_documents (tender_id);

CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  tender_id TEXT,
  expert_id TEXT,
  tender_position_id TEXT,
  role_name TEXT,
  score NUMERIC(7, 3),
  risk_level_code TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX matches_tender_idx ON matches (tender_id);
CREATE INDEX matches_expert_idx ON matches (expert_id);
CREATE INDEX matches_tender_position_idx ON matches (tender_position_id);
CREATE INDEX matches_score_idx ON matches (score DESC);
CREATE INDEX matches_data_gin_idx ON matches USING GIN (data);

CREATE TABLE generated_cvs (
  id TEXT PRIMARY KEY,
  expert_id TEXT,
  tender_id TEXT,
  match_id TEXT,
  generation_mode_code TEXT,
  language_code TEXT,
  filename TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX generated_cvs_expert_idx ON generated_cvs (expert_id);
CREATE INDEX generated_cvs_tender_idx ON generated_cvs (tender_id);
CREATE INDEX generated_cvs_created_idx ON generated_cvs (created_at DESC);
CREATE INDEX generated_cvs_data_gin_idx ON generated_cvs USING GIN (data);

CREATE TABLE brandings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  header_storage_key TEXT,
  footer_storage_key TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role_code TEXT,
  status_code TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  status_code TEXT,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX activity_logs_created_idx ON activity_logs (created_at DESC);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_preferences (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE ingestion_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  draft_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ingestion_drafts_expiry_idx ON ingestion_drafts (expires_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status_code TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX jobs_status_created_idx ON jobs (status_code, created_at);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  size_bytes BIGINT,
  checksum_sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (storage_provider, storage_key)
);

CREATE INDEX files_owner_idx ON files (owner_type, owner_id);

CREATE TRIGGER reference_groups_set_updated_at
BEFORE UPDATE ON reference_groups
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER reference_values_set_updated_at
BEFORE UPDATE ON reference_values
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER position_taxonomy_set_updated_at
BEFORE UPDATE ON position_taxonomy
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER experts_set_updated_at
BEFORE UPDATE ON experts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tenders_set_updated_at
BEFORE UPDATE ON tenders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tender_documents_set_updated_at
BEFORE UPDATE ON tender_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER matches_set_updated_at
BEFORE UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER generated_cvs_set_updated_at
BEFORE UPDATE ON generated_cvs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER brandings_set_updated_at
BEFORE UPDATE ON brandings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON app_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_preferences_set_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ingestion_drafts_set_updated_at
BEFORE UPDATE ON ingestion_drafts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER jobs_set_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
