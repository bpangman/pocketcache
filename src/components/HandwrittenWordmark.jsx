/**
 * HandwrittenWordmark — "PocketCache" in Pacifico cursive with a
 * left-to-right reveal animation that mimics handwriting.
 *
 * Technique: expanding-width overflow-hidden mask via framer-motion
 * width animation from 0 → 100%, combined with a travelling "pen tip"
 * dot that follows the reveal edge and fades out at the end.
 */
import { useRef } from 'react';
import { motion } from 'framer-motion';

export default function HandwrittenWordmark({ fontSize = 38, color = '#ffffff' }) {
  const textRef = useRef(null);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Invisible ghost — establishes the layout width */}
      <span
        style={{
          fontFamily: "'Pacifico', cursive",
          fontSize,
          color: 'transparent',
          lineHeight: 1.2,
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        PocketCache
      </span>

      {/* Animated reveal mask */}
      <motion.div
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          ref={textRef}
          style={{
            fontFamily: "'Pacifico', cursive",
            fontSize,
            color,
            lineHeight: 1.2,
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          PocketCache
        </span>
      </motion.div>

      {/* Pen-tip dot — travels across the leading edge of the reveal */}
      <motion.div
        initial={{ left: '0%', opacity: 1 }}
        animate={{ left: '100%', opacity: 0 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: color,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
