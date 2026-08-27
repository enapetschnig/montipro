-- Anlagen zu Angeboten und Rechnungen.
--
-- Zweck: Unterlagen fremder Firmen (z.B. das Angebots-PDF einer Fensterfirma
-- mit Zeichnungen und technischen Darstellungen) an das eigene Angebot
-- binden. Pro Anlage wird entschieden, ob sie hinten an das erzeugte PDF
-- angebaut ('anhaengen') oder der Mail als eigene Datei beigelegt wird
-- ('separat').
--
-- Bewusst additiv: Ohne Anlagen verhält sich die Angebots-/Rechnungsausgabe
-- exakt wie bisher.

CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  -- 'anhaengen' = wird Teil des Angebots-PDFs (hinten angebaut)
  -- 'separat'   = wird der Email als eigene Datei angehängt
  modus TEXT NOT NULL DEFAULT 'anhaengen',
  seiten INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.invoice_attachments
  DROP CONSTRAINT IF EXISTS invoice_attachments_modus_check;
ALTER TABLE public.invoice_attachments
  ADD CONSTRAINT invoice_attachments_modus_check
  CHECK (modus IN ('anhaengen', 'separat'));

CREATE INDEX IF NOT EXISTS idx_invoice_attachments_invoice
  ON public.invoice_attachments (invoice_id, sort_order);

COMMENT ON TABLE public.invoice_attachments IS
  'Fremdunterlagen zu einem Angebot/einer Rechnung. modus=anhaengen wird beim Erzeugen hinten an das PDF angebaut, modus=separat der Email als eigene Datei beigelegt.';

-- RLS: dieselben Rechte wie an der zugehörigen Rechnung. Wer die Rechnung
-- sehen/ändern darf, darf auch ihre Anlagen verwalten.
ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage attachments of accessible invoices" ON public.invoice_attachments;
CREATE POLICY "Manage attachments of accessible invoices"
  ON public.invoice_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_attachments.invoice_id
        AND (i.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_attachments.invoice_id
        AND (i.user_id = auth.uid() OR has_role(auth.uid(), 'administrator'::app_role))
    )
  );

-- Storage: eigener privater Bucket, 50 MB je Datei (wie project-plans).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('invoice-attachments', 'invoice-attachments', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- ACHTUNG: Hier standen ursprünglich vier Policies, die den gesamten Bucket
-- für jeden angemeldeten Benutzer zum Lesen, Überschreiben und LÖSCHEN
-- freigaben. Sie sind entfernt, weil ein erneutes Ausführen dieser Datei die
-- Absicherung in 20260827210000_invoice_attachments_storage_rls.sql
-- stillschweigend ausgehebelt hätte: Policies desselben Kommandos werden
-- ODER-verknüpft, eine offene Policy daneben hätte alles wieder freigegeben.
--
-- Die Storage-Policies stehen ausschließlich in der Folgemigration
-- 20260827210000_invoice_attachments_storage_rls.sql.
DROP POLICY IF EXISTS "Auth users can read invoice-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload invoice-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can update invoice-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can delete invoice-attachments" ON storage.objects;
