-- Anlagen-Bucket absichern.
--
-- Die erste Fassung erlaubte jedem angemeldeten Benutzer, den gesamten
-- Bucket zu lesen, zu überschreiben und zu LÖSCHEN — unabhängig davon, wem
-- die Rechnung gehört. Die Tabellen-RLS war korrekt, die Dateien lagen offen.
--
-- Die Dateien liegen unter '<invoice_id>/<datei>'. Damit lässt sich der
-- Zugriff an dieselbe Bedingung knüpfen wie die Tabelle: Wer die Rechnung
-- sehen darf, darf auch ihre Anlagen sehen.

DROP POLICY IF EXISTS "Auth users can read invoice-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload invoice-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can update invoice-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete invoice-attachments" ON storage.objects;

-- Hilfsbedingung als Funktion, damit alle vier Policies identisch bleiben.
CREATE OR REPLACE FUNCTION public.darf_auf_rechnungsanlage_zugreifen(objektname TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id::text = (storage.foldername(objektname))[1]
      AND (i.user_id = auth.uid() OR public.has_role(auth.uid(), 'administrator'::app_role))
  );
$$;

COMMENT ON FUNCTION public.darf_auf_rechnungsanlage_zugreifen(TEXT) IS
  'Prüft anhand des Storage-Pfads <invoice_id>/<datei>, ob der aufrufende Benutzer die zugehörige Rechnung sehen darf. SECURITY INVOKER: die RLS von invoices greift mit.';

-- Idempotent: auch die neuen Namen vorher wegräumen, damit ein zweiter
-- Durchlauf nicht an "policy already exists" scheitert.
DROP POLICY IF EXISTS "Read invoice-attachments of accessible invoices" ON storage.objects;
DROP POLICY IF EXISTS "Upload invoice-attachments to accessible invoices" ON storage.objects;
DROP POLICY IF EXISTS "Update invoice-attachments of accessible invoices" ON storage.objects;
DROP POLICY IF EXISTS "Delete invoice-attachments of accessible invoices" ON storage.objects;

CREATE POLICY "Read invoice-attachments of accessible invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND public.darf_auf_rechnungsanlage_zugreifen(name)
  );

CREATE POLICY "Upload invoice-attachments to accessible invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-attachments'
    AND public.darf_auf_rechnungsanlage_zugreifen(name)
  );

CREATE POLICY "Update invoice-attachments of accessible invoices"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND public.darf_auf_rechnungsanlage_zugreifen(name)
  );

CREATE POLICY "Delete invoice-attachments of accessible invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-attachments'
    AND public.darf_auf_rechnungsanlage_zugreifen(name)
  );
