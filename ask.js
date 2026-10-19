'use strict';

// The ask, from the address the lock screen's QR code holds: ?r=<request>&n=<lock>&u=<until>.
const params = new URLSearchParams(location.search);
const request = params.get('r') || '';
const lock = params.get('n') || 'a lock';
const until = params.get('u') || '';

const $ = (id) => document.getElementById(id);
const link = `https://kushu.space/unlock?r=${encodeURIComponent(request)}`;
const text = `Can you let me out of my Mast lock (${lock}${until ? `, until ${until}` : ''})? Open this and sign in with your email: ${link}`;

if (!/^[0-9a-f-]{36}$/i.test(request)) {
  $('title').textContent = 'This link isn’t complete';
  $('lede').textContent = 'Scan the code on your computer’s lock screen again.';
  document.querySelector('.card').hidden = true;
} else {
  $('message').textContent = text;
  // iPhones and Macs write the body after "&", everything else after "?".
  const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  $('text').href = `sms:${apple ? '&' : '?'}body=${encodeURIComponent(text)}`;
  // The phone's own share sheet: WhatsApp, Messenger, anything.
  if (navigator.share) {
    $('share').hidden = false;
    $('share').addEventListener('click', () => { navigator.share({ text }).catch(() => {}); });
  }
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text); $('done').hidden = false; } catch { /* the message is on the page to copy by hand */ }
  });
}
