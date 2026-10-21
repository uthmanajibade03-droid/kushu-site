'use strict';

// The ask, from the address the lock screen's QR code holds: ?r=<request>&n=<lock>&u=<until>.
const params = new URLSearchParams(location.search);
const request = params.get('r') || '';
const lock = params.get('n') || 'a lock';
const until = params.get('u') || '';

const $ = (id) => document.getElementById(id);
const link = `https://kushu.space/unlock?r=${encodeURIComponent(request)}`;
const text = `Can you let me out of my Mast lock (${lock}${until ? `, until ${until}` : ''})? Open this: ${link}`;

// Your Mast friends, from this open ask (supabase: ask_friends). The key is the public one the app ships with.
const SUPABASE = 'https://qnuezqnbcloksugbxbcb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFudWV6cW5iY2xva3N1Z2J4YmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NDczNzgsImV4cCI6MjEwNjIyMzM3OH0.FHhOTaIbfsue2TFkZ0mn-hBa-6esMuVYZPjCST4i4ig';

async function showFriends() {
  let friends = [];
  try {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/ask_friends`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    });
    if (res.ok) friends = await res.json();
  } catch { /* the buttons below still send it */ }
  // First names only: who to send it to, picked in your own messages.
  const names = friends.map((f) => f.name).filter(Boolean);
  if (!names.length) return;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  $('title').textContent = `Send this to ${list}`;
}

if (!/^[0-9a-f-]{36}$/i.test(request)) {
  $('title').textContent = 'This link isn’t complete';
  $('lede').textContent = 'Scan the code on your computer’s lock screen again.';
  document.querySelector('.card').hidden = true;
} else {
  $('message').textContent = text;
  // The phone's own share sheet first: Messages, WhatsApp, anything, and you pick the friend there.
  // (A bare texting link, with no number in it, can open "Add to Contact" on an iPhone instead.)
  if (navigator.share) {
    $('share').hidden = false;
    $('share').addEventListener('click', () => { navigator.share({ text }).catch(() => {}); });
    $('text').classList.add('light');
  }
  $('text').href = `sms:?&body=${encodeURIComponent(text)}`;
  void showFriends();
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); $('done').hidden = false; } catch { /* the message is on the page to copy by hand */ }
  });
}
