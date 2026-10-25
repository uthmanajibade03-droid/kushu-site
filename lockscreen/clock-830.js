// Mast's lock screen for the demo, signed in, emergency unused: the clock is set to the moment the lock
// begins, then runs on. ?k=reading: Reading, 9:30 to 9:50 PM. ?k=bedtime: Shut down, 11:30 PM to 6 AM,
// with the real 10 minutes to save your work before the computer turns off (desktop/lock/shutdown.js).
// ?k=custom&name=Deep%20work: any other lock. ?at=HH:MM and ?to=HH:MM move the start and the end.
(() => {
  const q = new URLSearchParams(location.search);
  const kind = ['bedtime', 'custom'].includes(q.get('k')) ? q.get('k') : 'reading';
  const LOCKS = {
    reading: { from: [21, 30], to: [21, 50], cover: { kind: 'custom', name: 'Reading' } },
    bedtime: { from: [23, 30], to: [6, 0], cover: { kind: 'bedtime', name: 'Bedtime' } },
    custom: { from: [14, 0], to: [16, 0], cover: { kind: 'custom', name: (q.get('name') || 'Focus').slice(0, 30) } },
  };
  const lock = LOCKS[kind];
  const hhmm = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ''); return m ? [Number(m[1]), Number(m[2])] : null; };
  if (hhmm(q.get('at')) && kind !== 'reading') lock.from = hhmm(q.get('at'));
  if (hhmm(q.get('to')) && kind !== 'reading') lock.to = hhmm(q.get('to'));
  const SAVE_MS = 10 * 60_000;
  const base = new Date(); base.setHours(lock.from[0], lock.from[1], 5, 0);
  const t0 = performance.now();
  const RealDate = Date;
  Date.now = () => base.getTime() + (performance.now() - t0);
  let show = null;
  window.kushu = { onCover: (cb) => { if (!show) show = cb; else { const first = show; show = (c) => { first(c); cb(c); }; } }, onRecitation: () => {}, coverSnooze() {}, coverLimits() {}, coverEmergency() {}, coverNeeded() {}, coverAskFriends: async () => ({ problem: '' }), coverSupport: async () => ({ problem: '' }), coverEndPreview() {} };
  window.addEventListener('load', () => {
    const start = new RealDate(base); start.setHours(lock.from[0], lock.from[1], 0, 0);
    const end = new RealDate(base); end.setHours(lock.to[0], lock.to[1], 0, 0);
    // A lock that ends earlier in the day than it starts ends the next morning.
    if (end <= start) end.setDate(end.getDate() + 1);
    document.documentElement.dataset.scene = q.get('s') || 'field';
    const offAt = kind === 'bedtime' ? start.getTime() + SAVE_MS : null;
    show({ mode: 'lock', ...lock.cover, startedAt: start.getTime(), until: end.getTime(), strict: true, emergency: { available: true }, offAt, verse: null });
  });
})();
