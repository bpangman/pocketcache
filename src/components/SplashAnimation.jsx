import { useEffect, useState } from 'react';
import { motion, useAnimate } from 'framer-motion';
import CoinMark from './CoinMark';

// Coin diameter for the splash (app-coordinate px, inside the 390px layout)
const COIN_D = 80;

// 2 full clockwise rotations so the arrow lands pointing UP again
const TOTAL_ROT = 720;

// Rolling distance for exactly 2 rotations (circumference = PI * d)
const TRAVEL = 2 * Math.PI * COIN_D; // ~502.65 px

// Ease that mimics a real coin decelerating under friction
const ROLL_EASE = [0.22, 1, 0.36, 1]; // easeOutQuint-like

export default function SplashAnimation({ onDone }) {
  const [coinScope, animateCoin] = useAnimate();
  // 'rolling' | 'revealing' | 'done'
  const [phase, setPhase] = useState('rolling');

  useEffect(() => {
    let dead = false;

    (async () => {
      // ── Phase 1: roll in from off-screen left to screen center (~1.1s) ──
      // translateX and rotate share the same ease, so rotation stays exactly
      // proportional to travel at every frame (no-slip rolling physics).
      await animateCoin(coinScope.current,
        { x: 0, rotate: TOTAL_ROT },
        { duration: 1.1, ease: ROLL_EASE }
      );
      if (dead) return;

      // ── Phase 2a: micro-overshoot (+4 deg) + squash on "click" ──
      await animateCoin(coinScope.current,
        { rotate: TOTAL_ROT + 4, scaleX: 1.08, scaleY: 0.90 },
        { duration: 0.07, ease: 'linear' }
      );
      if (dead) return;

      // ── Phase 2b: spring snap-back to exact UP ──
      await animateCoin(coinScope.current,
        { rotate: TOTAL_ROT, scaleX: 1, scaleY: 1 },
        { type: 'spring', stiffness: 450, damping: 20 }
      );
      if (dead) return;

      // ── Phase 3: hold at center (750ms) ──
      await new Promise(r => setTimeout(r, 750));
      if (dead) return;

      // ── Phase 4: reveal - coin flies up + fades; background dissolves ──
      setPhase('revealing');
      await animateCoin(coinScope.current,
        { y: -(COIN_D * 3.0), scale: 0.45, opacity: 0 },
        { duration: 0.30, ease: [0.55, 0, 1, 0.45] }
      );
      if (dead) return;

      setPhase('done');
      onDone?.();
    })();

    return () => { dead = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'done') return null;

  return (
    <>
      {/* Navy background overlay - fades out in reveal phase to expose gate screen */}
      <motion.div
        animate={{ opacity: phase === 'revealing' ? 0 : 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #0B2A4A 0%, #003865 100%)',
          zIndex: 100,
          pointerEvents: 'none',
        }}
      />

      {/* Coin - on its own z-layer so it animates independently of the bg */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 101,
          pointerEvents: 'none',
        }}
      >
        {/*
         * The coin element starts with x: -TRAVEL (off-screen left) and
         * rotate: 0 (arrow pointing UP). Framer applies these as the CSS
         * transform starting values before the first animation frame.
         *
         * Physics check:
         *   rotation_deg = travel / (PI * COIN_D) * 360
         *               = TRAVEL / (PI * 80) * 360
         *               = (2 * PI * 80) / (PI * 80) * 360
         *               = 2 * 360 = 720  (arrow back to UP)
         *
         * Since x and rotate share the same ease curve they stay in constant
         * ratio throughout, giving true no-slip rolling at every frame.
         */}
        <motion.div
          ref={coinScope}
          style={{
            width: COIN_D,
            height: COIN_D,
            x: -TRAVEL,
            rotate: 0,
          }}
        >
          <CoinMark size={COIN_D} />
        </motion.div>
      </div>
    </>
  );
}
