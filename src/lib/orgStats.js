// LAUNCH SWITCH: set VITE_API_BASE at build time and these stats go live everywhere
// — no other code change needed.
//
// getOrgStats(org) resolves to { raised, donors, isDemo }:
//   raised  — total donation dollars directed to the org (API: SUM(roundup_cents)/100)
//   donors  — lifetime unique donors with ≥1 succeeded charge (API: COUNT DISTINCT user_id)
//   isDemo  — true when showing seeded sample figures; false on live platform data

export async function getOrgStats(org) {
  const apiBase = import.meta.env.VITE_API_BASE;
  if (apiBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(
        `${apiBase}/api/nonprofits/by-code/${encodeURIComponent(org.id)}/stats`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (response.ok) {
        const data = await response.json();
        return {
          raised: data.totalRaisedCents / 100,
          donors: data.totalDonors,
          isDemo: false,
        };
      }
    } catch {
      // network error, timeout, or non-ok response — fall through to demo fallback
    }
  }
  // Demo / offline fallback: use seeded org fields
  return {
    raised: org.raised ?? null,
    donors: org.donors ?? null,
    isDemo: !!org.sampleStats,
  };
}
