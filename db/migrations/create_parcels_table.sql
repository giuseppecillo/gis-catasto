/* Cadastral Parcels - GIS Catasto */
CREATE TABLE IF NOT EXISTS parcels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  comune text NOT NULL DEFAULT '',
  comune_codice text NOT NULL DEFAULT '',
  foglio text NOT NULL DEFAULT '',
  particella text NOT NULL DEFAULT '',
  coltura text,
  superficie_ha numeric,
  geometry jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE parcels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_parcels" ON parcels;
CREATE POLICY "anon_select_parcels" ON parcels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_parcels" ON parcels;
CREATE POLICY "anon_insert_parcels" ON parcels FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_parcels" ON parcels;
CREATE POLICY "anon_update_parcels" ON parcels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_parcels" ON parcels;
CREATE POLICY "anon_delete_parcels" ON parcels FOR DELETE TO anon, authenticated USING (true);
