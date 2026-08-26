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
      width: min(100vw, 56.25vh);
      height: min(100vh, 177.777778vw);
      aspect-ratio: 9 / 16;
      transform: translate(-50%, -50%);
      overflow: hidden;
      background: transparent;
    }
    #stage[hidden] { display: none; }
    #background-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      background: transparent;
      z-index: 0;
      pointer-events: none;
    }
    #tv-overlay-video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      pointer-events: none;
      z-index: 1;
    }
    #video-window {
      position: absolute;
      left: 3.9%;
      top: 35.85%;
      width: 92.5%;
      height: 28.8%;
      overflow: hidden;
      border-radius: 1.8% / 3.2%;
      background: #000;
      z-index: 2;
    }
    #player {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #000;
    }
    #logo {
      position: absolute;
      top: 11.25%;
      left: 50%;
      width: 72%;
      height: 14.75%;
      object-fit: contain;
      opacity: 0;
      transform: translate(-50%, -6px) scale(.98);
      transition:
        opacity var(--logo-fade-duration, 1800ms) ease,
        transform var(--logo-fade-duration, 1800ms) ease;
      filter: drop-shadow(0 0 18px rgba(0,0,0,.72));
      z-index: 3;
      pointer-events: none;
    }
    #logo.visible { opacity: 1; transform: translate(-50%, 0) scale(1); }
    #background-video[hidden], #tv-overlay-video[hidden], #logo[hidden] { display: none; }
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
      z-index: 20;
    }
    #audio-gate {
      position: fixed;
      left: 50%;
      top: 50%;
      width: min(520px, calc(100% - 32px));
      padding: 22px 24px;
      border: 2px solid #79ff74;
      background: rgba(0,0,0,.94);
      color: #caffc7;
      font: inherit;
      text-align: center;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 0 1px rgba(0,0,0,.9), 0 0 30px rgba(121,255,116,.28);
      cursor: pointer;
      z-index: 30;
    }
    #audio-gate[hidden] { display: none; }
    #audio-gate strong, #audio-gate span { display: block; }
    #audio-gate strong { font-size: 18px; line-height: 1.35; }
    #audio-gate span { margin-top: 8px; color: #a7d9a4; font-size: 13px; line-height: 1.4; }
    #audio-gate:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
    body.debug #status { display: block; }
    body.debug #video-window { outline: 1px dashed rgba(121,255,116,.65); }
  </style>
