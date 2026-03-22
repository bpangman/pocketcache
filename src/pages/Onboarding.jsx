import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '../components/Logo';
import { useApp } from '../store/AppContext';

const SLIDES = [
  {
    id: 0,
    bg: 'from-orange-500 to-amber-400',
    illustration: (
      <div className="relative flex items-center justify-center">
        <div className="w-32 h-32 rounded-full bg-white/20 flex items-center justify-center pulse-ring absolute" />
        <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center">
          <Logo size={72} />
        </div>
      </div>
    ),
    title: 'Welcome to\nSpareChange',
    subtitle: 'Turn everyday purchases into\nimpactful donations — automatically.',
    cta: 'Get Started',
  },
  {
    id: 1,
    bg: 'from-violet-600 to-indigo-500',
    illustration: (
      <div className="relative flex flex-col items-center gap-3">
        {[
          { icon: '☕', amount: '$4.75', round: '+$0.25', delay: 0 },
          { icon: '🛒', amount: '$23.40', round: '+$0.60', delay: 0.1 },
          { icon: '🚗', amount: '$11.85', round: '+$0.15', delay: 0.2 },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: item.delay + 0.3, duration: 0.4 }}
            className="flex items-center gap-3 bg-white/20 rounded-2xl px-5 py-3 w-72"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-white font-medium flex-1">{item.amount}</span>
            <span className="text-white/90 font-bold text-sm bg-white/25 rounded-full px-2.5 py-1">{item.round}</span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-2 flex items-center gap-2 bg-white rounded-2xl px-6 py-3"
        >
          <span className="text-violet-600 font-bold text-lg">$1.00</span>
          <span className="text-gray-500 text-sm">donated to your cause ❤️</span>
        </motion.div>
      </div>
    ),
    title: 'Round Up Every\nPurchase',
    subtitle: 'We round up each transaction to the nearest dollar. The spare change goes straight to your chosen nonprofit.',
    cta: 'How It Works',
  },
  {
    id: 2,
    bg: 'from-emerald-500 to-teal-400',
    illustration: (
      <div className="flex flex-col items-center gap-4">
        <div className="text-6xl mb-2">🌍</div>
        <div className="grid grid-cols-3 gap-2">
          {['🐼', '📚', '🌾', '🏥', '🏠', '⚖️'].map((emoji, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.07 + 0.3, type: 'spring', stiffness: 300 }}
              className="w-16 h-16 rounded-2xl bg-white/25 flex items-center justify-center text-3xl"
            >
              {emoji}
            </motion.div>
          ))}
        </div>
      </div>
    ),
    title: 'Choose Your\nCause',
    subtitle: 'Pick from hundreds of verified nonprofits across the causes you care about most.',
    cta: 'Pick a Cause',
  },
  {
    id: 3,
    bg: 'from-rose-500 to-pink-400',
    illustration: (
      <div className="flex flex-col items-center gap-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
          className="w-36 h-36 rounded-full bg-white/20 flex items-center justify-center"
        >
          <div className="text-center">
            <div className="text-white font-bold text-4xl">$60</div>
            <div className="text-white/80 text-sm mt-1">donated</div>
          </div>
        </motion.div>
        <div className="flex gap-4 mt-2">
          {[
            { label: 'Transactions', value: '247' },
            { label: 'Avg/month', value: '$10.10' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="bg-white/20 rounded-2xl px-5 py-3 text-center"
            >
              <div className="text-white font-bold text-xl">{stat.value}</div>
              <div className="text-white/70 text-xs mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
    title: 'Watch Your\nImpact Grow',
    subtitle: 'Track every donation, see your cumulative impact, and share your generosity with others.',
    cta: 'Start Giving',
  },
];

export default function Onboarding() {
  const [slide, setSlide] = useState(0);
  const { setPage } = useApp();

  const current = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  function advance() {
    if (isLast) {
      setPage('home');
    } else {
      setSlide(s => s + 1);
    }
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className={`flex-1 bg-gradient-to-br ${current.bg} flex flex-col items-center justify-center px-8 pt-16 pb-6`}
        >
          {/* Illustration */}
          <div className="h-56 flex items-center justify-center">
            {current.illustration}
          </div>

          {/* Text */}
          <div className="mt-10 text-center">
            <h1 className="text-white font-bold text-4xl leading-tight whitespace-pre-line" style={{ letterSpacing: '-0.5px' }}>
              {current.title}
            </h1>
            <p className="text-white/80 text-base mt-4 leading-relaxed">
              {current.subtitle}
            </p>
          </div>

          {/* Dots */}
          <div className="flex gap-2 mt-8">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === slide ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40'
                }`}
              />
            ))}
          </div>

          {/* CTA */}
          <div className="w-full mt-8 flex flex-col gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={advance}
              className="w-full py-4 rounded-2xl bg-white font-bold text-base shadow-lg"
              style={{ color: slide === 0 ? '#f97316' : slide === 1 ? '#7c3aed' : slide === 2 ? '#059669' : '#e11d48' }}
            >
              {current.cta}
            </motion.button>
            {slide > 0 && (
              <button
                onClick={() => setPage('home')}
                className="text-white/60 text-sm py-2"
              >
                Skip for now
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
