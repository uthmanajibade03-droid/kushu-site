'use strict';

/*
 * The waitlist (supabase/migrations/…_kushu_waitlist_nurture.sql): a name and
 * an email join (join_waitlist, which says your place in line); then, if you
 * like, which devices and what keeps slipping, saved the same way. The anon
 * key can only do that, never read the list back. Mast's emails follow
 * (supabase/functions/waitlist-email).
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can only add you to the list.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const valid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const source = new URLSearchParams(location.search).get('from') || 'waitlist';

/** Who joined on this page: both sign-ups then show it. */
let joined = null;

async function join({ email, name, devices = null, slips = [] }) {
  const { data, error } = await db.rpc('join_waitlist', {
    wanted_email: email, wanted_name: name || null, wanted_devices: devices, wanted_slips: slips, wanted_source: source,
  });
  if (error) throw error;
  return data;
}

function showJoined() {
  for (const box of document.querySelectorAll('.join-box')) {
    box.querySelector('.join-form').hidden = true;
    box.querySelector('.join-done').hidden = false;
    box.querySelector('.join-place').textContent = joined.place ? `You’re #${joined.place} on the list.` : 'You’re on the list.';
  }
}

for (const box of document.querySelectorAll('.join-box')) {
  const form = box.querySelector('.join-form');
  const note = box.querySelector('.join-note');
  const button = form.querySelector('button.join');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const name = form.name.value.trim();
    note.className = 'join-note';
    if (!valid(email)) {
      note.textContent = 'That email doesn’t look right.';
      note.className = 'join-note bad';
      return;
    }
    button.disabled = true;
    note.textContent = 'Adding you…';
    try {
      const place = await join({ email, name });
      joined = { email, name, place };
      note.textContent = '';
      showJoined();
    } catch {
      note.textContent = 'Something went wrong. Try again?';
      note.className = 'join-note bad';
    } finally {
      button.disabled = false;
    }
  });

  // The optional rest: one device answer, any number of slips.
  for (const group of box.querySelectorAll('.join-chips')) {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('button');
      if (!chip) return;
      if (group.classList.contains('multi')) chip.classList.toggle('on');
      else for (const b of group.querySelectorAll('button')) b.classList.toggle('on', b === chip);
    });
  }
  box.querySelector('[data-act="more"]').addEventListener('click', async (e) => {
    if (!joined) return;
    const pick = (name) => [...box.querySelectorAll(`.join-chips[data-name="${name}"] button.on`)].map((b) => b.dataset.v);
    e.target.disabled = true;
    try {
      await join({ ...joined, devices: pick('devices')[0] || null, slips: pick('slips') });
      box.querySelector('.join-more').hidden = true;
      box.querySelector('.join-thanks').hidden = false;
    } catch {
      e.target.disabled = false;
    }
  });
}
