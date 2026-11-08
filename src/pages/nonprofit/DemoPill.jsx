import { useNpDemoData } from './useNpAdminActions';

/**
 * "Demo data" badge.
 *
 * demoData.js is fabricated donor and charge data. Every screen that shows it
 * has to SAY so - an admin must never mistake seeded numbers for their real
 * program. This was three identical copies (Overview, Donors, Charges); it is
 * now one. It renders nothing outside demo mode, where the tabs show honest
 * empty states instead of the seeded figures (see useNpDemoData).
 *
 * amber-50 bg, amber-700 text: the one sample label per section the design
 * direction allows.
 */
export default function DemoPill() {
  const showDemo = useNpDemoData();
  if (!showDemo) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 whitespace-nowrap">
      Demo data
    </span>
  );
}
