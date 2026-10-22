// The Reading lock at 9:30:05 PM, 20 minutes, signed in, emergency unused: the clock is set, then runs on.
(() => {
  const base = new Date(); base.setHours(21, 30, 5, 0);
  const t0 = performance.now();
  const RealDate = Date;
  Date.now = () => base.getTime() + (performance.now() - t0);
  let show = null;
  window.kushu = { onCover: (cb) => { if (!show) show = cb; else { const first = show; show = (c) => { first(c); cb(c); }; } }, onRecitation: () => {}, coverSnooze() {}, coverLimits() {}, coverEmergency() {}, coverNeeded() {}, coverAskFriends: async () => ({ problem: '' }) };
  window.addEventListener('load', () => {
    const start = new RealDate(base); start.setHours(21, 30, 0, 0);
    const end = new RealDate(base); end.setHours(21, 50, 0, 0);
    document.documentElement.dataset.scene = new URLSearchParams(location.search).get('s') || 'field';
    show({ mode: 'lock', kind: 'custom', name: 'Reading', startedAt: start.getTime(), until: end.getTime(), strict: true, emergency: { available: true }, offAt: null, verse: null });
  });
})();
