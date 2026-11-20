import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error ?? ''),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Uncaught UI error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC] flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] p-6 shadow-sm space-y-4 text-center">
            <div className="h-12 w-12 rounded-2xl bg-[#FEE2E2] dark:bg-[#7F1D1D] text-[#DC2626] dark:text-[#FEE2E2] flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-extrabold">કંઈક ટેકનિકલ ભૂલ આવી છે</h1>
              <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                Something went wrong. Please reload the page to continue.
              </p>
              {this.state.message && (
                <p className="mt-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 break-words">
                  {this.state.message.slice(0, 180)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>પેજ ફરી લોડ કરો / Reload</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
