import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ─── Vendor chunking ─────────────────────────────────────────────────────────
//
// App code is split by route in src/App.jsx (React.lazy). This file only groups
// the heavy third-party libraries, for two reasons:
//
//   1. CACHING. React, framer-motion, recharts and Stripe change only when we
//      bump a dependency, while app code changes on every deploy. In one chunk,
//      a copy tweak re-downloaded 1.1 MB. Split out, a deploy invalidates the
//      app chunks and leaves the vendor chunks in cache. That matters most on
//      the native app, which re-fetches this site over the network.
//
//   2. CONDITIONAL LOADING. A vendor chunk is only fetched when a chunk that
//      imports it is fetched. recharts is imported exclusively by the donor
//      Dashboard/Activity tabs and the admin Overview tab, all of which are now
//      lazy - so the nonprofit-signup and admin-sign-in paths never download it
//      at all. Stripe is imported only by the card screens (Onboarding,
//      Settings, WebPortalPages, WebOnboarding), so the same applies there.
//
// Anything NOT listed here keeps the bundler's default placement on purpose:
// small shared libraries (lucide icons, qrcode.react) are better off next to
// the code that uses them than in a chunk of their own.
//
// WHY codeSplitting.groups AND NOT manualChunks
// Vite 8 bundles with rolldown, where `output.manualChunks` is a deprecated
// compatibility shim over this same option - and the shim gives no control over
// group precedence. A group also captures its matches' *dependencies*
// recursively, so with manualChunks the recharts group swallowed React's CJS
// interop module: the entry chunk then imported it from vendor-charts, which
// dragged all 360 kB of charts code into the critical path of every entry,
// including the nonprofit admin paths that render no charts at all. `priority`
// is the fix - a higher-priority group is turned into a chunk first and its
// modules are removed from the lower-priority groups - and it is only available
// on the real option, so that is what this uses.
const VENDOR_GROUPS = [
  // React itself. Every path needs it, so it is the one vendor chunk that is
  // always on the critical path - which is exactly why it should cache
  // forever. Highest priority so no other group can capture it.
  {
    name: 'vendor-react',
    priority: 30,
    test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
  },
  // Animation engine. Used by nearly every surface, the eager shell included,
  // so this is a caching split rather than a deferral one.
  {
    name: 'vendor-motion',
    priority: 20,
    test: /node_modules[\\/](framer-motion|motion-dom|motion-utils|tslib)[\\/]/,
  },
  // Stripe Elements. Only the card screens touch it.
  {
    name: 'vendor-stripe',
    priority: 20,
    test: /node_modules[\\/]@stripe[\\/]/,
  },
  // Charts. recharts drags in redux + d3 (via victory-vendor); every one of
  // those packages is recharts-only in this app, so the whole cluster travels
  // together and is fetched only by the chunks that draw a chart.
  {
    name: 'vendor-charts',
    priority: 10,
    test: /node_modules[\\/](recharts|victory-vendor|d3-[a-z]+|internmap|delaunator|robust-predicates|decimal\.js-light|es-toolkit|eventemitter3|tiny-invariant|clsx|@reduxjs[\\/]toolkit|react-redux|reselect|immer)[\\/]/,
  },
]

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/demo/',
  server: {
    allowedHosts: 'all',
  },
  build: {
    rollupOptions: {
      output: {
        codeSplitting: {
          groups: VENDOR_GROUPS,
        },
      },
    },
  },
})
