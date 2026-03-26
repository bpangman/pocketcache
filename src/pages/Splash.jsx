import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CoinLogo from '../components/CoinLogo';

/**
 * Splash screen — shown once when the app first loads.
 * Fades in the animated coin logo, holds for ~2s, then fades out.
 * Parent calls onDone() to transition to the main app.
 */
export default function Splash({ onDone }) {
  const [phase, setPhase] = useState('in'); // 'in' | 'hold' | 'out'

  useEffect(() => {
    // in → hold after logo finishes appearing
    const t1 = setTimeout(() => setPhase('hold'), 800);
    // hold → out after 2.2s
    const t2 = setTimeout(() => setPhase('out'), 3000);
    // call onDone after fade-out completes
    const t3 = setTimeout(() => onDone?.(), 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <AnimatePresence>
      {phase !== 'out' && (
        <motion.div
          key="splash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{
            background: 'linear-gradient(160deg, #1c1208 0%, #2d1b00 50%, #1a1005 100%)',
          }}
        >
          {/* Subtle radial glow behind the coins */}
          <div
            className="absolute"
            style={{
              width: 320,
              height: 320,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(245,158,11,0.18) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {/* Coin logo — pops in with spring */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.15 }}
          >
            <CoinLogo size={200} animate showName />
          </motion.div>

          {/* Tagline — fades in slightly after the logo */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="mt-6 text-amber-300/60 text-sm tracking-widest uppercase"
            style={{ letterSpacing: '0.2em', fontFamily: 'system-ui, sans-serif' }}
          >
            Give with every purchase
          </motion.p>

          {/* Bottom loading indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.4 }}
            className="absolute bottom-16 flex gap-1.5"
          >
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber-400/50"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
