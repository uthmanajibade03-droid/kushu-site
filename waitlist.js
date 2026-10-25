'use strict';

/*
 * The waitlist page.
 *
 * Sign-up (supabase/migrations/…_kushu_waitlist_nurture.sql): an email joins
 * (join_waitlist, which says your place in line). Then three taps, one at a
 * time: what keeps slipping, which devices, a first name. Each is saved as
 * it's answered. The anon key can only do that, never read the list back.
 * Mast's emails follow (supabase/functions/waitlist-email).
 *
 * The story: one night, a scene per scroll, as Mast really runs it. Notices
 * and the red glow 5 minutes ahead (desktop/main.js), the lock screen with 10
 * minutes to save your work (lockscreen/, the app's own page), then the
 * computer off and the phone's apps shielded until morning. The last scene
 * plays any other lock when asked.
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can only add you to the list.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const source = new URLSearchParams(location.search).get('from') || 'waitlist';

// ---- the sign-up ------------------------------------------------------------

const SLIPS = ['Going to bed', 'Deep work', 'Prayer', 'Studying', 'The gym', 'Family time'];
const BOX = `
  <div class="step on" data-step="join">
    <form class="pill-form" novalidate>
      <input type="email" inputmode="email" autocomplete="email" placeholder="you@email.com" aria-label="Email">
      <button class="join" type="submit">Join the waitlist</button>
    </form>
    <p class="note" role="status"></p>
  </div>
  <div class="step" data-step="slips">
    <p class="place"></p>
    <p class="ask">What keeps slipping?</p>
    <div class="chips multi">${SLIPS.map((x) => `<button type="button">${x}</button>`).join('')}</div>
    <button class="join small" type="button" data-next>Next</button>
    <p class="count">1 of 3</p>
  </div>
  <div class="step" data-step="devices">
    <p class="place"></p>
    <p class="ask">Where do you lose it?</p>
    <div class="chips one"><button type="button" data-v="phone">Phone</button><button type="button" data-v="computer">Computer</button><button type="button" data-v="both">Both</button></div>
    <p class="count">2 of 3</p>
  </div>
  <div class="step" data-step="name">
    <p class="place"></p>
    <p class="ask">What should we call you?</p>
    <form class="pill-form" data-name novalidate>
      <input type="text" autocomplete="given-name" placeholder="First name" maxlength="60" aria-label="First name">
      <button class="join" type="submit">Done</button>
    </form>
    <button class="skip" type="button" data-skip>Skip</button>
    <p class="count">3 of 3</p>
  </div>
  <div class="step" data-step="done">
    <p class="done-big"></p>
    <p class="done-line">We’re letting people in a few at a time. Watch your inbox.</p>
  </div>`;

let email = '';

/** Join, or add to what's saved for this email. */
async function save({ name = null, devices = null, slips = [] } = {}) {
  const { data, error } = await db.rpc('join_waitlist', {
    wanted_email: email, wanted_name: name, wanted_devices: devices, wanted_slips: slips, wanted_source: source,
  });
  if (error) throw error;
  return data;
}

/** Every sign-up box on the page shows the same step. */
function go(step) {
  for (const s of $$('.joinbox > .step')) s.classList.toggle('on', s.dataset.step === step);
}

for (const box of $$('.joinbox')) {
  box.innerHTML = BOX;
  const form = $('form:not([data-name])', box);
  const note = $('.note', box);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const wanted = $('input', form).value.trim();
    note.className = 'note';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wanted)) {
      note.textContent = 'That email doesn’t look right.';
      note.className = 'note bad';
      return;
    }
    $('button', form).disabled = true;
    note.textContent = '';
    try {
      email = wanted;
      const place = await save();
      const words = place ? `You’re #${place}` : 'You’re on the list';
      for (const p of $$('.joinbox .place')) p.textContent = words;
      for (const p of $$('.joinbox .done-big')) p.textContent = `${words}.`;
      go('slips');
    } catch {
      note.textContent = 'Something went wrong. Try again?';
      note.className = 'note bad';
    } finally {
      $('button', form).disabled = false;
    }
  });

  // What keeps slipping: any number, then Next.
  $('.chips.multi', box).addEventListener('click', (e) => e.target.closest('button')?.classList.toggle('on'));
  $('[data-next]', box).addEventListener('click', () => {
    const picked = $$('.chips.multi button.on', box).map((b) => b.textContent);
    if (picked.length) void save({ slips: picked }).catch(() => {});
    go('devices');
  });

  // Which devices: one tap answers and moves on.
  $('.chips.one', box).addEventListener('click', (e) => {
    const chip = e.target.closest('button');
    if (!chip) return;
    for (const b of chip.parentElement.children) b.classList.toggle('on', b === chip);
    void save({ devices: chip.dataset.v }).catch(() => {});
    setTimeout(() => go('name'), 260);
  });

  // A first name, or not.
  $('form[data-name]', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('input', e.target).value.trim();
    if (name) void save({ name }).catch(() => {});
    go('done');
  });
  $('[data-skip]', box).addEventListener('click', () => go('done'));
}

