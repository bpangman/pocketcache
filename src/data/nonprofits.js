// Each nonprofit has a `brand` object that white-labels the entire app when selected.
// brand.primary / brand.secondary drive CSS custom properties app-wide.
// logoUrl: import local assets so Vite resolves the base path correctly on deploy.
import bgcaLogoUrl from '../assets/bgca-logo.png';
import gmLogoUrl from '../assets/gm-logo.svg';

export const NONPROFITS = [
  {
    id: 'bgca',
    name: "Boys & Girls Clubs of America",
    shortName: 'BGCA',
    tagline: 'Enabling young people to reach their full potential',
    category: 'Youth Development',
    categoryColor: '#003865',
    logo: '🏀',
    logoUrl: bgcaLogoUrl,
    raised: 3841209,
    donors: 112340,
    impact: '4.3M youth served at 5,000+ club locations',
    description: "Boys & Girls Clubs of America provides after-school programs, mentoring, and safe spaces for young people ages 6–18, helping them build the skills and confidence to succeed.",
    ein: '13-5562976',
    rating: 4.8,
    featured: true,
    monthlyMinimum: 5,
    corporateMatch: {
      company: 'General Motors',
      companyShort: 'GM',
      maxAmount: 50000,
      matched: 23400,
      active: true,
      // sample: true — this is a demo partnership used to illustrate the corporate
      // match feature. In production, match terms come from signed partner agreements.
      sample: true,
      description: 'GM is matching every donor round-up dollar-for-dollar, up to $50,000 total — an example of a corporate match partnership.',
      logoUrl: gmLogoUrl,
      impactUrl: 'https://www.gm.com/commitments',
      // impactReport is illustrative — specific club counts and city names are
      // example equivalencies for demo purposes, not verified program figures.
      impactReport: "This sample match illustrates how a corporate partner can amplify donor impact. In this example, $23,400 of the $50,000 match pool has been claimed — representing thousands of additional after-school hours that could be funded across BGCA Club locations. Match partners receive a quarterly impact report directly from BGCA.",
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
      brandLogoUrl: bgcaLogoUrl,
    },
  },
];

// Default white-label brand (before any cause is chosen)
export const DEFAULT_BRAND = {
  appName: 'PocketCache',
  tagline: 'Give with every purchase.',
  primary: '#FBBF24',
  secondary: '#0D9488',
  gradient: 'linear-gradient(135deg, #FBBF24 0%, #E5A800 100%)',
  headerGradient: 'linear-gradient(135deg, #0B2A4A, #003865)',
  accentLight: '#FEF3C7',
  textAccent: '#D97706',
  logoEmoji: null, // uses SVG Logo component
};
