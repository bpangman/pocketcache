// Maps transaction category → display emoji.
// In production, use the `personal_finance_category.primary` field from
// Plaid webhook events — the mapping is identical.
const CATEGORY_EMOJI = {
  'Food & Drink': '☕',
  'Groceries': '🛒',
  'Transport': '🚗',
  'Entertainment': '🎬',
  'Shopping': '🛍',
  'Health': '💊',
  'Travel': '✈️',
  'Fuel': '⛽',
  'Subscriptions': '📺',
};

const DEFAULT_EMOJI = '💳';

export function categoryEmoji(category) {
  return CATEGORY_EMOJI[category] ?? DEFAULT_EMOJI;
}
