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
let people = [];

function show(...ids) {
  for (const id of ['signin', 'list']) $(id).hidden = !ids.includes(id);
}

function problem(text) {
  $('problem').hidden = !text;
  $('problem').textContent = text || '';
}

const when = (iso) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `today ${time}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const clock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** The waitlist, newest first (admin_waitlist). */
let waitlist = [];

async function load() {
  void db.rpc('admin_waitlist').then(({ data }) => { waitlist = data || []; draw(); });
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

let tab = 'waiting';
const initial = (e) => (e || '?').slice(0, 1).toUpperCase();
const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };

/** Waiting: a card per ask, with its lock and Unlock. Everyone: one quiet line each. */
function draw() {
  const waiting = people.filter((p) => p.request);
  $('n-waiting').textContent = waiting.length;
  $('n-waiting').classList.toggle('zero', !waiting.length);
  $('n-all').textContent = people.length;
  $('n-waitlist').textContent = waitlist.length;
  $('n-waitlist').classList.toggle('zero', !waitlist.length);
  $('tab-waiting').setAttribute('aria-pressed', String(tab === 'waiting'));
  $('tab-all').setAttribute('aria-pressed', String(tab === 'all'));
  $('tab-waitlist').setAttribute('aria-pressed', String(tab === 'waitlist'));
  $('csv').hidden = tab !== 'waitlist' || !waitlist.length;
  $('find').hidden = tab !== 'all';
  const list = $('people');
  list.replaceChildren();
  if (tab === 'waiting') {
    for (const p of waiting) {
      const card = el('div', 'ask');
      const top = el('div', 'top');
      const name = el('div', 'name');
      name.append(el('b', '', p.email || '(no email)'), el('small', '', `${p.request_method === 'support' ? 'Asked support' : 'Asked a friend'} · ${when(p.asked_at)}`));
      top.append(el('span', 'av', initial(p.email)), name);
      const lock = el('div', 'lock');
      lock.append(el('b', '', p.lock_name), el('small', '', `until ${clock(p.lock_until)}${p.minutes ? ` · asks ${p.minutes} min` : ''}`));
      card.append(top, lock);
      // Why, and what shows it: what the decision is made on.
      if (p.reason) card.append(el('p', 'reason', p.reason));
      if (p.evidence) card.append(el('p', 'evidence', p.evidence));
      // Never your own: an admin can't let themselves out (the server refuses it too).
      const btn = el('button', 'btn', p.mine ? 'Your own: someone else decides' : p.minutes ? `Unlock for ${p.minutes} min` : 'Unlock');
      btn.type = 'button';
      btn.disabled = !!p.mine;
      btn.addEventListener('click', () => unlock(p, btn));
      card.append(btn);
      if (!p.mine) card.append(el('small', 'later', 'Opens 5 minutes after you unlock.'));
      list.append(card);
    }
    if (!waiting.length) list.append(el('p', 'empty', 'Nobody is waiting.'));
    return;
  }
  if (tab === 'waitlist') {
    // Each signup: name, email, when, and what they said about themselves.
    for (const w of waitlist) {
      const row = el('div', 'person');
      const name = el('div', 'name');
      const said = [w.devices, (w.slips || []).join(', ')].filter(Boolean).join(' · ');
      name.append(el('b', '', w.name ? `${w.name} · ${w.email}` : w.email), el('small', '', `Joined ${when(w.created_at)} · from ${w.source || 'waitlist'} · ${w.emails_sent} of 3 emails${w.unsubscribed ? ' · unsubscribed' : ''}`));
      if (said) name.append(el('small', 'answers', said));
      row.append(el('span', 'av', initial(w.name || w.email)), name);
      list.append(row);
    }
    if (!waitlist.length) list.append(el('p', 'empty', 'Nobody on the waitlist yet.'));
    return;
  }
  const q = $('find').value.trim().toLowerCase();
  for (const p of people.filter((x) => !q || (x.email || '').toLowerCase().includes(q))) {
    const row = el('div', 'person');
    const name = el('div', 'name');
    name.append(el('b', '', p.email || '(no email)'), el('small', '', `Joined ${when(p.joined)} · last in ${when(p.last_seen)}`));
    // When a lock last started on their computer, and Screen Time switched off on their phone this week.
    const locked = p.last_locked ? `Last locked ${when(p.last_locked)} (${p.last_locked_name})` : 'Not locked yet';
    const off = p.screen_time_off_week ? ` · Screen Time off ${p.screen_time_off_week}× this week` : '';
    name.append(el('small', 'answers', locked + off));
    row.append(el('span', 'av', initial(p.email)), name);
    if (p.request) row.append(el('span', 'tag', 'Waiting'));
    list.append(row);
  }
  if (!list.children.length) list.append(el('p', 'empty', 'Nobody matches.'));
}

async function unlock(p, btn) {
  const what = p.request ? `${p.lock_name} (until ${clock(p.lock_until)})` : 'whatever lock is on for them now';
  if (!confirm(`Let ${p.email} out of ${what}?`)) return;
  btn.disabled = true;
  const { data, error } = p.request
    ? await db.rpc('admin_unlock', { request: p.request })
    : await db.rpc('admin_unlock_person', { person: p.user_id });
  if (error || data !== 'approved') {
    problem(error ? 'Couldn’t unlock. Try again.' : data === 'own' ? 'You can’t unlock yourself.' : data === 'over' ? 'That lock ends within 5 minutes anyway.' : `Not unlocked (${data}).`);
    btn.disabled = false;
  } else if (!p.request) {
    problem('');
    alert(`Done. Mast on ${p.email}’s devices lets them out within a few seconds (it needs Mast 0.1.78 or later).`);
  }
  await load();
}

// Admins sign in with Google, as in the apps; it comes back here signed in.
$('google').addEventListener('click', async () => {
  const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) problem('Couldn’t open Google sign-in. Try again.');
});

$('find').addEventListener('input', draw);
$('tab-waiting').addEventListener('click', () => { tab = 'waiting'; draw(); });
$('tab-all').addEventListener('click', () => { tab = 'all'; draw(); });
$('tab-waitlist').addEventListener('click', () => { tab = 'waitlist'; draw(); });
// The waitlist as a spreadsheet, for inviting people in.
$('csv').addEventListener('click', () => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['email', 'name', 'devices', 'slips', 'source', 'joined', 'emails_sent', 'unsubscribed']].concat(
    waitlist.map((w) => [w.email, w.name, w.devices, (w.slips || []).join('; '), w.source, w.created_at, w.emails_sent, w.unsubscribed]));
  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mast-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('signed-in').addEventListener('click', async () => {
  if (!confirm('Sign out?')) return;
  await db.auth.signOut();
  location.reload();
});

(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    $('signed-in').hidden = false;
    $('signed-in').textContent = data.session.user.email;
    await load();
  } else show('signin');
  // A new ask shows up by itself.
  setInterval(() => { if (!$('list').hidden) load(); }, 20000);
})();
