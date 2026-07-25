import { LayoutDashboard, Users, CreditCard, Megaphone, Settings } from 'lucide-react';
import Overview from './tabs/Overview';
import Donors from './tabs/Donors';
import Charges from './tabs/Charges';
import Grow from './tabs/Grow';
import NpSettings from './tabs/NpSettings';

/**
 * The admin tabs, in order - ONE list.
 *
 * NpTabBar (phone bottom bar), NpShell (phone page switch) and NpWebShell
 * (desktop top nav + page switch) all read this, so adding or renaming a tab is
 * a one-line change and the two shells can never disagree about what exists.
 *
 * `title` / `blurb` are the desktop page heading. The phone shell has no room
 * for a page heading and ignores them.
 */
export const NP_TABS = [
  {
    id: 'overview', label: 'Overview', icon: LayoutDashboard, component: Overview,
    title: 'Overview',
    blurb: 'Your program at a glance - donors, this month’s accrual and what lands next.',
  },
  {
    id: 'donors', label: 'Donors', icon: Users, component: Donors,
    title: 'Donors',
    blurb: 'Everyone giving through your program. Emails are masked by design.',
  },
  {
    id: 'charges', label: 'Charges', icon: CreditCard, component: Charges,
    title: 'Charge runs',
    blurb: 'What was collected each month and what reached your Stripe account.',
  },
  {
    id: 'grow', label: 'Grow', icon: Megaphone, component: Grow,
    title: 'Grow your donor base',
    blurb: 'Your join code, QR, and the widget you can drop on your own website.',
  },
  {
    id: 'settings', label: 'Settings', icon: Settings, component: NpSettings,
    title: 'Settings',
    blurb: 'Branding, mission and the admin email that approves changes.',
  },
];

/** The tab definition for an id, falling back to the first tab. */
export function npTabDef(id) {
  return NP_TABS.find(t => t.id === id) ?? NP_TABS[0];
}
