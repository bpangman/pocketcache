// src/components/ui/Button.jsx
//
// THE button. Twenty-odd hand-rolled className strings across the pages had
// four different primary fills, rectangles next to pills, and four different
// "disabled" looks that all read as tappable. One component, one disabled
// token, one radius per surface. Rules in DESIGN.md (BUTTONS).
//
//   variant   primary   light surface: navy gradient, white label
//                       onDark: gold fill, navy label (hover gold-deep)
//             secondary white, 1px --line border, navy label
//             tertiary  text only, navy-deep label, 44px hit area
//             danger    white, --danger label, 1px #FECACA border
//                       (tone="danger" on primary = filled red, for the one
//                       final destructive confirm only)
//   size      lg 52px (page CTA) | md 44px (sheet / inline CTA)
//   surface   'app' radius 16 (phone) | 'web' pill (portal + marketing)
//   disabled  bg #E6EBF2, text #94A3B8, no gradient, no shadow, cursor
//             not-allowed, aria-disabled. NOT the native `disabled`
//             attribute, so a tap can still surface a hint ("Select your
//             state above") through onDisabledPress - the tap-to-show-hint
//             behavior the gate and signup screens already have.
//
// Pressed scale and hover fills are CSS (.pc-btn in src/index.css) so this
// component has no animation dependency. Focus ring is the global
// focus-visible rule; pass className="pc-on-dark" (or sit inside a .pc-on-dark
// parent) on navy for the gold ring.

const SIZE = {
  lg: { minHeight: 52, padding: '0 20px' },
  md: { minHeight: 44, padding: '0 16px' },
};

const PRIMARY_LIGHT = 'var(--grad-primary)';

function look({ variant, tone, onDark, disabled }) {
  if (disabled) {
    return {
      background: 'var(--disabled-bg)',
      color: 'var(--disabled-text)',
      border: '1px solid transparent',
      boxShadow: 'none',
      cursor: 'not-allowed',
    };
  }
  if (variant === 'primary' && tone === 'danger') {
    return { background: 'var(--danger)', color: 'var(--white)', border: '1px solid transparent' };
  }
  if (variant === 'primary') {
    return onDark
      ? { background: 'var(--gold)', color: 'var(--navy)', border: '1px solid transparent' }
      : { background: PRIMARY_LIGHT, color: 'var(--white)', border: '1px solid transparent' };
  }
  if (variant === 'secondary') {
    return { background: 'var(--white)', color: 'var(--navy)', border: '1px solid var(--line)' };
  }
  if (variant === 'danger') {
    return { background: 'var(--white)', color: 'var(--danger)', border: '1px solid var(--danger-200)' };
  }
  // tertiary
  return {
    background: 'transparent',
    color: tone === 'danger' ? 'var(--danger)' : onDark ? 'var(--white)' : 'var(--navy-deep)',
    border: '1px solid transparent',
  };
}

/**
 * @param {object}   props
 * @param {'primary'|'secondary'|'tertiary'|'danger'} [props.variant='primary']
 * @param {'danger'}  [props.tone]        Destructive tone on primary/tertiary.
 * @param {'lg'|'md'} [props.size='lg']
 * @param {'app'|'web'} [props.surface='app']  Radius: 16 on the phone, pill on the web.
 * @param {boolean}  [props.onDark=false] Primary sits on navy: gold fill.
 * @param {boolean}  [props.disabled=false]  Visual + aria-disabled; see header.
 * @param {Function} [props.onDisabledPress]  Fires instead of onClick while disabled.
 * @param {boolean}  [props.fullWidth=true]
 * @param {boolean}  [props.loading=false]   Treated as disabled, label unchanged
 *                                          (pass the loading label yourself).
 * @param {string}   [props.type='button']
 * @param {string}   [props.className]
 * @param {object}   [props.style]
 */
export default function Button({
  variant = 'primary',
  tone,
  size = 'lg',
  surface = 'app',
  onDark = false,
  disabled = false,
  loading = false,
  onDisabledPress,
  fullWidth = true,
  type = 'button',
  className = '',
  style,
  onClick,
  children,
  ...rest
}) {
  const off = disabled || loading;
  const dims = SIZE[size] ?? SIZE.lg;
  const handleClick = (e) => {
    if (off) {
      e.preventDefault();
      onDisabledPress?.(e);
      return;
    }
    onClick?.(e);
  };
  return (
    <button
      type={type}
      aria-disabled={off ? 'true' : undefined}
      aria-busy={loading ? 'true' : undefined}
      data-variant={variant}
      data-on-dark={onDark ? 'true' : undefined}
      className={`pc-btn ${className}`.trim()}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: fullWidth ? '100%' : undefined,
        minHeight: dims.minHeight,
        padding: variant === 'tertiary' ? '0 12px' : dims.padding,
        borderRadius: surface === 'web' ? 'var(--r-pill)' : 'var(--r-md)',
        fontFamily: 'inherit',
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        cursor: 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        ...look({ variant, tone, onDark, disabled: off }),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
