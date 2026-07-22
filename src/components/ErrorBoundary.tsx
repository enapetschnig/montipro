import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home, Copy } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

/**
 * App-weiter Error-Fallback — verhindert weiße Screens bei unbehandelten
 * Render-Fehlern. Zeigt dem Nutzer eine klare Fehlermeldung + Reset-Knopf.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null, copied: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    this.setState({ errorInfo });
  }

  reset = () => {
    this.setState({ error: null, errorInfo: null, copied: false });
  };

  goHome = () => {
    this.setState({ error: null, errorInfo: null, copied: false });
    window.location.href = "/";
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-card border rounded-lg p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <h2 className="text-xl font-semibold">Hoppla — ein Fehler</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              Da ist etwas schiefgelaufen. Kein Datenverlust — versuche es einfach nochmal.
            </p>
            {/* Fehlermeldung DIREKT sichtbar (nicht zugeklappt): Sie ist der
                entscheidende Hinweis für die Fehlersuche. War sie hinter
                "Technische Details" versteckt, kam beim Support nur "Hoppla"
                an und die Ursache musste geraten werden. */}
            <div className="mb-3 rounded bg-muted/40 border p-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Fehlermeldung</p>
              <pre className="text-xs whitespace-pre-wrap break-words text-destructive/90">
                {this.state.error.message || "Unbekannter Fehler"}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 gap-1.5 text-xs"
                onClick={() => {
                  const text = `${this.state.error?.message}\n\n${this.state.error?.stack?.slice(0, 800) || ""}\n\n${this.state.errorInfo?.componentStack?.slice(0, 800) || ""}`;
                  navigator.clipboard?.writeText(text);
                  this.setState({ copied: true });
                  setTimeout(() => this.setState({ copied: false }), 2000);
                }}
              >
                <Copy className="w-3 h-3" />
                {this.state.copied ? "Kopiert" : "Fehler kopieren"}
              </Button>
            </div>
            <details className="text-xs text-muted-foreground/80 mb-5 bg-muted/30 rounded p-2">
              <summary className="cursor-pointer select-none">Wo genau (für den Support)</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">
                {this.state.errorInfo?.componentStack?.slice(0, 400)}
              </pre>
            </details>
            <div className="flex gap-2">
              <Button onClick={this.reset} variant="outline" className="flex-1 gap-2">
                <RotateCcw className="w-4 h-4" /> Nochmal versuchen
              </Button>
              <Button onClick={this.goHome} className="flex-1 gap-2">
                <Home className="w-4 h-4" /> Zur Startseite
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
