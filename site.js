'use strict';

/*
 * Two jobs: the download buttons know what you're on, and the "How it works"
 * story follows your scroll.
 */

/** The public releases repo; `latest/download/<file>` is always the newest upload. */
const RELEASES = 'https://github.com/uthmanajibade03-droid/kushu-releases/releases/latest/download/';

/**
 * Where each download lives. Switch a line on once its file is uploaded to a
 * release in kushu-releases; a null link shows as "Coming soon" rather than
 * a button that goes nowhere.
 */
const DOWNLOADS = {
  appStore: null, // Kushu's App Store page, once it is live
  android: null, // RELEASES + 'Kushu.apk'
  windows: RELEASES + 'Kushu-Setup.exe',
  // One universal app for Apple silicon and Intel alike, signed and notarized.
  macArm: RELEASES + 'Kushu-Mac.dmg',
  macIntel: RELEASES + 'Kushu-Mac.dmg',
};

/** The newest release, for the version under the download buttons. */
const LATEST_API = 'https://api.github.com/repos/uthmanajibade03-droid/kushu-releases/releases/latest';

const LABELS = {
  appStore: 'App Store',
  android: 'Download for Android',
  windows: 'Download for Windows',
  macArm: 'Download for Mac',
  macIntel: 'Download for Intel Mac',
};

// ---- what you're on ------------------------------------------------------

function detectOS() {
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  // iPads report themselves as Macs; a touch screen gives them away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Mac/.test(platform) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Win/.test(platform)) return 'windows';
  if (/Mac/.test(platform)) return 'mac';
  return 'other';
}

/** Apple silicon or Intel, where the browser will say (Chromium does; Safari doesn't). */
async function macLink() {
  try {
    if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
      const { architecture } = await navigator.userAgentData.getHighEntropyValues(['architecture']);
      if (architecture === 'x86') return 'macIntel';
    }
  } catch {
    // unknown: Apple silicon is the likelier answer on a Mac sold since 2020
  }
  return 'macArm';
}

function wire(anchor, key) {
  const url = DOWNLOADS[key];
  if (url) {
    anchor.href = url;
    anchor.classList.remove('is-disabled');
    anchor.removeAttribute('aria-disabled');
  } else {
    anchor.removeAttribute('href');
    anchor.classList.add('is-disabled');
    anchor.setAttribute('aria-disabled', 'true');
    // The card already names the platform, so the button only needs the state.
    if (anchor.classList.contains('button')) anchor.textContent = 'Coming soon';
  }
}

async function setUpDownloads() {
  const os = detectOS();
  const mac = await macLink();

  for (const a of document.querySelectorAll('[data-link]')) wire(a, a.dataset.link);
  const yours = document.querySelector(`.platform[data-os="${os}"]`);
  if (yours) yours.classList.add('is-yours');

  // The hero's button is for the device you're on; the line under it is for the other one you might mean.
  const hero = document.getElementById('hero-download');
  const alt = document.getElementById('hero-alt');
  const pick = { ios: 'appStore', android: 'android', windows: 'windows', mac };
  const other = {
    ios: ['android', 'Android user?'],
    android: ['appStore', 'iPhone user?'],
    windows: [mac, 'Mac user?'],
    mac: ['windows', 'Windows user?'],
  };

  const key = pick[os];
  if (!key) return; // not a platform we know: the button goes to the list
  hero.textContent = LABELS[key];
  if (DOWNLOADS[key]) {
    hero.href = DOWNLOADS[key];
  } else {
    hero.textContent = key === 'appStore' ? 'Coming soon to the App Store' : `${LABELS[key]} · coming soon`;
    hero.href = '#download';
  }

  const [otherKey, otherLabel] = other[os];
  alt.hidden = false;
  alt.textContent = DOWNLOADS[otherKey] ? `${otherLabel} ${LABELS[otherKey]}` : `${otherLabel} See every download`;
  alt.href = DOWNLOADS[otherKey] || '#download';
}

// ---- the story, driven by scroll -------------------------------------------

function setUpStory() {
  const story = document.querySelector('.story');
  const steps = [...story.querySelectorAll('.step')];
  const screens = [...story.querySelectorAll('.screen')];
  const laptops = [...story.querySelectorAll('.lscreen')];
  const count = steps.length;
  let current = -1;

  function show(i) {
    if (i === current) return;
    current = i;
    const step = steps[i];
    steps.forEach((s, n) => s.classList.toggle('is-active', n === i));
    // The stage reads what this step shows: a phone screen, a laptop screen, extras.
    for (const key of ['phone', 'laptop', 'notice', 'pill']) {
      if (step.dataset[key]) story.dataset[key] = step.dataset[key];
      else delete story.dataset[key];
    }
    // A step without a phone keeps the last one underneath while it steps away.
    if (step.dataset.phone) screens.forEach((s) => s.classList.toggle('is-active', s.dataset.s === step.dataset.phone));
    if (step.dataset.laptop) laptops.forEach((s) => s.classList.toggle('is-active', s.dataset.l === step.dataset.laptop));
  }

  function onScroll() {
    const rect = story.getBoundingClientRect();
    const travel = story.offsetHeight - window.innerHeight;
    const progress = Math.min(1, Math.max(0, -rect.top / travel));
    show(Math.min(count - 1, Math.floor(progress * count)));
  }

  let frame = null;
  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; onScroll(); });
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
}

// ---- things that rise into view -----------------------------------------------

function setUpReveals() {
  const items = document.querySelectorAll('.computer-shots img, .features article, .platform');
  if (!('IntersectionObserver' in window)) return;
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      seen.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });
  items.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = `${(i % 3) * 80}ms`;
    seen.observe(el);
  });
}

// ---- the version on offer ---------------------------------------------------------

/*
 * The buttons link to latest/download, so they always fetch the newest
 * release; this only puts its number beside them. If GitHub can't be
 * reached the number is left off, and the buttons still work.
 */
async function showLatestVersion() {
  try {
    const res = await fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const release = await res.json();
    const version = String(release.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+/.test(version)) return;
    const names = new Set((release.assets || []).map((a) => a.name));
    for (const el of document.querySelectorAll('[data-version]')) {
      const file = el.dataset.version;
      if (!names.has(file)) continue;
      el.textContent = `Version ${version}`;
      el.hidden = false;
    }
    const note = document.getElementById('hero-note');
    const hero = document.getElementById('hero-download');
    const heroFile = hero.getAttribute('href') && hero.getAttribute('href').split('/').pop();
    if (heroFile && names.has(heroFile)) {
      note.textContent = `Version ${version}${heroFile.endsWith('.exe') ? ' · Windows 10 and 11 · updates itself' : heroFile.endsWith('.dmg') ? ' · macOS 12 or later · updates itself' : ''}`;
      note.hidden = false;
    }
  } catch {
    // Offline or rate-limited: no number, nothing broken.
  }
}

setUpDownloads().then(showLatestVersion);
setUpStory();
setUpReveals();
