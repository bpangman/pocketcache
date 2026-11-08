/* global __BUILD_ID__ */
// src/components/AppVersion.jsx
//
// The one version line, for the Settings footers (app and web) and the app
// shell. It exists so a donor can quote a build in a bug report - which a
// fixed "v1.0.0" could not do, because the web deploys on every push to main.
// `__BUILD_ID__` is a Vite `define` (vite.config.js: the first 7 characters of
// GITHUB_SHA in the deploy run); a local dev build has no define and reads
// "dev". Keep "1.0.0" in step with the iOS MARKETING_VERSION.

const VERSION = '1.0.0';

/**
 * @param {object} props
 * @param {string} [props.className]
 * @param {object} [props.style]
 */
export default function AppVersion({ className, style }) {
  const build = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
  return (
    <span className={className} style={style} data-testid="app-version">
      {`PocketCache · v${VERSION} (${build})`}
    </span>
  );
}
