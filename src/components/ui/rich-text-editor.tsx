// WYSIWYG Rich-Text-Editor für Email-Bodies + Template-Editor.
// Basiert auf react-quill-new (Quill 2.0, React 18+ kompatibel).
// Output ist HTML-String — kompatibel mit Resend `html`-Field und
// unserer email_templates.body_html-Spalte.
import { useMemo } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

/** Farben für Hervorhebungen — bewusst wenige, dafür gut lesbar im Druck. */
const TEXTFARBEN = [
  "#000000", "#e60000", "#008a00", "#0645ad", "#c78100", "#666666",
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /**
   * "email" (Standard) — volle Leiste mit Überschriften und Links.
   * "langtext" — nur was im PDF darstellbar ist: fett, kursiv,
   * unterstrichen, Farbe, Aufzählung. Überschriften und Links fehlen
   * bewusst, weil das PDF sie nicht abbilden kann.
   */
  variante?: "email" | "langtext";
}

export function RichTextEditor({ value, onChange, placeholder, rows = 8, className, variante = "email" }: Props) {
  const modules = useMemo(() => (
    variante === "langtext"
      ? {
          toolbar: [
            ["bold", "italic", "underline"],
            [{ color: TEXTFARBEN }],
            [{ list: "bullet" }],
            ["clean"],
          ],
        }
      : {
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline"],
            [{ color: TEXTFARBEN }],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link"],
            ["clean"],
          ],
        }
  ), [variante]);

  const formats = variante === "langtext"
    ? ["bold", "italic", "underline", "color", "list", "bullet"]
    : ["header", "bold", "italic", "underline", "color", "list", "bullet", "link"];

  // Mindesthöhe an „rows" anlehnen, damit das Feld optisch zur
  // Textarea-Variante passt (rows*22px Body + 42px Toolbar).
  const minHeight = rows * 22 + 42;

  return (
    <div className={`rte-wrap ${className || ""}`} style={{ ["--rte-min-h" as never]: `${minHeight}px` }}>
      <ReactQuill
        theme="snow"
        value={value || ""}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
      <style>{`
        .rte-wrap .ql-container {
          min-height: var(--rte-min-h);
          font-family: inherit;
          font-size: 13px;
        }
        .rte-wrap .ql-editor {
          min-height: var(--rte-min-h);
        }
        .rte-wrap .ql-toolbar {
          border-top-left-radius: 6px;
          border-top-right-radius: 6px;
          border-color: hsl(var(--border));
        }
        .rte-wrap .ql-container {
          border-bottom-left-radius: 6px;
          border-bottom-right-radius: 6px;
          border-color: hsl(var(--border));
        }
      `}</style>
    </div>
  );
}
