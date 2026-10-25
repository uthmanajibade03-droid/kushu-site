'use strict';

/*
 * The waitlist (supabase/migrations/…_kushu_waitlist_nurture.sql): an email
 * joins (join_waitlist, which says your place in line). Then three taps, one
 * at a time: what keeps slipping, which devices, a first name. Each is saved
 * as it's answered, the same way. The anon key can only do that, never read
 * the list back. Mast's emails follow (supabase/functions/waitlist-email).
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can only add you to the list.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const valid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const source = new URLSearchParams(location.search).get('from') || 'waitlist';

let email = '';

/** Join, or add to what's saved for this email. */
async function save({ name = null, devices = null, slips = [] } = {}) {
  const { data, error } = await db.rpc('join_waitlist', {
    wanted_email: email, wanted_name: name, wanted_devices: devices, wanted_slips: slips, wanted_source: source,
  });
  if (error) throw error;
  return data;
}

function go(step) {
  for (const s of document.querySelectorAll('.wl .step')) s.classList.toggle('is-on', s.dataset.step === step);
  const input = document.querySelector(`.wl .step[data-step="${step}"] input`);
  if (input) setTimeout(() => input.focus({ preventScroll: true }), 450);
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = $('#note');
  const wanted = $('#email').value.trim();
  note.className = 'note';
  if (!valid(wanted)) {
    note.textContent = 'That email doesn’t look right.';
    note.className = 'note bad';
    return;
  }
  $('#submit').disabled = true;
  note.textContent = '';
  try {
    email = wanted;
    const place = await save();
    const words = place ? `You’re #${place}` : 'You’re on the list';
    for (const p of document.querySelectorAll('.wl .place')) p.textContent = words;
    $('.big-place').textContent = `${words}.`;
    $('[data-top]').hidden = true;
    go('slips');
  } catch {
    note.textContent = 'Something went wrong. Try again?';
    note.className = 'note bad';
  } finally {
    $('#submit').disabled = false;
  }
});

// What keeps slipping: any number, then Next.
const slips = $('.chips.multi');
slips.addEventListener('click', (e) => e.target.closest('button')?.classList.toggle('on'));
$('[data-next]').addEventListener('click', () => {
  const picked = [...slips.querySelectorAll('button.on')].map((b) => b.textContent);
  if (picked.length) void save({ slips: picked }).catch(() => {});
  go('devices');
});

// Which devices: one tap answers and moves on.
$('.chips.one').addEventListener('click', (e) => {
  const chip = e.target.closest('button');
  if (!chip) return;
  for (const b of chip.parentElement.children) b.classList.toggle('on', b === chip);
  void save({ devices: chip.dataset.v }).catch(() => {});
  setTimeout(() => go('name'), 260);
});

// A first name, or not.
$('#name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#name').value.trim();
  if (name) void save({ name }).catch(() => {});
  go('done');
});
$('[data-skip]').addEventListener('click', () => go('done'));

// "Join the waitlist" at the bottom: back up to the email.
$('[data-top]').addEventListener('click', (e) => {
  e.preventDefault();
  scrollTo({ top: 0, behavior: 'smooth' });
  if ($('.wl .step[data-step="join"]').classList.contains('is-on')) setTimeout(() => $('#email').focus({ preventScroll: true }), 500);
});
