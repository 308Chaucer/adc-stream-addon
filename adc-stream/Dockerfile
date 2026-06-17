# amd64 only. Uses Microsoft's Playwright image so Chromium + all its system
# libs are already present and version-matched (avoids the dependency hell that
# killed the in-sandbox attempt). We add ffmpeg, jq and the go2rtc binary.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg jq curl ca-certificates \
 && curl -fsSL -o /usr/local/bin/go2rtc \
      https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64 \
 && chmod +x /usr/local/bin/go2rtc \
 && rm -rf /var/lib/apt/lists/*

# Real Google Chrome (has H.264; Playwright's bundled Chromium does not — required to
# decode Alarm.com's WebRTC video streams).
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget gnupg \
 && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
 && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY capture.js stream.sh run.sh go2rtc.yaml ./
RUN chmod +x stream.sh run.sh

CMD ["./run.sh"]
