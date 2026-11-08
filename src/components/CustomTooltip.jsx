import { fmtMoney } from '../lib/format';

export default function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="text-white text-xs rounded-input px-3 py-2" style={{ background: 'var(--ink)', boxShadow: 'var(--shadow-3)' }}>
        <p className="font-bold tabular-nums">${fmtMoney(payload[0].value)}</p>
        <p style={{ color: 'var(--muted)' }}>{label}</p>
      </div>
    );
  }
  return null;
}
