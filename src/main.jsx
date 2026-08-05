import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initNativeAuthListener } from './lib/donorAuth'

// TESTING MODE - wipe all persisted state on every native cold launch
// so Blake can test from the fresh welcome screen each time.
// REMOVE THIS BLOCK BEFORE OFFICIAL LAUNCH - see PRELAUNCH.md and app/APPSTORE.md.
if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try {
    if (indexedDB && typeof indexedDB.databases === 'function') {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => { try { if (db.name) indexedDB.deleteDatabase(db.name); } catch { /* ignore */ } });
      }).catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }
}

// Native in-app SSO return trip: iOS hands app.pocketcache://auth-callback#…
// to the shell, the App plugin fires appUrlOpen, and this listener turns the
// tokens into a Supabase session (see lib/donorAuth.js). Registered once at
// bootstrap - before any screen mounts. No-op on the web and on old shells
// without the Browser/App plugins.
initNativeAuthListener();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
