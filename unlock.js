'use strict';

/*
 * The friend's side of "Ask a friend" (supabase/migrations/20261013000000):
 * sign in with the email the asker added, see the request, say yes or no.
 * The database only shows the request to that email, and only that email
 * can answer it (unlock_request_for_partner, decide_unlock).
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can do only what row-level security allows.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const $ = (id) => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const requestId = new URLSearchParams(location.search).get('r') || '';
let email = '';

function show(...ids) {
  for (const id of ['email-form', 'code-form', 'request', 'done']) $(id).hidden = !ids.includes(id);
}

function problem(text) {
  $('problem').hidden = !text;
  $('problem').textContent = text || '';
}

function finished(text) {
  $('done-text').textContent = text;
  show('done');
}

async function loadRequest() {
  const { data, error } = await db.rpc('unlock_request_for_partner', { request: requestId });
  if (error) return problem('Couldn’t load the request. Check your connection and refresh.');
  const r = data && data[0];
  if (!r) {
    show('email-form');
    return problem('This request wasn’t sent to that email. Sign in with the email your friend added.');
  }
  const until = new Date(r.lock_until);
  $('asker').textContent = r.asker;
  $('lock-name').textContent = r.lock_name || 'a lock';
  $('lock-until').textContent = until.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (r.note) { $('note').hidden = false; $('note').textContent = r.note; }
  if (r.status === 'approved') return finished('You already let them out.');
  if (r.status === 'declined') return finished('You said not now. The lock stays until its time.');
  if (until.getTime() <= Date.now()) return finished('That lock is already over.');
  show('request');
}

async function decide(approve) {
  problem('');
  $('approve').disabled = $('decline').disabled = true;
  const { data, error } = await db.rpc('decide_unlock', { request: requestId, approve });
  $('approve').disabled = $('decline').disabled = false;
  if (error) return problem('Couldn’t send your answer. Check your connection and try again.');
  const said = {
    approved: 'Done. Their phone and computer open now.',
    declined: 'You said not now. The lock stays until its time.',
    over: 'That lock is already over.',
    'not-found': 'This request wasn’t sent to your email.',
  };
  finished(said[data] || 'Done.');
}

$('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  problem('');
  email = $('email').value.trim();
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return problem('Couldn’t send the code. Check the email and try again.');
  show('code-form');
  $('code').focus();
});

$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  problem('');
  const token = $('code').value.replace(/\D/g, '');
  const { error } = await db.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return problem('That code didn’t work. Check it, or go back and send a new one.');
  await loadRequest();
});

$('approve').addEventListener('click', () => decide(true));
$('decline').addEventListener('click', () => decide(false));

(async () => {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    show();
    return problem('This link is incomplete. Ask your friend to send it again.');
  }
  const { data } = await db.auth.getSession();
  if (data.session) await loadRequest();
  else show('email-form');
})();