// ---- the story ----------------------------------------------------------------

const story = $('#story');
const pin = $('.pin', story);
const lockFrame = $('.lockframe', story);
const YT = 'https://www.youtube-nocookie.com/embed/D7GseTY3__Y?autoplay=1&mute=1&controls=0&loop=1&playlist=D7GseTY3__Y&playsinline=1&rel=0&enablejsapi=1';

const clock = (m) => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const hhmm = (m) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;

/** The rig's state: which of glow, notice, locked, off are showing, the clock, the warnings' words. */
/** YouTube sometimes pauses a muted video it can't see: ask it to play again. */
function playVideos() {
  for (const f of $$('iframe[data-yt]', story)) f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
}

function rig({ on = true, glow = false, notice = false, locked = false, off = false, at = null, toast = null, banner = null } = {}) {
  pin.classList.toggle('rig-on', on);
  if (on) playVideos();
  pin.classList.toggle('glow', glow);
  pin.classList.toggle('notice', notice);
  pin.classList.toggle('n-off', off);
  if (locked && !pin.classList.contains('n-locked')) {
    pin.classList.remove('n-thud');
    void pin.offsetWidth;
    pin.classList.add('n-thud');
  }
  pin.classList.toggle('n-locked', locked);
  if (at !== null) $('.cclock', pin).textContent = clock(at);
  if (toast) { $('.toast-t', pin).textContent = toast[0]; $('.toast-b', pin).textContent = toast[1]; }
  if (banner) $('.banner-t', pin).textContent = banner;
}

/** One caption, top centre: the first part bright, the rest quieter. */
let capText = '';
function caption(a = '', b = '') {
  const key = a + '|' + b;
  if (key === capText) return;
  capText = key;
  const cap = $('.cap', pin);
  cap.classList.add('swap');
  setTimeout(() => {
    $('.cap-a', cap).textContent = a;
    $('.cap-b', cap).textContent = b;
    cap.classList.remove('swap');
  }, 220);
}

function huge(html, morning = false) {
  const el = $('.n-huge', pin);
  el.classList.toggle('on', !!html);
  el.classList.toggle('morning', morning);
  if (html) el.innerHTML = html;
}

/** Load the lock screen for a lock, so it's ready when it lands. */
let lockQuery = '';
function loadLock(query) {
  if (query === lockQuery) return;
  lockQuery = query;
  lockFrame.src = `lockscreen/index.html?${query}&s=${document.body.classList.contains('blossom') ? 'blossom' : 'field'}&t=${Date.now()}`;
}

const BEDTIME = 23 * 60;
const BEATS = [
  () => { rig({ on: false }); huge('11:00 PM'); caption('You said you’d stop at 11.'); },
  () => { rig({ on: false }); playVideos(); huge('1:14 AM'); caption('It’s 1 AM.', 'Still scrolling. Again.'); },
  () => {
    huge('');
    loadLock(`k=bedtime&at=${hhmm(BEDTIME)}`);
    rig({ glow: true, notice: true, at: BEDTIME - 5, toast: ['Shutting down in 5 min', 'Save what you’re doing. 11:00 PM – 6:00 AM.'], banner: 'Shutting down in 5 minutes' });
    caption('With Mast, you set bedtime once.', 'At 10:55 it warns you, and your screen’s edges glow red.');
  },
  () => { huge(''); loadLock(`k=bedtime&at=${hhmm(BEDTIME)}`); rig({ locked: true, at: BEDTIME }); caption('11:00 PM.', 'Your apps lock on both. You get 10 minutes to save your work.'); },
  () => { huge(''); loadLock(`k=bedtime&at=${hhmm(BEDTIME)}`); rig({ locked: true, off: true, at: BEDTIME + 10 }); caption('11:10 PM.', 'Your computer turns off. Your phone stays locked until 6 AM.'); },
  () => { rig({ on: false }); huge('6:00 AM.<br><span>You actually slept.</span>', true); caption(''); },
  () => { huge(''); stopTry(); rig({ at: 13 * 60 + 52 }); caption('Not just bedtime.', 'Pick a lock and watch what happens.'); },
];
story.style.setProperty('--beats', BEATS.length);
$('.dots', pin).innerHTML = BEATS.map(() => '<i></i>').join('');

