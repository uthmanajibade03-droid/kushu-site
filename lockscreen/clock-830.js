// Mast's lock screen for the demo, signed in, emergency unused: the clock is set to the moment the lock
// begins, then runs on. ?k=reading: Reading, 9:30 to 9:50 PM. ?k=bedtime: Shut down, 11:30 PM to 6 AM.
(() => {
  const kind = new URLSearchParams(location.search).get('k') === 'bedtime' ? 'bedtime' : 'reading';
  const LOCKS = {
    reading: { from: [21, 30], to: [21, 50], cover: { kind: 'custom', name: 'Reading' } },
    bedtime: { from: [23, 30], to: [6, 0], cover: { kind: 'bedtime', name: 'Bedtime' } },
  };
  const lock = LOCKS[kind];
  // ?at=HH:MM: the bedtime the visitor picked (the waitlist's "try it").
  const at = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('at') || '');
  if (at && kind === 'bedtime') lock.from = [Number(at[1]), Number(at[2])];
  const base = new Date(); base.setHours(lock.from[0], lock.from[1], 5, 0);
  const t0 = performance.now();
  const RealDate = Date;
  Date.now = () => base.getTime() + (performance.now() - t0);
  let show = null;
  window.kushu = { onCover: (cb) => { if (!show) show = cb; else { const first = show; show = (c) => { first(c); cb(c); }; } }, onRecitation: () => {}, coverSnooze() {}, coverLimits() {}, coverEmergency() {}, coverNeeded() {}, coverAskFriends: async () => ({ problem: '' }) };
  window.addEventListener('load', () => {
    const start = new RealDate(base); start.setHours(lock.from[0], lock.from[1], 0, 0);
    const end = new RealDate(base); end.setHours(lock.to[0], lock.to[1], 0, 0);
    // A lock that ends earlier in the day than it starts ends the next morning.
    if (end <= start) end.setDate(end.getDate() + 1);
    document.documentElement.dataset.scene = new URLSearchParams(location.search).get('s') || 'field';
    show({ mode: 'lock', ...lock.cover, startedAt: start.getTime(), until: end.getTime(), strict: true, emergency: { available: true }, offAt: null, verse: null });
  });
})();
