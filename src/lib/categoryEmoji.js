// Maps transaction category → lucide icon for the Activity list.
// In production, use the `personal_finance_category.primary` field from
// Plaid webhook events - the mapping is identical.
//
// These used to be emoji. Emoji render differently on every OS and read as
// decoration, so the list now uses line icons in a tinted square (see
// Activity.jsx). Milestone celebration emoji are copy, not icons, and are
// untouched by this.
import { createElement } from 'react';
import {
  Car, Clapperboard, Coffee, CreditCard, Fuel, Pill, Plane, ShoppingBag,
  ShoppingCart, Tv,
} from 'lucide-react';

const CATEGORY_ICON = {
  'Food & Drink': Coffee,
  'Groceries': ShoppingCart,
  'Transport': Car,
  'Entertainment': Clapperboard,
  'Shopping': ShoppingBag,
  'Health': Pill,
  'Travel': Plane,
  'Fuel': Fuel,
  'Subscriptions': Tv,
};

/** Anything unmapped (including a real bank's plain "Bank purchase") is a card. */
const DEFAULT_ICON = CreditCard;

/**
 * Returns the category's lucide icon as a rendered element (a stable component
 * reference, so React never remounts it between renders).
 * @param {string} category
 * @param {number} [size=16]
 */
export function categoryIcon(category, size = 16) {
  return createElement(CATEGORY_ICON[category] ?? DEFAULT_ICON, { size });
}

/**
 * Kept for the old import name. Returns the same rendered icon element as
 * categoryIcon - the old emoji string is gone.
 */
export const categoryEmoji = categoryIcon;
