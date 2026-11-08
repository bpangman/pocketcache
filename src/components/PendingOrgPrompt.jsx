// src/components/PendingOrgPrompt.jsx
//
// "Switch your giving to {Y}?" - the confirmation a SIGNED-IN donor sees after
// opening another nonprofit's join link or QR code. The ?org= block in
// store/AppContext.jsx used to silently re-bind the device (and push the new
// cause to donor_profiles) the moment the link opened; it now parks the code
// under pc_pending_org and this prompt asks first (EDGE-CASES D12/C12). Only
// a confirm calls setSelectedNonprofit; "Keep" just drops the pending code.
//
// Self-contained: reads everything from useApp() and renders nothing unless a
// pending org has resolved to an approved org that differs from the current
// one. The mobile donor shell mounts it as a bottom sheet (Sheet.jsx, so it
// gets the scrim, the X and hardware-back for free); the web dashboard mounts
// it as a centred modal - same copy, same two buttons.
//
// NOT the TransferNonprofitSheet: that one hands an admin's nonprofit PAGE to a
// colleague. This is the donor-side cause switch.
import { AnimatePresence, motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import Sheet from './Sheet';
import Button from './ui/Button';
import { Z, scrim } from '../lib/overlay';

function names(pendingOrg, current) {
  const toName = pendingOrg?.shortName || pendingOrg?.name || 'this nonprofit';
  const fromName = current?.shortName || current?.name || 'your current nonprofit';
  return { toName, fromName, title: `Switch your giving to ${toName}?` };
}

/**
 * @param {{ surface?: 'app'|'web' }} props
 */
export default function PendingOrgPrompt({ surface = 'app' }) {
  const app = useApp();
  const pendingOrg = app?.pendingOrg ?? null;
  const { toName, fromName, title } = names(pendingOrg, app?.selectedNonprofit);
  const confirm = () => app?.confirmPendingOrg?.();
  const dismiss = () => app?.dismissPendingOrg?.();
  const body = `Round-ups already collected this month still go to ${fromName}.`;

  if (surface === 'web') {
    return (
      <AnimatePresence>
        {pendingOrg && (
          <motion.div
            key="pending-org-scrim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
            style={{ ...scrim('dim', { fixed: true }), zIndex: Z.modalScrim, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pc-pending-org-title"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              style={{ position: 'relative', zIndex: Z.modal, width: 440, maxWidth: '100%', background: '#fff', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-3)', padding: 24 }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <h3 id="pc-pending-org-title" style={{ margin: 0, fontSize: 22, lineHeight: 1.2, fontWeight: 700, color: 'var(--ink)' }}>{title}</h3>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Close"
                  style={{ flexShrink: 0, width: 44, height: 44, margin: '-10px -10px 0 0', border: 'none', background: 'transparent', borderRadius: 'var(--r-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--slate)' }}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>{body}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                <Button surface="web" size="md" onClick={confirm}>Switch to {toName}</Button>
                <Button surface="web" size="md" variant="secondary" onClick={dismiss}>Keep {fromName}</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // Phone: Sheet owns the scrim, the X, the safe-area padding and hardware
  // back. `show` is driven by the pending org so the sheet animates out.
  return (
    <Sheet show={!!pendingOrg} onClose={dismiss} title={title}>
      <div className="px-6 pt-4">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>{body}</p>
        <div className="flex flex-col gap-2 mt-5">
          <Button size="lg" onClick={confirm}>Switch to {toName}</Button>
          <Button size="lg" variant="secondary" onClick={dismiss}>Keep {fromName}</Button>
        </div>
      </div>
    </Sheet>
  );
}
