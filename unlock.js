'use strict';

/*
 * The friend's side of "Ask a friend" (supabase/migrations/20261026000000):
 * sign in with a code texted to the phone number the asker added, see the
 * request, say yes with Face ID or a fingerprint, or no.
 *
 * The phone must be the friend's own: a code to it, then a passkey made on
 * it (friend-passkey edge function), so someone holding other people's email
 * sign-ins on their own phone can't answer for them. The database only shows
 * the request to that number, and a yes counts only with the passkey used for
 * this ask just now (unlock_request_for_partner, decide_unlock).
 */

const SUPABASE_URL = 'https://qnuezqnbcloksugbxbcb.supabase.co';
// Public by design, as in the app: it can do only what row-level security allows.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

const $ = (id) => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const webauthn = window.SimpleWebAuthnBrowser;
const requestId = new URLSearchParams(location.search).get('r') || '';
// In the window title on purpose: Kushu on the asker's own computer reads it
// and the request can't be answered from there (migration 20261017000000).
if (/^[0-9a-f]{8}/i.test(requestId)) document.title = `Kushu answer ${requestId.slice(0, 8).toLowerCase()}`;
let phone = '';
/** A request to allow a waiting change to their locks, not to end a lock. */
let isChange = false;

function show(...ids) {
  for (const id of ['phone-form', 'code-form', 'passkey-setup', 'request', 'done']) $(id).hidden = !ids.includes(id);
}

function problem(text) {
  $('problem').hidden = !text;
  $('problem').textContent = text || '';
}

/** +15551234567, or '' (as public.e164 in the database). Ten digits are taken as US/Canada. */
function e164(raw) {
  const s = String(raw || '').trim();
  const d = s.replace(/\D/g, '');
  if (!d) return '';
  if (s.startsWith('+')) return d.length >= 8 && d.length <= 15 ? `+${d}` : '';
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return '';
}

/** The number this session proved, or ''. Supabase keeps it without the +. */
function sessionPhone(session) {
  const p = session && session.user && session.user.phone;
  return p ? `+${String(p).replace(/\D/g, '')}` : '';
}

/** "Signed in as …  Use a different number" so a wrong number is easy to see and change. */
async function showSignedIn() {
  const { data } = await db.auth.getSession();
  const who = sessionPhone(data.session);
  const el = $('signed-in');
  el.hidden = !who;
  if (!who) return;
  el.textContent = `Signed in as ${who}. `;
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'Use a different number';
  b.addEventListener('click', useOtherPhone);
  el.append(b);
}

async function useOtherPhone() {
  await db.auth.signOut();
  problem('');
  $('signed-in').hidden = true;
  $('phone').value = '';
  show('phone-form');
  $('phone').focus();
}

/** Supabase's own reason, made plain. */
function why(error) {
  const m = (error && error.message) || '';
  const wait = m.match(/after (\d+) seconds?/);
  if (wait) return `Wait ${wait[1]} seconds, then send a new code.`;
  if (/rate limit/i.test(m)) return 'Too many codes were sent. Wait a few minutes, then send a new one.';
  if (/expired|invalid|not found/i.test(m)) return 'That code didn’t work. Only the newest code works, and only once. Check it, or send a new one.';
  if (/phone|sms|provider/i.test(m)) return 'Couldn’t text that number. Check it, with the country code if it’s outside the US.';
  return m || 'Something went wrong. Try again.';
}

function finished(text) {
  $('done-text').textContent = text;
  show('done');
}

/** The passkey edge function. Throws its error code (fresh-code, no-passkey, …). */
async function passkey(body) {
  const { data, error } = await db.functions.invoke('friend-passkey', { body });
  if (error) {
    let code = 'failed';
    try { code = (await error.context.json()).error || code; } catch { /* not JSON */ }
    throw new Error(code);
  }
  return data;
}

/** Face ID or a fingerprint was cancelled or isn't there. */
function cancelled(e) {
  return e && (e.name === 'NotAllowedError' || e.name === 'AbortError' || /NotAllowed|cancel/i.test(e.message || ''));
}

function canPasskey() {
  return !!(webauthn && webauthn.browserSupportsWebAuthn());
}

