// Each nonprofit has a `brand` object that white-labels the entire app when selected.
// brand.primary / brand.secondary drive CSS custom properties app-wide.
// logoUrl uses Clearbit Logo API for real brand marks.
export const NONPROFITS = [
  {
    id: 'bgca',
    name: "Boys & Girls Clubs of America",
    shortName: 'BGCA',
    tagline: 'Enabling young people to reach their full potential',
    category: 'Youth Development',
    categoryColor: '#003865',
    logo: '🏀',
    logoUrl: 'https://logo.clearbit.com/bgca.org',
    raised: 3841209,
    donors: 112340,
    impact: '4.3M youth served at 5,000+ club locations',
    description: "Boys & Girls Clubs of America provides after-school programs, mentoring, and safe spaces for young people ages 6–18, helping them build the skills and confidence to succeed.",
    ein: '13-5562976',
    rating: 4.8,
    featured: true,
    corporateMatch: {
      company: 'General Motors',
      companyShort: 'GM',
      maxAmount: 50000,
      matched: 23400,
      active: true,
      description: 'GM is matching every dollar donated to BGCA, up to $50,000 total.',
    },
    brand: {
      appName: 'BGCA Round-Up',
      tagline: 'Supporting youth, every purchase',
      primary: '#003865',       // BGCA navy
      secondary: '#E8192C',     // BGCA red
      gradient: 'linear-gradient(135deg, #003865 0%, #002244 100%)',
      headerGradient: 'linear-gradient(135deg, #003865, #001a33)',
      accentLight: '#E8192C22',
      textAccent: '#E8192C',
      logoEmoji: '🏀',
    },
  },
];

// Default white-label brand (before any cause is chosen)
export const DEFAULT_BRAND = {
  appName: 'PocketCache',
  tagline: 'Give with every purchase',
  primary: '#f97316',
  secondary: '#fbbf24',
  gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
  headerGradient: 'linear-gradient(135deg, #f97316, #ea580c)',
  accentLight: '#f9731622',
  textAccent: '#f97316',
  logoEmoji: null, // uses SVG Logo component
};
