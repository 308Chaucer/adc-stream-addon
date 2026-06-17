# ADC Camera Stream (PoC) — local Home Assistant add-on

Proof-of-concept to get an **Alarm.com** camera (cloud-WebRTC only, no local RTSP) into
Home Assistant by capturing a headless Chromium session and republishing it via **go2rtc**.

> Built outside HA's normal reach because the Claude add-on sandbox can't install a browser.
> **It is untested against the live ADC web UI** — the first run is deliberately a *debug*
> run (login + screenshots, no video) so we can fix selectors before chasing video capture.

## 1. Install it as a local add-on

The files are in `/share/adc-stream`. The Supervisor only sees add-ons under `/addons`, so copy them there using the **Advanced SSH & Web Terminal** add-on (or the `addons` Samba share):

```bash
cp -r /share/adc-stream /addons/adc-stream
```

Then: **Settings → Add-ons → Add-on Store → ⋮ (top right) → Check for updates**, scroll to
**Local add-ons → “ADC Camera Stream (PoC)” → Install**. (First build is slow — it pulls the
Playwright/Chromium image.)

## 2. First run = DEBUG (default)

Leave the options at their defaults (`debug: true`, `camera_name: ""`) and **Start** the add-on.
It will:
- read your Alarm.com username/password/2FA-cookie from `/homeassistant/.storage` (read-only),
- log in headlessly, and
- save step-by-step screenshots to **`/share/adc-stream-debug/`**:
  `01-login`, `02-filled`, `03-after-login`, `04-video`, (and `03b-2fa-challenge` if 2FA blocks it).

Check the add-on **Log** tab and those screenshots. This tells us:
- Did login work? (or did selectors miss / did a 2FA challenge appear → we need a fresh code)
- Did we reach the video page, and what are the camera tile names/elements?

**Send me the log output + what the screenshots show** and I'll fix the selectors / URLs.
The spots most likely to need edits are marked in `capture.js`:
- login field selectors (`userSel` / `passSel` / `submitSel`),
- the 2FA cookie **name** (`twoFactorAuthenticationId` is a guess),
- the video page URL and the camera-tile click.

## 3. Switch to STREAM mode

Once the debug run reaches a live camera, set in the add-on **Configuration**:
- `debug: false`
- `camera_name:` the camera's label as it appears on the ADC video page (e.g. a V724 name)

Restart. go2rtc now serves the feed:
- **RTSP:** `rtsp://<HA_HOST_IP>:8554/adc_poc`
- **go2rtc UI / WebRTC / HLS:** `http://<HA_HOST_IP>:1984` (stream name `adc_poc`)

## 4. Add to Home Assistant

Easiest: **Settings → Devices & Services → Add Integration → Generic Camera**, stream source
`rtsp://<HA_HOST_IP>:8554/adc_poc`. That creates a `camera.adc_poc` entity.

## Known limitations (by design, see the earlier analysis)
- One Chromium tab per concurrent stream → heavy for all 6 cameras; validate one first.
- ADC relayed/proxy WebRTC sessions cap at 15 min / 3 min; only Direct-P2P is unlimited. The
  watchdog keeps the `<video>` playing but a hard session timeout may still interrupt — we'll
  see in testing.
- Image is a screen capture of the page (quality/fps/crop), not the raw camera bitstream.
- Fragile vs. ADC web-UI changes; gray-area vs. ADC ToS (your account).

## Files
`config.yaml` add-on manifest · `Dockerfile` image · `capture.js` headless login+capture ·
`stream.sh` Chromium→ffmpeg→go2rtc pipe · `go2rtc.yaml` go2rtc config · `run.sh` entrypoint.
