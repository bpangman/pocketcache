import { useEffect, useState } from 'react';
import { motion, useAnimate } from 'framer-motion'; // eslint-disable-line no-unused-vars
import CoinMark from './CoinMark';
import { Z } from '../lib/overlay';

// Coin diameter for the splash (app-coordinate px, inside the 390px layout)
const COIN_D = 80;

// 2 full clockwise rotations so the arrow lands pointing UP again
const TOTAL_ROT = 720;

// Rolling distance for exactly 2 rotations (circumference = PI * d)
const TRAVEL = 2 * Math.PI * COIN_D; // ~502.65 px

// Ease that mimics a real coin decelerating under friction
const ROLL_EASE = [0.22, 1, 0.36, 1]; // easeOutQuint-like

// How high the coin pops above center (px)
const POP_HEIGHT = 135;

// ─── Once-per-launch wrapper ─────────────────────────────────────────────────
// The coin splash plays on EVERY app open (round-4 item 6) - cold launch to
// the gate AND cold launch straight to a signed-in dashboard - overlaying
// whatever surface loads first, then revealing it. Module-level flag, not
// component state: in-app navigation can remount whichever shell hosts this
// (gate -> sign-in -> back, donor -> admin mode, etc.), and replaying the
// whole coin roll on any of those hops reads as a bug. A true cold app open
// starts a fresh JS context, which resets the flag - so the splash greets
// every real launch exactly once. Mounted by App.jsx's AppContent (the
// native/mobile app experience); the desktop web surfaces (WebExperience)
// deliberately never render it.
let launchSplashPlayed = false;

export function LaunchSplash() {
  const [done, setDone] = useState(() => launchSplashPlayed);
  if (done) return null;
  return <SplashAnimation onDone={() => { launchSplashPlayed = true; setDone(true); }} />;
}

export default function SplashAnimation({ onDone }) {
  const [coinScope, animateCoin] = useAnimate();
  // 'rolling' | 'revealing' | 'done'
  const [phase, setPhase] = useState('rolling');
  const [showSparkle, setShowSparkle] = useState(false);

  useEffect(() => {
    let dead = false;

    (async () => {
      // -- Phase 1: roll in from off-screen left to screen center (~0.85s) --
      // translateX and rotate share the same ease, so rotation stays exactly
      // proportional to travel at every frame (no-slip rolling physics).
      // 0.85s, down from 1.1s: the easeOutQuint tail read as a dead pause
      // between the roll landing and the coin-up hop (owner feedback), so the
      // whole roll is ~23% tighter and the hop follows almost immediately.
      await animateCoin(coinScope.current,
        { x: 0, rotate: TOTAL_ROT },
        { duration: 0.85, ease: ROLL_EASE }
      );
      if (dead) return;

      // -- Phase 2: Mario-style coin pop (~650ms total) --

      // 2a: pop UP fast (ease-out launch) + first half of vertical-axis spin
      //     Trigger sparkle glint at the same moment (peaks at top of arc)
      setShowSparkle(true);
      await animateCoin(coinScope.current,
        { y: -POP_HEIGHT, rotateY: 180 },
        { duration: 0.25, ease: [0.2, 1, 0.4, 1] }
      );
      if (dead) return;

      // 2b: fall back down under gravity (ease-in) + complete vertical spin
      await animateCoin(coinScope.current,
        { y: 0, rotateY: 360 },
        { duration: 0.35, ease: [0.4, 0, 1, 0.6] }
      );
      if (dead) return;
      setShowSparkle(false);

      // 2c: landing squash (coin hits center)
      await animateCoin(coinScope.current,
        { scaleX: 1.12, scaleY: 0.82 },
        { duration: 0.07, ease: 'linear' }
      );
      if (dead) return;

      // 2d: settle bounce (spring back to normal)
      await animateCoin(coinScope.current,
        { scaleX: 1, scaleY: 1 },
        { type: 'spring', stiffness: 420, damping: 18 }
      );
      if (dead) return;

      // -- Phase 3: hold at center (500ms - was 750ms; the post-landing pause
      // read slightly too long, so it is ~33% tighter per owner feedback) --
      await new Promise(r => setTimeout(r, 500));
      if (dead) return;

      // -- Phase 4: reveal - coin flies up + fades; background dissolves --
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
          zIndex: Z.splash,
          pointerEvents: 'none',
        }}
      />

      {/* Coin - on its own z-layer so it animates independently of the bg.
          perspective on the parent div enables 3D rotateY on the coin child. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: Z.splashMark,
          pointerEvents: 'none',
          perspective: 600,
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
         *
         * After the pop: rotateY ends at 360 (=0, coin face forward),
         * rotate stays at 720 (=0, arrow pointing up). Clean reset.
         */}
        <motion.div
          ref={coinScope}
          style={{
            width: COIN_D,
            height: COIN_D,
            x: -TRAVEL,
            rotate: 0,
            position: 'relative',
          }}
        >
          <CoinMark size={COIN_D} />

          {/* Shine glint - child of coin so it travels with it.
              Visible at top of arc; keyframes fade it in and out naturally. */}
          {showSparkle && (
            <motion.div
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 0], scale: [0.4, 2.2, 0.4] }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                width: COIN_D * 2.2,
                height: COIN_D * 2.2,
                top: -(COIN_D * 0.6),
                left: -(COIN_D * 0.6),
                background:
                  'radial-gradient(circle, rgba(255,255,220,0.9) 0%, rgba(94,234,212,0.45) 45%, transparent 70%)',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
          )}
        </motion.div>
      </div>
    </>
  );
}