async function loadRequest() {
  const { data, error } = await db.rpc('unlock_request_for_partner', { request: requestId });
  if (error) return problem('Couldn’t load the request. Check your connection and refresh.');
  const r = data && data[0];
  if (!r) {
    show();
    await showSignedIn();
    return problem('This request wasn’t sent to this number. Use the number your friend added, or, if you were added today, you can answer from tomorrow.');
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
  // The first time on this number: make the passkey before anything else.
  try {
    const { passkeys } = await passkey({ action: 'status' });
    if (!passkeys) return show('passkey-setup');
  } catch {
    return problem('Couldn’t load the request. Check your connection and refresh.');
  }
  show('request');
}

async function setUp() {
  problem('');
  if (!canPasskey()) return problem('This browser can’t use Face ID or a fingerprint. Open the link in Safari or Chrome on your phone.');
  $('setup').disabled = true;
  try {
    const optionsJSON = await passkey({ action: 'register-options' });
    const response = await webauthn.startRegistration({ optionsJSON });
    await passkey({ action: 'register-verify', response });
    show('request');
  } catch (e) {
    if (e.message === 'fresh-code') {
      await useOtherPhone();
      problem('Sign in again with a new code to set up this phone.');
    } else {
      problem(cancelled(e) ? 'That was cancelled. Try again.' : 'Couldn’t set it up. Try again.');
    }
  } finally {
    $('setup').disabled = false;
  }
}

/** Face ID or a fingerprint, for this ask. True when it worked. */
async function confirmed() {
  if (!canPasskey()) {
    problem('This browser can’t use Face ID or a fingerprint. Open the link in Safari or Chrome on your phone.');
    return false;
  }
  try {
    const optionsJSON = await passkey({ action: 'auth-options' });
    const response = await webauthn.startAuthentication({ optionsJSON });
    await passkey({ action: 'auth-verify', request: requestId, response });
    return true;
  } catch (e) {
    if (e.message === 'no-passkey') {
      // A new phone: set it up here first.
      show('passkey-setup');
      problem('Set up Face ID or fingerprint on this phone first.');
    } else {
      problem(cancelled(e) ? 'Confirm with Face ID or your fingerprint first.' : 'Couldn’t check your Face ID or fingerprint. Try again.');
    }
    return false;
  }
}

async function decide(approve) {
  problem('');
  $('approve').disabled = $('decline').disabled = true;
  try {
    if (approve && !(await confirmed())) return;
    const { data, error } = await db.rpc('decide_unlock', { request: requestId, approve });
    if (error) return problem('Couldn’t send your answer. Check your connection and try again.');
    if (data === 'passkey') return problem('Confirm with Face ID or your fingerprint first.');
    if (data === 'not-found') return problem('This request wasn’t sent to this number. Use the number your friend added.');
    // A text to this phone, so a yes made without them doesn't go unnoticed.
    if (approve && (data === 'approved' || data === 'waiting')) void db.functions.invoke('friend-notify', { body: { request: requestId } }).catch(() => {});
    const said = {
      approved: isChange ? 'Done. The change happens now.' : 'Done. Their phone and computer open now.',
      declined: 'You said not now. The lock stays until its time.',
      over: 'That lock is already over.',
      waiting: 'Thanks. One more friend has to say yes too.',
      'own-device': 'This was opened on their own computer, so it can’t be answered. Ask them to send it again, and answer on your own phone.',
    };
    finished(said[data] || 'Done.');
  } finally {
    $('approve').disabled = $('decline').disabled = false;
  }
}

$('phone-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  problem('');
  phone = e164($('phone').value);
  if (!phone) return problem('Type the whole number, with the country code if it’s outside the US.');
  await sendCode();
});

async function sendCode() {
  problem('');
  const { error } = await db.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
  if (error) return problem(why(error));
  $('code-sent').textContent = `We texted a code to ${phone}. Use the newest one.`;
  $('code').value = '';
  show('code-form');
  $('code').focus();
}

$('resend').addEventListener('click', () => void sendCode());
$('other-phone').addEventListener('click', () => void useOtherPhone());

$('code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  problem('');
  const token = $('code').value.replace(/\D/g, '');
  const { error } = await db.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) return problem(why(error));
  await loadRequest();
});

$('setup').addEventListener('click', () => void setUp());
$('approve').addEventListener('click', () => decide(true));
$('decline').addEventListener('click', () => decide(false));

(async () => {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    show();
    return problem('This link is incomplete. Ask your friend to send it again.');
  }
  const { data } = await db.auth.getSession();
  // A session from the old email sign-in can't answer any more.
  if (data.session && !sessionPhone(data.session)) await db.auth.signOut();
  if (data.session && sessionPhone(data.session)) await loadRequest();
  else show('phone-form');
})();
