// src/components/ui/Toggle.jsx
//
// THE switch. The Settings list had its own 48x28 toggle (iOS is 51x31) with
// no accessible name, and only the toggle - not the row - was tappable. This
// is the one switch every surface uses (DESIGN.md, TOGGLES):
//
//   51x31 track, 27px knob. On = --teal-ui (or `color`, usually brand.primary
//   on tenant-themed screens), off = #E2E8F0. role="switch", aria-checked,
//   aria-label from the row label.
//
// The button is 44px tall so the hit area meets the touch minimum without
// changing the visual size (the track is centered inside it). onClick stops
// propagation so a row that is itself tappable (SettingRow onPress) does not
// flip the value twice.

const TRACK_W = 51;
const TRACK_H = 31;
const KNOB = 27;
const PAD = (TRACK_H - KNOB) / 2; // 2px

/**
 * @param {object}   props
 * @param {boolean}  props.checked
 * @param {Function} props.onChange     Called with the NEXT value.
 * @param {string}   props.label        Accessible name (the row's label).
 * @param {string}   [props.color]      On color; defaults to --teal-ui.
 * @param {boolean}  [props.disabled=false]
 * @param {string}   [props.className]
 * @param {object}   [props.style]
 */
export default function Toggle({ checked, onChange, label, color, disabled = false, className = '', style, ...rest }) {
  const on = !!checked;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled ? 'true' : undefined}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onChange?.(!on);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: TRACK_W,
        minWidth: TRACK_W,
        height: 44,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          display: 'block',
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: 'var(--r-pill)',
          background: on ? (color || 'var(--teal-ui)') : 'var(--line-strong)',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 200ms var(--ease-out)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: PAD,
            left: PAD,
            width: KNOB,
            height: KNOB,
            borderRadius: '50%',
            background: 'var(--white)',
            boxShadow: '0 2px 4px rgba(11,42,74,0.20), 0 1px 1px rgba(11,42,74,0.10)',
            transform: on ? `translateX(${TRACK_W - KNOB - PAD * 2}px)` : 'translateX(0)',
            transition: 'transform 200ms var(--ease-out)',
          }}
        />
      </span>
    </button>
  );
}
