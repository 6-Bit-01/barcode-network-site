namespace Barcode.AudioBridge;

internal static class CommercialPlayerPage
{
    public const string Html = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>BARCODE Local Commercial Player</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
    body { font-family: Consolas, "Courier New", monospace; }
    #stage {
      position: fixed;
      left: 50%;
      top: 50%;
      width: min(100vw, 177.777778vh);
      height: min(100vh, 56.25vw);
      transform: translate(-50%, -50%);
      overflow: hidden;
    }
    #background-video, #tv-overlay-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
    }
    #background-video {
      z-index: 0;
    }
    #tv-overlay-video {
      z-index: 1;
    }
    #video-window {
      position: absolute;
      left: 14.85%;
      top: 12.85%;
      width: 70.2%;
      height: 66.55%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 2.4% / 4.5%;
      z-index: 2;
    }
    #player { width: 100%; height: 100%; object-fit: cover; background: transparent; }
    #logo {
      position: absolute;
      top: 2.5%;
      left: 50%;
      width: min(52%, 760px);
      height: 12%;
      object-fit: contain;
      opacity: 0;
      transform: translate(-50%, -8px) scale(.985);
      transition: opacity 1800ms ease, transform 1800ms ease;
      z-index: 3;
      pointer-events: none;
    }
    #logo.visible { opacity: 1; transform: translate(-50%, 0) scale(1); }
    #background-video[hidden], #tv-overlay-video[hidden], #video-window[hidden], #logo[hidden] { display: none; }
    #status {
      display: none;
      position: fixed;
      left: 16px;
      bottom: 16px;
      max-width: calc(100% - 32px);
      padding: 10px 12px;
      border: 1px solid rgba(121,255,116,.65);
      background: rgba(0,0,0,.82);
      color: #b8ffb4;
      font-size: 14px;
      line-height: 1.35;
      white-space: pre-wrap;
      z-index: 4;
    }
    body.debug #status { display: block; }
  </style>
