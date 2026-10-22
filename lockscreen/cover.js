'use strict';

/*
 * The dark cover. Two kinds, one screen:
 *   lock   the phone asked for the computer: a reading session, "Lock my
 *          computer", or a reading schedule. Lifts on its own at the end.
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
    if (current.kind === 'reading') {
      setTime(clockText(now - current.startedAt));
      pour((current.until - now) / Math.max(1, current.until - current.startedAt));
    } else {
      const end = current.offAt || current.until;
      setTime(clockText(end - now));
      pour((end - now) / Math.max(1, end - current.startedAt));
    }
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

function show(c) {
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
      reading: ['Reading', 'You’re reading Qur’an', `On your phone · until ${until}`],
      schedule: ['Reading time', c.name || 'Time to read', `Opens at ${until}`],
      custom: ['Your lock', c.name || 'Locked', `Opens at ${until}`],
      phone: ['Locked from your phone', 'Your computer is locked', `Opens at ${until}`],
    }[c.kind] || ['Locked', 'Your computer is locked', `Opens at ${until}`];
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
    $('c-detail').textContent = c.only ? `${c.name} isn’t on this task’s list` : `${c.name} can wait`;
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
  $('c-needed').hidden = c.mode !== 'task';
  $('c-needed').disabled = false;
  $('c-needed').textContent = 'Needed for this task';
  // A new lock: the ask starts again.
  if (c.mode !== 'lock' || c.startedAt !== askedFor) { $('c-asked').hidden = true; askedFor = null; }
  $('c-ask').hidden = c.mode !== 'lock' || !c.strict || askedFor !== null;
  strictLock = !!c.strict;
  dayVerse = c.verse;
  drawVerse(c.mode === 'lock' && reciting ? reciting : c.verse);
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

let askedFor = null;
let strictLock = false;
let lockStartedAt = null;
window.kushu.onCover((c) => { lockStartedAt = c.startedAt; });
$('c-ask').addEventListener('click', async () => {
  $('c-ask').disabled = true;
  const answer = await window.kushu.coverAskFriends();
  $('c-ask').disabled = false;
  if (answer.problem) { $('c-ask').textContent = answer.problem; return; }
  askedFor = lockStartedAt;
  $('c-ask').hidden = true;
  $('c-qr').innerHTML = answer.svg; // made by main from our own text
  $('c-ask-note').textContent = strictLock ? 'Two friends have to say yes. It opens here by itself.' : 'It opens here by itself when they say yes.';
  $('c-asked').hidden = false;
});

window.kushu.onCover(show);

// The phone's recitation: the verse being recited, or null when it stops.
window.kushu.onRecitation((v) => {
  const was = reciting;
  reciting = v;
  document.body.classList.toggle('reciting', !!v);
  if (!current || current.mode !== 'lock') return;
  if (!v) drawVerse(dayVerse);
  else if (was) scrollToVerse(v);
  else drawVerse(v);
});
