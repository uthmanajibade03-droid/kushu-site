'use strict';

/*
 * Waitlist (supabase/migrations/20261030000000_kushu_waitlist.sql): an email goes
 * into public.waitlist. The anon key can only insert, never read the list back.
 * A duplicate email is taken as "already on the list", not an error.
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: row-level security lets it only add an email.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const valid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

function done() {
  $('form').hidden = true;
  const cta = $('cta-note'); if (cta) cta.hidden = true;
  $('done').hidden = false;
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const note = $('note');
  note.className = 'note';
  if (!valid(email)) {
    note.textContent = 'That email doesn’t look right.';
    note.className = 'note bad';
    return;
  }
  $('submit').disabled = true;
  note.textContent = 'Adding you…';
  const source = new URLSearchParams(location.search).get('from') || 'waitlist';
  const { error } = await db.from('waitlist').insert({ email, source });
  $('submit').disabled = false;
  if (error) {
    // 23505 = already on the list: that's fine, treat it as a win.
    if (error.code === '23505' || /duplicate/i.test(error.message || '')) {
      done();
      return;
    }
    note.textContent = 'Something went wrong. Try again?';
    note.className = 'note bad';
    return;
  }
  done();
});
