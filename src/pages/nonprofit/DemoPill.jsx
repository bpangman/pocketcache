/**
 * "Demo data" badge.
 *
 * demoData.js is fabricated donor and charge data. Every screen that shows it
 * has to SAY so - an admin must never mistake seeded numbers for their real
 * program. This was three identical copies (Overview, Donors, Charges); it is
 * now one.
 */
export default function DemoPill() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
      Demo data
    </span>
  );
}
