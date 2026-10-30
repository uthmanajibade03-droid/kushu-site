/*
 * The waitlist: the horseman in the field, and a small way in.
 *
 * Tapping "Join the waitlist" (or the horseman) sends him galloping off along the
 * horizon, with hoofbeats made here in the browser, and opens a line for an email.
 * The picture under him is the same one without him (…-empty.webp), shown only while
 * he's away; he fades back into his place after.
 *
 * Joining: join_waitlist (supabase/migrations/…_kushu_waitlist_nurture.sql) says
 * your place in line; Mast's emails follow (supabase/functions/waitlist-email).
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can only add you to the list.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';
const source = new URLSearchParams(location.search).get('from') || 'waitlist';

const $ = (s) => document.querySelector(s);

// Where he stands in each picture, in its own pixels (see website/_mock/waitlist-box/).
const LAYOUTS = {
  wide: { w: 2560, h: 1657, px: 0.5, py: 0.58, x: 1321.9, y: 985.7, rw: 149.5 },
  tall: { w: 1179, h: 2556, px: 0.5, py: 0.46, x: 533.3, y: 1255.7, rw: 107.6 },
};
const tall = matchMedia('(max-aspect-ratio: 3/4)');

const rider = $('.rider');
const scene = $('.scene');

/** Put him where he is in the picture, however the screen crops it (background-size: cover). */
function place() {
  const L = LAYOUTS[tall.matches ? 'tall' : 'wide'];
  const vw = scene.clientWidth;
  const vh = scene.clientHeight;
  const k = Math.max(vw / L.w, vh / L.h);
  const ox = (vw - L.w * k) * L.px;
  const oy = (vh - L.h * k) * L.py;
  rider.style.left = `${ox + L.x * k}px`;
  rider.style.top = `${oy + L.y * k}px`;
  rider.style.width = `${L.rw * k}px`;
}
place();
addEventListener('resize', place);
tall.addEventListener('change', place);

// ---- hoofbeats -------------------------------------------------------------

let audio = null;

/** One hoof on dry ground: a low thud with a little grit. */
function hoof(ctx, at, gain, pan) {
  const out = ctx.createStereoPanner();
  out.pan.value = pan;
  out.connect(ctx.destination);
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(95, at);
  thud.frequency.exponentialRampToValueAtTime(48, at + 0.09);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, at);
  tg.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
  thud.connect(tg).connect(out);
  thud.start(at);
  thud.stop(at + 0.15);
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const grit = ctx.createBufferSource();
  grit.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const gg = ctx.createGain();
  gg.gain.value = gain * 0.35;
  grit.connect(lp).connect(gg).connect(out);
  grit.start(at);
}

/** A gallop going away: three beats a stride, quieter and further right as he goes. */
function gallop(seconds) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    return;
  }
  const t0 = audio.currentTime + 0.05;
  const stride = 0.42;
  for (let s = 0; s * stride < seconds; s++) {
    const p = (s * stride) / seconds;
    const gain = 0.5 * (1 - p) ** 1.6 + 0.01;
    const pan = Math.min(0.8, p * 0.9);
    const at = t0 + s * stride;
    hoof(audio, at, gain * 0.7, pan);
    hoof(audio, at + 0.07, gain * 0.8, pan);
    hoof(audio, at + 0.15, gain, pan);
  }
}

// ---- the ride ----------------------------------------------------------------

let riding = false;

/** Off he goes along the horizon, then back in his place. */
function ride() {
  if (riding) return;
  riding = true;
  const go = Math.max(innerWidth * 0.62, innerWidth - rider.getBoundingClientRect().left + 40);
  document.body.classList.add('away');
  gallop(6.4);
  rider.animate(
    [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${go * 0.85}px)`, opacity: 1, offset: 0.82 }, { transform: `translateX(${go}px)`, opacity: 0 }],
    { duration: 7000, easing: 'cubic-bezier(.45, 0, .7, 1)', fill: 'forwards' },
  ).finished.then(() => {
    setTimeout(() => {
      rider.getAnimations().forEach((a) => a.cancel());
      rider.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1400, easing: 'ease-out' }).finished.then(() => {
        document.body.classList.remove('away');
        riding = false;
      });
    }, 1600);
  });
}
rider.addEventListener('click', ride);

// ---- joining -----------------------------------------------------------------

const join = $('.join');
const form = $('.join form');
const input = $('.join input');
const note = $('.join .note');

$('.join .open').addEventListener('click', () => {
  ride();
  join.classList.add('writing');
  setTimeout(() => input.focus({ preventScroll: true }), 350);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = input.value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    note.textContent = 'That email doesn’t look right.';
    return;
  }
  note.textContent = '';
  form.querySelector('button').disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/join_waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ wanted_email: email, wanted_name: null, wanted_devices: null, wanted_slips: [], wanted_source: source }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const place = await res.json();
    join.classList.remove('writing');
    join.classList.add('joined');
    note.textContent = Number.isFinite(place) ? `You’re #${place}. Watch your inbox.` : 'You’re on the list. Watch your inbox.';
  } catch {
    note.textContent = 'Couldn’t join just now. Try again.';
    form.querySelector('button').disabled = false;
  }
});
