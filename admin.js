'use strict';

/*
 * Admin (supabase/migrations/20261028000000_kushu_admin.sql): everyone with a Mast
 * account, the ones waiting on a lock first. Someone emails support from a lock
 * (the email says their account); find them here, and Unlock lets them out of
 * that lock on every device. Only people in public.admins see anything.
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can do only what row-level security allows.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const $ = (id) => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let email = '';
let people = [];

function show(...ids) {
  for (const id of ['email-form', 'code-form', 'list']) $(id).hidden = !ids.includes(id);
}

function problem(text) {
  $('problem').hidden = !text;
  $('problem').textContent = text || '';
}

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never');
const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

async function load() {
  const { data, error } = await db.rpc('admin_people');
  if (error) {
    problem(String(error.message).includes('not-admin') ? 'This account isn’t an admin.' : 'Couldn’t load. Try again.');
    show();
    return;
  }
  people = data || [];
  problem('');
  show('list');
  draw();
}

function draw() {
  const q = $('find').value.trim().toLowerCase();
  const list = $('people');
  list.replaceChildren();
  for (const p of people.filter((x) => !q || (x.email || '').toLowerCase().includes(q))) {
    const row = document.createElement('div');
    row.className = p.request ? 'person waiting' : 'person';
    const who = document.createElement('div');
    who.className = 'who';
    const b = document.createElement('b');
    b.textContent = p.email || '(no email)';
    const small = document.createElement('small');
    small.textContent = p.request
      ? `${p.request_method === 'support' ? 'Asked support' : 'Asked a friend'} ${when(p.asked_at)} · ${p.lock_name}, until ${clock(p.lock_until)}`
      : `Joined ${when(p.joined)} · last signed in ${when(p.last_seen)}`;
    who.append(b, small);
    // Everyone can be let out: an ask names its lock; without one, whatever is on for them now.
    const btn = document.createElement('button');
    btn.className = p.request ? 'button' : 'button light';
    btn.type = 'button';
    btn.textContent = 'Unlock';
    btn.addEventListener('click', () => unlock(p, btn));
    row.append(who, btn);
    list.append(row);
  }
  if (!list.children.length) {
    const none = document.createElement('p');
    none.textContent = 'Nobody matches.';
    list.append(none);
  }
}

async function unlock(p, btn) {
  const what = p.request ? `${p.lock_name} (until ${clock(p.lock_until)})` : 'whatever lock is on for them now';
  if (!confirm(`Let ${p.email} out of ${what}?`)) return;
  btn.disabled = true;
  const { data, error } = p.request
    ? await db.rpc('admin_unlock', { request: p.request })
    : await db.rpc('admin_unlock_person', { person: p.user_id });
  if (error || data !== 'approved') {
    problem(error ? 'Couldn’t unlock. Try again.' : data === 'over' ? 'That lock has already ended.' : `Not unlocked (${data}).`);
    btn.disabled = false;
  } else if (!p.request) {
    problem('');
    alert(`Done. Mast on ${p.email}’s devices lets them out within a few seconds (it needs Mast 0.1.78 or later).`);
  }
  await load();
}

$('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  email = $('email').value.trim();
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) { problem('Couldn’t send a code to that email.'); return; }
  problem('');
  show('code-form');
  $('code').focus();
});

$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { error } = await db.auth.verifyOtp({ email, token: $('code').value.trim(), type: 'email' });
  if (error) { problem('That code didn’t work.'); return; }
  await load();
});

$('find').addEventListener('input', draw);

(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    $('signed-in').hidden = false;
    $('signed-in').textContent = `Signed in as ${data.session.user.email}.`;
    await load();
  } else show('email-form');
  // A new ask shows up by itself.
  setInterval(() => { if (!$('list').hidden) load(); }, 20000);
})();
