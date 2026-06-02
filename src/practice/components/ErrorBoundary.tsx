// ErrorBoundary.tsx — Per-shell crash isolation.
// Wraps each shell so one crash doesn't kill the entire app.
// Shows a themed fallback matching the dark cityscape aesthetic.

import React from 'react';

interface ErrorBoundaryProps {
  /** Shell name shown in the fallback UI. */
  shellName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Class-based error boundary (React requires classes for this).
 * Each shell gets its own instance so failures are isolated.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to console — swap for a real error reporter (Sentry, etc.) later.
    console.error(`[ErrorBoundary:${this.props.shellName}]`, error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--em-ink, #0E0A1A)',
            color: 'var(--em-text, #EDE6FF)',
            fontFamily: 'var(--em-body, Inter, system-ui, sans-serif)',
            padding: 32,
            boxSizing: 'border-box',
            textAlign: 'center',
          }}
        >
          {/* Skylight icon */}
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>🌃</div>
          <h3
            style={{
              fontFamily: 'var(--em-decor, Caprasimo, serif)',
              fontSize: 24,
              margin: '0 0 8px',
              color: 'var(--em-amber, #FBBF24)',
            }}
          >
            {this.props.shellName} — district closed
          </h3>
          <p style={{ fontSize: 14, color: 'var(--em-text-muted, #9A8FB8)', maxWidth: 400, lineHeight: 1.5, margin: '0 0 16px' }}>
            Something went wrong in this district. The rest of the city is fine.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: '1px solid var(--em-violet, #A78BFA)',
              background: 'rgba(167, 139, 250, 0.12)',
              color: 'var(--em-violet, #A78BFA)',
              fontFamily: 'var(--em-mono, monospace)',
              fontSize: 13,
              cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            REOPEN DISTRICT
          </button>
          {this.state.error && (
            <details style={{ marginTop: 20, fontSize: 11, color: 'var(--em-text-dim, #6B6184)', maxWidth: 500 }}>
              <summary style={{ cursor: 'pointer' }}>Error details</summary>
              <pre style={{ marginTop: 8, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Themed loading spinner matching the dark cityscape aesthetic.
 * Used as Suspense fallback while lazy-loaded shells are fetched.
 */
export const ShellSpinner: React.FC<{ shellName?: string }> = ({ shellName }) => (
  <div
    role="status"
    aria-label={shellName ? `Loading ${shellName}` : 'Loading district'}
    style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--em-ink, #0E0A1A)',
      gap: 16,
    }}
  >
    {/* Rotating pigeon-themed spinner */}
    <div
      style={{
        width: 40,
        height: 40,
        border: '3px solid rgba(167, 139, 250, 0.2)',
        borderTopColor: 'var(--em-amber, #FBBF24)',
        borderRadius: '50%',
        animation: 'em-spin 0.8s linear infinite',
      }}
    />
    {shellName && (
      <span
        style={{
          fontFamily: 'var(--em-mono, monospace)',
          fontSize: 11,
          letterSpacing: '0.18em',
          color: 'var(--em-text-dim, #6B6184)',
          textTransform: 'uppercase',
        }}
      >
        {shellName}
      </span>
    )}
  </div>
);
