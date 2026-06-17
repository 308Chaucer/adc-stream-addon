'use strict';
// Headless ADC capture. In --debug mode: log in + screenshot each step (no video).
// In stream mode: open one camera and pipe its JPEG frames to STDOUT (logs go to STDERR,
// so stdout stays a clean MJPEG byte stream for ffmpeg).
const fs = require('fs');
const { chromium } = require('playwright');

const DEBUG = process.argv.includes('--debug') || process.env.DEBUG_MODE === 'true';
const CAM_NAME = process.env.CAM_NAME || '';
const SHOT_DIR = process.env.DEBUG_DIR || '/share/adc-stream-debug';
const log = (...a) => console.error('[capture]', ...a);

function readCreds() {
  const p = '/homeassistant/.storage/core.config_entries';
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const e = (d.data.entries || []).find(x => x.domain === 'alarmdotcom');
  if (!e) throw new Error('no alarmdotcom config entry found in core.config_entries');
  const { username, password } = e.data;
  const cookie = e.data['2fa_cookie'];
  if (!username || !password) throw new Error('username/password missing in config entry');
  return { username, password, cookie };
}

async function shot(page, name) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const f = `${SHOT_DIR}/${name}.png`;
    await page.screenshot({ path: f });
    log('screenshot ->', f, '| url=', page.url());
  } catch (e) { log('screenshot failed', name, e.message); }
}

(async () => {
  const creds = readCreds();
  log('creds loaded (values hidden). 2fa_cookie present:', !!creds.cookie, '| debug:', DEBUG);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  if (creds.cookie) {
    // ADC "remember this device" 2FA cookie. Cookie NAME is a best guess and may
    // need adjusting after the first debug run (watch for a 2FA challenge).
    await ctx.addCookies([{
      name: 'twoFactorAuthenticationId', value: creds.cookie,
      domain: '.alarm.com', path: '/', httpOnly: true, secure: true,
    }]);
    log('injected twoFactorAuthenticationId cookie on .alarm.com');
  }

  const page = await ctx.newPage();

  log('navigating to login');
  await page.goto('https://www.alarm.com/login.aspx', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await shot(page, '01-login');

  // ASP.NET ids first, then generic fallbacks.
  const userSel = '#ctl00_ContentPlaceHolder1_loginform_txtUserName, input[name*="UserName"], input[type="email"], #txtUsername';
  const passSel = '#txtPassword, input[name*="Password"], input[type="password"]';
  const submitSel = '#ctl00_ContentPlaceHolder1_loginform_signInButton, button[type="submit"], input[type="submit"], #btnLogin';
  try {
    await page.fill(userSel, creds.username, { timeout: 15000 });
    await page.fill(passSel, creds.password, { timeout: 15000 });
    await shot(page, '02-filled');
    await page.click(submitSel, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 }).catch(() => {});
  } catch (e) {
    log('LOGIN step failed (selectors may need updating):', e.message);
    await shot(page, '02-login-error');
  }
  await page.waitForTimeout(5000);
  await shot(page, '03-after-login');
  log('post-login url:', page.url());

  const html = (await page.content()).toLowerCase();
  if (html.includes('verification code') || html.includes('two-factor') || page.url().toLowerCase().includes('twofactor')) {
    log('!!! 2FA CHALLENGE detected — the saved cookie did not satisfy it.');
    log('!!! STOPPING. A fresh 2FA code / updated cookie is needed (tell the human).');
    await shot(page, '03b-2fa-challenge');
    await browser.close();
    process.exit(2);
  }

  // Navigate to the video / live-view area. Exact URL/SPA route is account-specific;
  // adjust after reviewing 04-video screenshot.
  log('navigating to video page');
  await page.goto('https://www.alarm.com/web/system/video/CameraView.aspx',
    { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => log('video nav err:', e.message));
  await page.waitForTimeout(6000);
  await shot(page, '04-video');
  log('video url:', page.url());

  try {
    const labels = await page.$$eval('[aria-label], .camera-name, [class*="camera"], video',
      els => els.slice(0, 50).map(e => (e.getAttribute && e.getAttribute('aria-label')) || e.className || e.tagName));
    log('candidate camera elements:', JSON.stringify(labels));
  } catch (e) { log('label scan failed:', e.message); }

  if (DEBUG) {
    log('DEBUG run complete. Review screenshots in', SHOT_DIR, '— then set debug:false + camera_name.');
    await browser.close();
    process.exit(0);
  }

  // ---- STREAM MODE ----
  if (CAM_NAME) {
    try {
      await page.getByText(CAM_NAME, { exact: false }).first().click({ timeout: 15000 });
      log('clicked camera tile:', CAM_NAME);
      await page.waitForTimeout(4000);
    } catch (e) { log('could not click camera', JSON.stringify(CAM_NAME), '-', e.message); }
  } else {
    log('no camera_name set — capturing whatever the video page shows');
  }

  // Try to start playback of any video element.
  try { await page.$$eval('video', vs => vs.forEach(v => { v.muted = true; v.play().catch(() => {}); })); } catch {}
  await page.waitForTimeout(3000);

  const client = await page.context().newCDPSession(page);
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  log('screencast started -> piping JPEG frames to stdout');
  let frames = 0;
  client.on('Page.screencastFrame', async (ev) => {
    try {
      process.stdout.write(Buffer.from(ev.data, 'base64'));
      if (++frames % 60 === 0) log('frames piped:', frames);
      await client.send('Page.screencastFrameAck', { sessionId: ev.sessionId });
    } catch (e) { log('frame write err:', e.message); }
  });

  // Watchdog: keep the <video> playing (ADC may pause / re-negotiate).
  setInterval(async () => {
    try { await page.$$eval('video', vs => vs.forEach(v => v.play().catch(() => {}))); } catch {}
  }, 30000);

  log('streaming... (Ctrl-C / stop add-on to end)');
})().catch((e) => { console.error('[capture] FATAL', e); process.exit(1); });
