-- Lieferantengutschriften bei den Eingangsrechnungen.
--
-- Grundsatz: Der Betrag wird IMMER positiv gespeichert — so, wie er auf dem
-- Beleg steht. Das Minus entsteht nicht in der Datenbank, sondern bei jeder
-- Auswertung über die neue Spalte `beleg_art`. Damit bleibt der bestehende
-- Constraint `betrag_brutto >= 0` als Tippfehler-Schutz erhalten, und ein
-- geöffneter Beleg zeigt denselben Betrag wie das Papier davor.

-- 1) Belegart
-- ADD COLUMN IF NOT EXISTS überspringt bei einer bereits (anders) angelegten
-- Spalte still auch NOT NULL und DEFAULT. Deshalb beides danach explizit
-- setzen und vorhandene NULLs auffüllen — ein CHECK IN (…) lässt NULL durch.
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS beleg_art TEXT NOT NULL DEFAULT 'rechnung';

UPDATE public.purchase_invoices SET beleg_art = 'rechnung' WHERE beleg_art IS NULL;

ALTER TABLE public.purchase_invoices ALTER COLUMN beleg_art SET DEFAULT 'rechnung';
ALTER TABLE public.purchase_invoices ALTER COLUMN beleg_art SET NOT NULL;

ALTER TABLE public.purchase_invoices
  DROP CONSTRAINT IF EXISTS purchase_invoices_beleg_art_check;
ALTER TABLE public.purchase_invoices
  ADD CONSTRAINT purchase_invoices_beleg_art_check
  CHECK (beleg_art IN ('rechnung', 'gutschrift'));

COMMENT ON COLUMN public.purchase_invoices.beleg_art IS
  'rechnung | gutschrift. Betrag ist bei beiden positiv gespeichert; eine Gutschrift wird in allen Summen als Minus gerechnet. Nach dem Anlegen nicht mehr änderbar (Immutability-Trigger).';

-- 2) Eigener Nummernkreis LG_YYYY_NNN, damit Gutschriften schon an der
--    Nummer erkennbar sind und die ER-Nummerierung lückenlos bleibt.
--    Prefix bewusst LG und NICHT GS: der Kreis 'gutschrift' (Gutschrift an
--    Kunden, Tabelle invoices) benutzt GS bereits — GS_2026_001 ist dort
--    vergeben. Zwei verschiedene Belege mit derselben Nummer wären für die
--    Buchhaltung nicht auseinanderzuhalten.
INSERT INTO public.number_ranges (typ, label, prefix, suffix, format_pattern, start_nummer, aktuelle_nummer, stellen, jahr_format)
VALUES ('eingangsgutschrift', 'Lieferantengutschriften', 'LG', '', '{PREFIX}_{YYYY}_{NNN}', 1, 0, 3, 'YY')
ON CONFLICT (typ) DO NOTHING;

-- 3) Auto-Nummer beim Insert: Gutschriften aus dem GS-Kreis, alles andere
--    unverändert aus dem ER-Kreis.
CREATE OR REPLACE FUNCTION public.purchase_invoices_auto_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  yr INTEGER;
BEGIN
  IF NEW.nummer IS NULL OR NEW.nummer = '' THEN
    yr := EXTRACT(YEAR FROM COALESCE(NEW.rechnungsdatum, NOW()::DATE))::INTEGER;
    -- Gleiche Normalisierung wie im Frontend (istGutschrift): trim + lower.
    -- Sonst würde ein abweichend geschriebener Wert hier stillschweigend eine
    -- ER-Nummer bekommen, während die App ihn als Gutschrift anzeigt.
    IF LOWER(TRIM(COALESCE(NEW.beleg_art, ''))) = 'gutschrift' THEN
      NEW.nummer := public.next_document_number('eingangsgutschrift', yr);
    ELSE
      NEW.nummer := public.next_document_number('eingangsrechnung', yr);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger idempotent mitliefern, damit die Migration für sich allein steht.
DROP TRIGGER IF EXISTS trg_purchase_invoices_auto_number ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_auto_number
  BEFORE INSERT ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.purchase_invoices_auto_number();

-- 4) Immutability: die Belegart entscheidet über das Vorzeichen und über den
--    Nummernkreis. Ein nachträglicher Wechsel würde eine bereits vergebene
--    ER-Nummer zu einer Gutschrift machen — daher gesperrt wie nummer/datum.
CREATE OR REPLACE FUNCTION public.purchase_invoices_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nummer IS DISTINCT FROM OLD.nummer THEN
    RAISE EXCEPTION 'Eingangsrechnungs-Nummer kann nicht geändert werden (finanzamtskonform)';
  END IF;
  IF NEW.rechnungsdatum IS DISTINCT FROM OLD.rechnungsdatum THEN
    RAISE EXCEPTION 'Rechnungsdatum einer Eingangsrechnung kann nicht geändert werden (finanzamtskonform)';
  END IF;
  IF NEW.beleg_art IS DISTINCT FROM OLD.beleg_art THEN
    RAISE EXCEPTION 'Belegart (Rechnung/Gutschrift) kann nachträglich nicht geändert werden — bitte den Beleg löschen und neu anlegen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_invoices_immutable ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_immutable
  BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.purchase_invoices_immutable_fields();