</head>
<body>
  <div id="stage" hidden>
    <video id="background-video" preload="auto" autoplay muted loop playsinline disablepictureinpicture hidden></video>
    <video id="tv-overlay-video" preload="auto" autoplay muted loop playsinline disablepictureinpicture hidden></video>
    <div id="video-window">
      <video id="player" preload="auto" autoplay playsinline disablepictureinpicture></video>
    </div>
    <img id="logo" alt="" hidden>
  </div>
  <button id="audio-gate" type="button" hidden>
    <strong>CLICK ONCE TO ENABLE COMMERCIAL AUDIO</strong>
    <span>The diagnostic preview will resume the same clip.</span>
  </button>
  <div id="status">LOCAL COMMERCIAL PLAYER READY</div>
  <script>
    const query = new URLSearchParams(location.search);
    const debug = query.get('debug') === '1';
    document.body.classList.toggle('debug', debug);

    const stage = document.getElementById('stage');
    const backgroundVideo = document.getElementById('background-video');
    const tvOverlayVideo = document.getElementById('tv-overlay-video');
    const player = document.getElementById('player');
    const logo = document.getElementById('logo');
    const audioGate = document.getElementById('audio-gate');
    const statusBox = document.getElementById('status');
    if (debug) player.controls = true;

    let activeGeneration = -1;
    let runToken = 0;
    let running = false;
    let preloadPlayer = null;
    let logoTimers = [];
    let pendingAudioGate = null;

    function showStatus(message) { statusBox.textContent = message; }

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
      logo.style.removeProperty('--logo-fade-duration');
    }

    function clearVisualVideo(video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.hidden = true;
    }

    function playbackCancelledError() {
      return new DOMException('Commercial playback cancelled', 'AbortError');
    }

    function cancelAudioGate() {
      audioGate.hidden = true;
      if (!pendingAudioGate) return;
      const pending = pendingAudioGate;
      pendingAudioGate = null;
      pending.cancel();
    }

    function clearPlayer() {
      runToken += 1;
      running = false;
      cancelAudioGate();
      player.pause();
      player.removeAttribute('src');
      player.load();
      clearVisualVideo(backgroundVideo);
      clearVisualVideo(tvOverlayVideo);
      stage.hidden = true;
      clearLogo();
      releasePreload();
    }

    function isAutoplayBlock(error) {
      const name = String(error?.name || '');
      const message = String(error?.message || error || '');
      return name === 'NotAllowedError'
        || /user didn['’]?t interact|not allowed|autoplay/i.test(message);
    }

    function waitForAudioGesture(item, token) {
      showStatus(`BREAK ${activeGeneration}\n${item.name}\nWAITING FOR ONE CLICK TO ENABLE AUDIO`);
      audioGate.hidden = false;
      audioGate.focus({ preventScroll: true });

      return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          audioGate.removeEventListener('click', resume);
          if (pendingAudioGate?.token === token) pendingAudioGate = null;
        };
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          audioGate.hidden = true;
          callback(value);
        };
        const resume = () => {
          if (token !== runToken) {
            finish(reject, playbackCancelledError());
            return;
          }
          let playback;
          try {
            playback = player.play();
          } catch (error) {
            finish(reject, error);
            return;
          }
          playback.then(() => {
            showStatus(`BREAK ${activeGeneration}\n${item.name}\nAUDIO ENABLED · PLAYING`);
            finish(resolve);
          }).catch(error => finish(reject, error));
        };
        const cancel = () => finish(reject, playbackCancelledError());
        pendingAudioGate = { token, cancel };
        audioGate.addEventListener('click', resume, { once: true });
      });
    }

    async function playWithAudioRecovery(item, token) {
      let playbackError;
      try {
        await player.play();
        return;
      } catch (error) {
        playbackError = error;
      }
      while (isAutoplayBlock(playbackError) && token === runToken) {
        try {
          await waitForAudioGesture(item, token);
          return;
        } catch (error) {
          playbackError = error;
        }
      }
      throw playbackError;
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
      const totalMs = Math.max(1000, item.durationSeconds * 1000);
      const fadeMs = Math.min(1800, Math.max(350, totalMs * .2));
      const revealAt = Math.min(180, totalMs * .05);
      const fadeAt = Math.max(fadeMs + revealAt, totalMs - fadeMs - 200);
      logo.src = item.logoUrl;
      logo.hidden = false;
      logo.style.setProperty('--logo-fade-duration', `${Math.round(fadeMs)}ms`);
      logoTimers.push(setTimeout(() => {
        if (token === runToken) logo.classList.add('visible');
      }, revealAt));
      logoTimers.push(setTimeout(() => {
        if (token === runToken) logo.classList.remove('visible');
      }, fadeAt));
    }

    function playItem(item, nextItem, token) {
      return new Promise((resolve, reject) => {
        if (token !== runToken) { resolve(); return; }
        const cleanup = () => {
          player.removeEventListener('ended', onEnded);
          player.removeEventListener('error', onError);
        };
        const onEnded = () => { cleanup(); clearLogo(); resolve(); };
        const onError = () => {
          cleanup();
          clearLogo();
          reject(new Error(player.error?.message || `could not play ${item.name}`));
        };
        player.addEventListener('ended', onEnded, { once: true });
        player.addEventListener('error', onError, { once: true });
        player.src = item.url;
        player.load();
        preload(nextItem);
        playWithAudioRecovery(item, token)
          .then(() => showLogo(item, token))
          .catch(error => { cleanup(); clearLogo(); reject(error); });
      });
    }

    async function runBreak(state) {
      activeGeneration = state.generation;
      const token = ++runToken;
      running = true;
      const startIndex = state.status === 'playing'
        ? Math.max(0, Math.min(state.currentIndex, state.items.length - 1))
        : 0;
      showStatus(`BREAK ${state.generation} · ${state.sponsorCount} SPONSORS · ${state.interstitialCount} HOUSE · STARTING`);
      try {
        stage.hidden = false;
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
        try { await post(`/v1/commercials/failed?generation=${state.generation}&reason=${encodeURIComponent(reason)}`); } catch {}
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
        if (!running) showStatus(`LOCAL COMMERCIAL PLAYER\n${state.status.toUpperCase()} · ${state.message}`);
      } catch (error) {
        if (!running) showStatus(`LOCAL COMMERCIAL PLAYER OFFLINE\n${error.message}`);
      }
    }

    audioGate.addEventListener('click', () => {
      if (pendingAudioGate) return;
      audioGate.hidden = true;
      showStatus('LOCAL COMMERCIAL PLAYER READY · AUDIO ENABLED');
    });
    if (debug && !navigator.userActivation?.hasBeenActive) audioGate.hidden = false;

    void poll();
    setInterval(() => void poll(), 500);
  </script>
</body>
</html>
""";
}
