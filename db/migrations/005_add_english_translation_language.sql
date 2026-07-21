INSERT INTO reference_values
  (group_code, code, label, sort_order, is_active, metadata)
VALUES
  ('translation_language', 'ENGLISH', 'English', 5, TRUE, '{"locale":"en"}'::JSONB)
ON CONFLICT (group_code, code) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  metadata = reference_values.metadata || EXCLUDED.metadata;
