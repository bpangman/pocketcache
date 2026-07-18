import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// TESTING MODE - wipe all persisted state on every native cold launch
// so Blake can test from the fresh welcome screen each time.
// REMOVE THIS BLOCK BEFORE OFFICIAL LAUNCH - see PRELAUNCH.md and app/APPSTORE.md.
if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
  try { localStorage.clear(); } catch (_) { /* ignore */ }
  try { sessionStorage.clear(); } catch (_) { /* ignore */ }
  try {
    if (indexedDB && typeof indexedDB.databases === 'function') {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => { try { if (db.name) indexedDB.deleteDatabase(db.name); } catch (_) { /* ignore */ } });
      }).catch(() => { /* ignore */ });
    }
  } catch (_) { /* ignore */ }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
