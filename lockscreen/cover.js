'use strict';

/*
 * The dark cover. Two kinds, one screen:
 *   lock   the phone asked for the computer: "Lock my computer", a prayer or
 *          bedtime lock, or a scheduled focus time. Lifts on its own at the end.
 *   limit  an app past its daily limit. Lifts when you switch to another app.
 * Main decides when it shows and goes; this only draws it.
 */

const $ = (id) => document.getElementById(id);
// The big number, lined up with the words: a leading 1 sits in a wide slot, so it's pulled left more.
const setTime = (text) => { const el = $('c-time'); el.textContent = text; el.classList.toggle('lead-1', /^1/.test(text)); };
let current = null;
let ticker = null;

/** "0h 17m 42s", as the phone shows it. */
function elapsedText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

function durationText(ms) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function clock(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "11:42", or "1:05:12" past the hour: the big clock on the card. */
function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The oxblood in the tube: what's left of the time, draining to empty. */
function pour(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  $('c-liquid').style.height = `${Math.round(f * 100)}%`;
  $('c-liquid').classList.toggle('empty', f < 0.03);
  $('c-drain-fill').style.width = `${(f * 100).toFixed(2)}%`;
}

function tick() {
  if (!current) return;
  const now = Date.now();
  if (current.mode === 'lock') {
    const end = current.offAt || current.until;
    setTime(clockText(end - now));
    pour((end - now) / Math.max(1, end - current.startedAt));
  } else if (current.mode === 'banned') {
    setTime(current.until ? `${Math.max(1, Math.ceil((current.until - now) / 86_400_000))} days` : '');
  } else if (current.mode === 'task') {
    setTime(clockText(current.until - now));
    pour((current.until - now) / Math.max(1, current.until - (current.startedAt || current.shownAt)));
  } else {
    setTime(durationText(current.usedMs + (now - current.shownAt)));
  }
}

/** The day's verse, until a recitation takes the box over. */
let dayVerse = null;
let reciting = null;

function verseItem(v) {
  const item = document.createElement('div');
  item.className = 'verse-item';
  const arabic = document.createElement('p');
  arabic.className = 'arabic';
  arabic.lang = 'ar';
  arabic.dir = 'rtl';
  arabic.textContent = v.arabic;
  const english = document.createElement('p');
  english.className = 'english';
  english.textContent = v.english;
  const ref = document.createElement('figcaption');
  ref.textContent = `${v.surahName} ${v.surah}:${v.ayah}`;
  item.append(arabic, english, ref);
  return item;
}

/** One verse, in place, with no motion. */
function drawVerse(v) {
  const box = $('c-verse');
  const reel = $('c-reel');
  box.hidden = !v;
  reel.classList.remove('sliding');
  reel.style.transform = '';
  reel.replaceChildren();
  box.style.height = '';
  if (v) reel.append(verseItem(v));
}

/**
 * The next verse of a recitation: it comes in under the one before, the
 * stack slides up so the old one leaves through the top of the box, and the
 * box eases to the new verse's height.
 */
function scrollToVerse(v) {
  const box = $('c-verse');
  const reel = $('c-reel');
  if (box.hidden || !reel.firstChild || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return drawVerse(v);
  // A slide still running finishes at once.
  while (reel.children.length > 1) reel.firstChild.remove();
  reel.classList.remove('sliding');
  reel.style.transform = '';
  const old = reel.firstChild;
  box.style.height = `${old.offsetHeight}px`;
  const item = verseItem(v);
  reel.append(item);
  void reel.offsetHeight;
  reel.classList.add('sliding');
  reel.style.transform = `translateY(-${old.offsetHeight}px)`;
  box.style.height = `${item.offsetHeight}px`;
  reel.addEventListener('transitionend', function done(e) {
    if (e.target !== reel) return;
    reel.removeEventListener('transitionend', done);
    if (old.parentNode === reel) old.remove();
    reel.classList.remove('sliding');
    reel.style.transform = '';
    box.style.height = '';
  });
}

/** The verse on the screen, recited once as a prayer lock comes on; stopped when the lock goes. */
let recital = null;
let recitedFor = null;
function recite(c) {
  const lockKey = c.mode === 'lock' ? `${c.kind}:${c.startedAt}` : null;
  if (lockKey === recitedFor) return;
  if (recital) { recital.pause(); recital = null; }
  recitedFor = lockKey;
  if (!lockKey || !c.recite) return;
  recital = new Audio(c.recite);
  recital.play().catch(() => {});
}

function show(c) {
  recite(c);
  // A new cover rises in; the same one, updated, stays still.
  if (!current || current.mode !== c.mode || current.until !== c.until || current.startedAt !== c.startedAt) {
    const cover = document.querySelector('.cover');
    cover.classList.remove('arrive');
    void cover.offsetWidth;
    cover.classList.add('arrive');
  }
  current = { ...c, shownAt: Date.now() };
  if (c.mode === 'lock') {
    const until = clock(c.until);
    // [small label, title, line under the clock]
    const words = {
      prayer: [c.name, 'Go and pray', `Opens at ${until}`],
      bedtime: ['Shut down', 'Saving your work', `Off until ${until}`],
      calendar: ['From your calendar', c.name || 'On your calendar', `Opens at ${until}`],
      custom: c.ease
        ? ['Easing in', c.name || 'Your lock', `Locks ${c.ease.minutes} min from ${new Date(c.ease.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`]
        : ['Your lock', c.name || 'Locked', `Opens at ${until}`],
      phone: ['Locked from your phone', 'Your computer is locked', `Opens at ${until}`],
    }[c.kind] || ['Locked', 'Your computer is locked', `Opens at ${until}`];
    // Support said yes: it opens in a moment, for the minutes asked.
    if (c.opening) {
      words[0] = 'Support said yes';
      words[1] = c.name || words[1];
      words[2] = `Opens at ${clock(c.opening.at)}${c.opening.minutes ? ` · for ${c.opening.minutes} min` : ''}`;
    }
    $('c-label').textContent = words[0];
    $('c-title').textContent = words[1];
    $('c-detail').textContent = words[2];
    $('c-foot').textContent = '';
    $('c-limits').hidden = true;
    $('c-more').hidden = true;
  } else if (c.mode === 'banned') {
    $('c-label').textContent = 'Blocked';
    $('c-title').textContent = `${c.name} is blocked`;
    $('c-detail').textContent = c.until ? `Until ${new Date(c.until).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}` : 'For good';
    $('c-foot').textContent = 'Switch to something else.';
    $('c-limits').hidden = true;
    $('c-more').hidden = true;
  } else if (c.mode === 'task') {
    $('c-label').textContent = 'Now';
    $('c-title').textContent = c.task;
    $('c-detail').textContent = `${c.name} is blocked until ${clock(c.until)}`;
    $('c-foot').textContent = c.site ? 'Press Ctrl+W to close the tab.' : 'Switch to what this task needs.';
    $('c-limits').hidden = true;
    $('c-more').hidden = true;
  } else {
    $('c-label').textContent = `Today in ${c.app}`;
    $('c-title').textContent = `That’s enough ${c.app}`;
    $('c-detail').textContent = `Your limit is ${durationText(c.limitMinutes * 60_000)}`;
    $('c-foot').textContent = c.canSnooze ? 'Five more minutes, up to three times a day.' : 'No more extra time today.';
    $('c-limits').hidden = false;
    $('c-more').hidden = !c.canSnooze;
  }
  // The tube and the bookmark belong to a lock or a task, not an app's limit.
  // The time left drains as a line, for a lock or a task; an app's limit or a ban has none.
  $('c-drain').hidden = c.mode === 'limit' || c.mode === 'banned';
  showEmergency(c.mode === 'lock' ? c.emergency : null);
  // Social media is blocked completely while a to-do runs: nothing to allow.
  $('c-needed').hidden = true;
  $('c-needed').disabled = false;
  $('c-needed').textContent = 'Needed for this task';
  // A new lock: the ask starts again.
  if (c.mode !== 'lock' || lockId(c) !== askedFor) { $('c-asked').hidden = true; askedFor = null; }
  // Asking a friend moves to the Mast phone app (a notification, yes with Face ID); the web pages
  // it used are gone, so the button waits for it. Contact support stays.
  $('c-ask').hidden = true;
  // Something wrong with this lock: support is a way to reach a person.
  if (c.mode !== 'lock' || lockId(c) !== supportFor) { $('c-support-panel').hidden = true; supportFor = null; }
  $('c-support').hidden = c.mode !== 'lock' || !!c.preview || supportFor !== null || !!c.opening;
  // Waiting to open: nothing to ask for.
  if (c.opening) { $('c-support-panel').hidden = true; showEmergency(null); }
  strictLock = !!c.strict;
  dayVerse = c.mode === 'lock' && c.kind === 'prayer' ? c.verse : null;
  // The verse in the middle of the screen is for prayer locks only (or whatever the phone is reciting).
  drawVerse(c.mode === 'lock' && reciting ? reciting : c.mode === 'lock' && c.kind === 'prayer' ? c.verse : null);
  tick();
  clearInterval(ticker);
  ticker = setInterval(tick, 1000);
  if (!$('c-more').hidden) $('c-more').focus();
}

$('c-more').addEventListener('click', () => window.kushu.coverSnooze());

// The week's emergency: offered, then asked again before it is spent.
function showEmergency(e) {
  const btn = $('c-emergency');
  $('c-confirm').hidden = true;
  if (!e) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.disabled = !e.available;
  btn.textContent = e.available
    ? 'Emergency'
    : `Emergency used this week · next on ${new Date(e.next).toLocaleDateString(undefined, { weekday: 'long' })}`;
  btn.classList.toggle('plain', !e.available);
}
$('c-emergency').addEventListener('click', () => {
  $('c-emergency').hidden = true;
  $('c-confirm').hidden = false;
  $('c-keep').focus();
});
$('c-keep').addEventListener('click', () => {
  $('c-confirm').hidden = true;
  $('c-emergency').hidden = false;
});
$('c-use').addEventListener('click', () => window.kushu.coverEmergency());
$('c-limits').addEventListener('click', () => window.kushu.coverLimits());

// A task's cover: say it's needed, and from the task's next time it isn't covered.
$('c-needed').addEventListener('click', () => {
  window.kushu.coverNeeded();
  $('c-needed').disabled = true;
  $('c-needed').textContent = 'Allowed from next time';
});

/**
 * Which lock this is: by its start alone, bedtime and a calendar Sleep starting at the same
 * minute looked like one lock, and the second kept the first one's QR codes.
 */
const lockId = (c) => `${c.kind}|${c.name}|${c.startedAt}|${c.until}`;
let askedFor = null;
let strictLock = false;
let lockNow = null;
window.kushu.onCover((c) => { lockNow = lockId(c); });
let supportFor = null;
let supportMinutes = 15;
function showMinutes() {
  for (const b of document.querySelectorAll('#c-support-mins [data-m]')) b.setAttribute('aria-pressed', String(Number(b.dataset.m) === supportMinutes));
}
$('c-support').addEventListener('click', () => {
  supportFor = current && lockId(current);
  $('c-support-form').hidden = false;
  $('c-support-note').textContent = '';
  showMinutes();
  $('c-support').hidden = true;
  $('c-support-panel').hidden = false;
  $('c-support-reason').focus();
});
$('c-support-mins').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  supportMinutes = Number(b.dataset.m);
  showMinutes();
});
$('c-support-cancel').addEventListener('click', () => {
  $('c-support-panel').hidden = true;
  $('c-support').hidden = false;
  supportFor = null;
});
$('c-support-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('c-support-send').disabled = true;
  const answer = await window.kushu.coverSupport({ minutes: supportMinutes, reason: $('c-support-reason').value, evidence: $('c-support-evidence').value });
  $('c-support-send').disabled = false;
  if (answer && answer.problem) { $('c-support-note').textContent = answer.problem; return; }
  $('c-support-form').hidden = true;
  $('c-support-note').textContent = `Sent. If support says yes, it opens 5 minutes later, for ${supportMinutes} min.`;
});
$('c-ask').addEventListener('click', async () => {
  $('c-ask').disabled = true;
  const answer = await window.kushu.coverAskFriends();
  $('c-ask').disabled = false;
  if (answer.problem) { $('c-ask').textContent = answer.problem; return; }
  askedFor = lockNow;
  $('c-ask').hidden = true;
  $('c-qr').innerHTML = answer.svg; // made by main from our own text
  $('c-ask-note').textContent = strictLock ? 'Two friends have to say yes. It opens here by itself.' : 'It opens here by itself when they say yes.';
  $('c-asked').hidden = false;
});

window.kushu.onCover(show);
// Try it, from the Prayer page: the lock as it will be, with a way back and nothing to spend.
window.kushu.onCover((c) => {
  const end = $('c-end-preview');
  end.hidden = !c.preview;
  if (!c.preview) return;
  for (const b of $('c-dock').children) if (b !== end) b.hidden = true;
  $('c-foot').textContent = 'A preview. It ends by itself in a moment.';
});
$('c-end-preview').addEventListener('click', () => window.kushu.coverEndPreview());

