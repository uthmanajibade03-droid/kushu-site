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
// In the window title on purpose: Kushu on the asker's own computer reads it
// and the request can't be answered from there (migration 20261017000000).
if (/^[0-9a-f]{8}/i.test(requestId)) document.title = `Kushu answer ${requestId.slice(0, 8).toLowerCase()}`;
let email = '';
/** A request to allow a waiting change to their locks, not to end a lock. */
let isChange = false;

function show(...ids) {
  for (const id of ['email-form', 'code-form', 'request', 'done']) $(id).hidden = !ids.includes(id);
}

function problem(text) {
  $('problem').hidden = !text;
  $('problem').textContent = text || '';
}

/** "Signed in as …  Not you?" so a wrong email is easy to see and change. */
async function showSignedIn() {
  const { data } = await db.auth.getSession();
  const who = data.session && data.session.user.email;
  const el = $('signed-in');
  el.hidden = !who;
  if (!who) return;
  el.textContent = `Signed in as ${who}. `;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Use a different email';
  b.addEventListener('click', useOtherEmail);
  el.append(b);
}

async function useOtherEmail() {
  await db.auth.signOut();
  problem('');
  $('signed-in').hidden = true;
  $('email').value = '';
  show('email-form');
  $('email').focus();
}

/** Supabase's own reason, made plain. */
function why(error) {
  const m = (error && error.message) || '';
  const wait = m.match(/after (\d+) seconds?/);
  if (wait) return `Wait ${wait[1]} seconds, then send a new code.`;
  if (/rate limit/i.test(m)) return 'Too many codes were sent. Wait a few minutes, then send a new one.';
  if (/expired|invalid|not found/i.test(m)) return 'That code didn’t work. Only the newest code works, and only once. Check it, or send a new one.';
  return m || 'Something went wrong. Try again.';
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
    show();
    await showSignedIn();
    return problem('This request isn’t for this email. Use the email your friend added you with, or, if you were added today, you can answer from tomorrow.');
  }
  await showSignedIn();
  const until = new Date(r.lock_until);
  isChange = /^Change: /.test(r.lock_name || '');
  if (isChange) {
    $('title').textContent = 'Someone asked you to allow a change';
    $('lede').textContent = 'With Mast, turning a lock off happens a day later, unless you say yes now.';
    $('request').querySelector('p').textContent = `${r.asker} wants to: ${r.lock_name.replace(/^Change: /, '')}. Without you, it happens by itself ${until.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.`;
    $('approve').textContent = 'Allow it now';
  } else {
    $('asker').textContent = r.asker;
    $('lock-name').textContent = r.lock_name || 'a lock';
    $('lock-until').textContent = until.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (r.note) { $('note').hidden = false; $('note').textContent = r.note; }
  if (r.status === 'approved') return finished(isChange ? 'You already allowed it.' : 'You already let them out.');
  if (r.status === 'declined') return finished('You said not now. The lock stays until its time.');
  if (until.getTime() <= Date.now()) return finished(isChange ? 'That change has already happened.' : 'That lock is already over.');
  // Under strict mode two friends have to say yes (migration 20261018000000).
  const { data: votes } = await db.rpc('unlock_votes_for_partner', { request: requestId });
  const v = votes && votes[0];
  if (v && v.mine) return finished('You said yes. One more friend has to say yes too.');
  $('two').hidden = !(v && v.needed > 1);
  show('request');
}

async function decide(approve) {
  problem('');
  $('approve').disabled = $('decline').disabled = true;
  const { data, error } = await db.rpc('decide_unlock', { request: requestId, approve });
  $('approve').disabled = $('decline').disabled = false;
  if (error) return problem('Couldn’t send your answer. Check your connection and try again.');
  const said = {
    approved: isChange ? 'Done. The change happens now.' : 'Done. Their phone and computer open now.',
    declined: 'You said not now. The lock stays until its time.',
    over: 'That lock is already over.',
    'not-found': 'This request wasn’t sent to your email.',
    waiting: 'Thanks. One more friend has to say yes too.',
    'own-device': 'This was opened on their own computer, so it can’t be answered. Ask them to send it again, and answer on your own phone or computer.',
    'own-network': 'You’re on the same internet as their own phone or computer, so this can’t count. Answer from your own mobile data or another network.',
  };
  finished(said[data] || 'Done.');
}

$('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  problem('');
  email = $('email').value.trim();
  await sendCode();
});

async function sendCode() {
  problem('');
  const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return problem(why(error));
  $('code-sent').textContent = `We sent a code to ${email}. Use the newest one.`;
  $('code').value = '';
  show('code-form');
  $('code').focus();
}

$('resend').addEventListener('click', () => void sendCode());
$('other-email').addEventListener('click', () => void useOtherEmail());

$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  problem('');
  const token = $('code').value.replace(/\D/g, '');
  const { error } = await db.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return problem(why(error));
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