</head>
<body>
  <div id="stage">
    <video id="background-video" preload="auto" autoplay muted loop playsinline disablepictureinpicture hidden></video>
    <video id="tv-overlay-video" preload="auto" autoplay muted loop playsinline disablepictureinpicture hidden></video>
    <div id="video-window" hidden>
      <video id="player" preload="auto" autoplay playsinline disablepictureinpicture></video>
    </div>
    <img id="logo" alt="" hidden>
  </div>
  <div id="status">LOCAL COMMERCIAL PLAYER READY</div>
  <script>
    const query = new URLSearchParams(location.search);
    const debug = query.get('debug') === '1';
    document.body.classList.toggle('debug', debug);

    const backgroundVideo = document.getElementById('background-video');
    const videoWindow = document.getElementById('video-window');
    const player = document.getElementById('player');
    const tvOverlayVideo = document.getElementById('tv-overlay-video');
    const logo = document.getElementById('logo');
    const statusBox = document.getElementById('status');
    if (debug) player.controls = true;

    let activeGeneration = -1;
    let runToken = 0;
    let running = false;
    let preloadPlayer = null;
    let logoTimers = [];

    function showStatus(message) {
      statusBox.textContent = message;
    }

    async function post(path) {
      const response = await fetch(path, { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error(`local player update failed (${response.status})`);
    }

    function releasePreload() {
      if (!preloadPlayer) return;
      preloadPlayer.removeAttribute('src');
      preloadPlayer.load();
      preloadPlayer = null;
    }

    function clearLogo() {
      for (const timer of logoTimers) clearTimeout(timer);
      logoTimers = [];
      logo.classList.remove('visible');
      logo.hidden = true;
      logo.removeAttribute('src');
    }

    function clearPlayer() {
      runToken += 1;
      running = false;
      player.pause();
      player.removeAttribute('src');
      player.load();
      videoWindow.hidden = true;
      for (const visualVideo of [backgroundVideo, tvOverlayVideo]) {
        visualVideo.pause();
        visualVideo.hidden = true;
        visualVideo.removeAttribute('src');
        visualVideo.load();
      }
      clearLogo();
      releasePreload();
    }

    async function startVisualVideo(element, url, label, token) {
      if (!url) throw new Error(`${label} video is unavailable`);
      if (token !== runToken) return;
      element.muted = true;
      element.loop = true;
      element.src = url;
      element.hidden = false;
      element.load();
      try {
        await element.play();
      } catch (error) {
        throw new Error(`${label} video could not play: ${error?.message || error}`);
      }
      if (token !== runToken) element.pause();
    }

    function preload(item) {
      releasePreload();
      if (!item) return;
      preloadPlayer = document.createElement('video');
      preloadPlayer.preload = 'auto';
      preloadPlayer.src = item.url;
      preloadPlayer.load();
    }

    function showLogo(item, token) {
      clearLogo();
      if (!item.logoUrl || token !== runToken) return;
      logo.src = item.logoUrl;
      logo.hidden = false;
      logoTimers.push(setTimeout(() => {
        if (token === runToken) logo.classList.add('visible');
      }, 180));
      const fadeAt = Math.max(2000, (item.durationSeconds * 1000) - 2200);
      logoTimers.push(setTimeout(() => {
        if (token === runToken) logo.classList.remove('visible');
      }, fadeAt));
    }

    function playItem(item, nextItem, token) {
      return new Promise((resolve, reject) => {
        if (token !== runToken) {
          resolve();
          return;
        }

        const cleanup = () => {
          player.removeEventListener('ended', onEnded);
          player.removeEventListener('error', onError);
        };
        const onEnded = () => {
          cleanup();
          clearLogo();
          resolve();
        };
        const onError = () => {
          cleanup();
          clearLogo();
          reject(new Error(player.error?.message || `could not play ${item.name}`));
        };

        player.addEventListener('ended', onEnded, { once: true });
        player.addEventListener('error', onError, { once: true });
        player.src = item.url;
        videoWindow.hidden = false;
        player.load();
        preload(nextItem);
        player.play()
          .then(() => showLogo(item, token))
          .catch(error => {
            cleanup();
            clearLogo();
            reject(error);
          });
      });
    }

    async function runBreak(state) {
      activeGeneration = state.generation;
      const token = ++runToken;
      running = true;
      const startIndex = state.status === 'playing'
        ? Math.max(0, Math.min(state.currentIndex, state.items.length - 1))
        : 0;
      showStatus(`BREAK ${state.generation} · ${state.sponsorCount} SPONSORS · ${state.interstitialCount} HOUSE · STARTING VISUALS`);

      try {
        await Promise.all([
          startVisualVideo(backgroundVideo, state.backgroundUrl, 'background', token),
          startVisualVideo(tvOverlayVideo, state.tvOverlayUrl, 'TV overlay', token),
        ]);
        for (let index = startIndex; index < state.items.length; index += 1) {
          if (token !== runToken) return;
          const item = state.items[index];
          showStatus(`BREAK ${state.generation} · ${index + 1}/${state.items.length}\n${item.name}`);
          await post(`/v1/commercials/clip-started?generation=${state.generation}&index=${index}`);
          await playItem(item, state.items[index + 1], token);
        }
        if (token !== runToken) return;
        await post(`/v1/commercials/complete?generation=${state.generation}`);
        showStatus(`BREAK ${state.generation} · COMPLETE`);
        clearPlayer();
      } catch (error) {
        if (token !== runToken) return;
        const reason = String(error?.message || error || 'playback error').slice(0, 180);
        try {
          await post(`/v1/commercials/failed?generation=${state.generation}&reason=${encodeURIComponent(reason)}`);
        } catch {}
        showStatus(`PLAYBACK ERROR\n${reason}`);
        clearPlayer();
      }
    }

    async function poll() {
      try {
        const response = await fetch('/v1/commercials/state', { cache: 'no-store' });
        if (!response.ok) throw new Error(`state ${response.status}`);
        const state = await response.json();
        if ((state.status === 'queued' || state.status === 'playing')
            && state.items.length > 0
            && state.backgroundUrl
            && state.tvOverlayUrl
            && (!running || state.generation !== activeGeneration)) {
          clearPlayer();
          void runBreak(state);
          return;
        }
        if (state.generation === activeGeneration
            && !['queued', 'playing'].includes(state.status)
            && running) {
          clearPlayer();
        }
        if (!running) {
          showStatus(`LOCAL COMMERCIAL PLAYER\n${state.status.toUpperCase()} · ${state.message}`);
        }
      } catch (error) {
        if (!running) showStatus(`LOCAL COMMERCIAL PLAYER OFFLINE\n${error.message}`);
      }
    }

    void poll();
    setInterval(() => void poll(), 500);
  </script>
</body>
</html>
""";
}
