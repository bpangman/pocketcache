// src/components/RootBoundary.jsx
//
// The root error boundary, wrapped around <App/> in main.jsx. Until this
// existed the only boundary was App.jsx's ChunkBoundary, which covers the
// lazy-loaded surfaces and nothing else: a throw inside a provider or a store
// initializer white-screened the whole app with no way out but the URL bar.
// This catches whatever reaches the root and offers the two honest exits -
// reload, or start fresh (the ?reset=1 link that wipes this device's state).
//
// Deliberately plain: no store, no theme, no lazy chunk - the one thing a
// boundary must never do is depend on the code that just failed. Design
// tokens come straight from src/index.css (:root), which main.jsx imports
// before anything else, and the Button primitive has no store dependency.
import { Component } from 'react';
import Button from './ui/Button';

const RESET_HREF = `${import.meta.env.BASE_URL || '/'}?reset=1`;

export default class RootBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error: error ?? new Error('Unknown render error') };
  }

  componentDidCatch(error, info) {
    // console.error, not warn: this is a real failure, and the component
    // stack is the only breadcrumb a bug report from a phone will carry.
    console.error('[PocketCache] Unrecoverable render error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          background: 'var(--surface)',
          fontFamily: 'Poppins, system-ui, sans-serif',
          color: 'var(--ink)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 360,
            background: '#fff',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-2)',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 22, lineHeight: 1.2, fontWeight: 700, color: 'var(--ink)' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            Nothing was charged. Reload to pick up where you left off, or start fresh if it happens again.
          </p>
          <Button size="md" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <a
            href={RESET_HREF}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              marginTop: 8,
              padding: '0 12px',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--navy-deep)',
              textDecoration: 'none',
            }}
          >
            Start fresh
          </a>
        </div>
      </div>
    );
  }
}
