import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initNativeAuthListener } from './lib/donorAuth'

// The old TESTING-MODE cold-launch wipe lived here (localStorage/sessionStorage/
// indexedDB cleared on every native launch). It is GONE on purpose: the app now
// remembers the signed-in account across cold launches - a cold open with a
// persisted Supabase session goes straight to the dashboard, no sign-in prompt.
// Fresh-start testing is still available via the ?reset=1 / ?fresh=1 links
// (see src/store/AppContext.jsx).

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