let beat = -1;
function onScroll() {
  const vh = innerHeight;
  const into = scrollY - story.offsetTop;
  // The videos load as the story comes near, not with the page.
  if (into > -vh * 1.5) for (const f of $$('iframe[data-yt]', story)) if (!f.src) f.src = YT;
  const next = Math.max(0, Math.min(BEATS.length - 1, Math.round(into / vh)));
  if (next === beat) return;
  if (beat === BEATS.length - 1) stopTry();
  beat = next;
  pin.dataset.beat = String(next);
  $$('.dots i', pin).forEach((d, i) => d.classList.toggle('on', i === next));
  BEATS[next]();
}

function fit() {
  const w = $('.cscreen', pin).clientWidth;
  lockFrame.style.transform = `scale(${w / 1600})`;
}

addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { fit(); onScroll(); });
fit();
onScroll();

// ---- the last scene: any lock, played -----------------------------------------

const TRY = {
  work: { name: 'Deep work', at: 14 * 60, to: 16 * 60 },
  study: { name: 'Study', at: 19 * 60, to: 20 * 60 + 30 },
  dinner: { name: 'Family dinner', at: 18 * 60 + 30, to: 19 * 60 + 30 },
};
let pick = 'work';
let timers = [];
const later = (ms, fn) => timers.push(setTimeout(fn, ms));

function stopTry() {
  timers.forEach(clearTimeout);
  timers = [];
  pin.classList.remove('playing');
  $('.try-pick', pin).hidden = false;
  $('.try-done', pin).hidden = true;
}

function play() {
  stopTry();
  const l = TRY[pick];
  pin.classList.add('playing');
  loadLock(`k=custom&name=${encodeURIComponent(l.name)}&at=${hhmm(l.at)}&to=${hhmm(l.to)}`);
  const span = `${clock(l.at)} – ${clock(l.to)}`;
  rig({ at: l.at - 6 });
  caption(`${clock(l.at - 6)}.`, 'Still on YouTube.');
  later(1800, () => {
    rig({ glow: true, notice: true, at: l.at - 5, toast: [`${l.name} locks in 5 min`, `Save what you’re doing. ${span}.`], banner: `${l.name} in 5 minutes` });
    caption(`${clock(l.at - 5)}.`, 'Mast warns you, five minutes ahead.');
  });
  for (let i = 4; i >= 1; i--) later(1800 + (5 - i) * 900, () => rig({ glow: true, notice: i > 2, at: l.at - i }));
  later(1800 + 5 * 900, () => { rig({ locked: true, at: l.at }); caption(`${clock(l.at)}.`, `${l.name}. Your apps stay locked until ${clock(l.to)}.`); });
  later(1800 + 5 * 900 + 4800, () => {
    caption('That’s Mast.', `${l.name}, at ${clock(l.at)}, on the days you choose. You only set it once.`);
    pin.classList.remove('playing');
    $('.try-pick', pin).hidden = true;
    $('.try-done', pin).hidden = false;
  });
}

$('.try .chips', pin).addEventListener('click', (e) => {
  const chip = e.target.closest('button');
  if (!chip) return;
  pick = chip.dataset.lock;
  for (const b of chip.parentElement.children) b.classList.toggle('on', b === chip);
});
$('[data-watch]', pin).addEventListener('click', play);
$('[data-again]', pin).addEventListener('click', () => { stopTry(); rig({ at: 13 * 60 + 52 }); caption('Not just bedtime.', 'Pick a lock and watch what happens.'); });
$('[data-tojoin]', pin).addEventListener('click', () => {
  $('#join').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => $('#join .joinbox input')?.focus({ preventScroll: true }), 700);
});
