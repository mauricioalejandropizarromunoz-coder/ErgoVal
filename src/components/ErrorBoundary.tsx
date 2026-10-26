import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleResetToPreset = () => {
    try {
      localStorage.removeItem('ergoeval_workspace_v1');
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-white rounded-xl shadow-lg border border-slate-300 p-6 sm:p-8">
            <div className="flex items-center gap-3 text-red-700 mb-4">
              <div className="p-2.5 bg-red-50 rounded-lg border border-red-200">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  ErgoEval — Recuperación de Sesión
                </h1>
                <p className="text-xs text-slate-500">
                  Herramienta de Evaluación Ergonómica de Puestos de Trabajo
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-950 mb-6 space-y-2">
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="font-semibold">
                  Se interrumpió el renderizado visual de la vista actual.
                </p>
              </div>
              <p className="text-amber-900 leading-relaxed">
                Para reanudar de inmediato su evaluación técnica sin bloqueos, puede recargar la
                interfaz o restablecer el estudio modelo base (EmpresaX S.A.).
              </p>
            </div>

            {this.state.error && (
              <details className="mb-6 border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <summary className="px-3 py-2 text-xs font-mono text-slate-600 cursor-pointer hover:bg-slate-100 select-none">
                  Detalle técnico del error: {this.state.error.message || String(this.state.error)}
                </summary>
                <pre className="p-3 text-[11px] font-mono text-slate-700 bg-white border-t border-slate-200 overflow-x-auto whitespace-pre-wrap max-h-40">
                  {this.state.error.stack || 'No stack trace disponible'}
                </pre>
              </details>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar Aplicación
              </button>

              <button
                type="button"
                onClick={this.handleResetToPreset}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <RotateCcw className="w-4 h-4 text-slate-600" />
                Restablecer Modelo EmpresaX S.A.
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 text-center">
              <p className="text-[11px] text-slate-500">
                © {new Date().getFullYear()} Mauricio Alejandro Pizarro Muñoz · Todos los derechos reservados.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
