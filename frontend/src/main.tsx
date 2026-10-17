import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('FORGE AI Uncaught React Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080B11] text-slate-100 flex items-center justify-center p-6 font-mono">
          <div className="max-w-lg w-full bg-[#0D121F] border border-red-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400 font-bold text-base">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
              <span>FORGE AI City - System Exception</span>
            </div>
            <p className="text-xs text-slate-400">
              An unexpected error occurred during rendering. Details are captured below:
            </p>
            <div className="bg-black/50 p-3 rounded-lg border border-slate-800 text-xs text-red-300 font-mono overflow-x-auto whitespace-pre-wrap">
              {this.state.error?.message || 'Unknown runtime error'}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
              >
                Reload Simulation
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
