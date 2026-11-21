import React, {StrictMode, ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Ensure any stale Service Workers in preview environment are unregistered so /api routes and auth cookies work reliably
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  }).catch(() => {});
}

// Global error swallow to prevent iframe crashing in dev environment
window.addEventListener('error', (e) => {
  console.warn('Caught global error:', e.error);
  e.preventDefault();
});
window.addEventListener('unhandledrejection', (e) => {
  console.warn('Caught unhandled rejection:', e.reason);
  e.preventDefault();
});

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorStr: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    // @ts-ignore
    this.state = { hasError: false, errorStr: '' };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorStr: String(error) };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    // @ts-ignore
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-red-600">
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <p className="mb-4">An unexpected error occurred in the application UI.</p>
          <pre className="bg-slate-100 p-4 rounded text-sm text-left overflow-auto max-w-full">
            {/* @ts-ignore */}
            {this.state.errorStr}
          </pre>
          <button 
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => (this as any).setState({hasError: false, errorStr: ''})}
          >
            Clear Error & Retry
          </button>
        </div>
      );
    }
    // @ts-ignore
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
