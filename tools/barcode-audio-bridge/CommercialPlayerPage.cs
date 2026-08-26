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
      object-fit: cover;
      transform: scale(1.18);
      transform-origin: left top;
      background: transparent;
      z-index: 0;
      pointer-events: none;
    }
    #tv-stage {
      position: absolute;
      top: 30.6%;
      left: 50%;
      width: 92%;
      aspect-ratio: 719 / 435;
      transform: translateX(-50%);
      overflow: hidden;
      isolation: isolate;
      z-index: 2;
      pointer-events: none;
    }
    #tv-source {
      position: absolute;
      left: -2.6738%;
      top: -2.7624%;
      width: 106.9519%;
      height: 110.4972%;
      isolation: isolate;
    }
    #video-window {
      position: absolute;
      left: 5%;
      top: 8.5%;
      width: 90%;
      height: 77%;
      overflow: hidden;
      background: #000;
      z-index: 1;
    }
    #player {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(1.10);
      transform-origin: center;
      background: #000;
      z-index: 1;
    }
    #player[data-fit="soft"] {
      object-fit: fill;
      transform: scale(1.015);
    }
    #tv-overlay-video {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      z-index: 2;
      -webkit-mask: url(#tv-bezel-mask) center / 100% 100% no-repeat;
      mask: url(#tv-bezel-mask) center / 100% 100% no-repeat;
    }
    #corner-logo {
      position: absolute;
      right: 2.2%;
      bottom: 2.2%;
      width: 18%;
      height: 16%;
      object-fit: contain;
      object-position: right bottom;
      opacity: 0;
      transition: opacity var(--corner-logo-fade-duration, 2400ms) ease;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.8));
      z-index: 2;
      pointer-events: none;
    }
    #corner-logo[data-variant="2"] {
      width: 15.3%;
      height: 13.6%;
    }
    #corner-logo.visible { opacity: 1; }
    #tv-light-pulses {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 3;
      pointer-events: none;
    }
    #tv-light-pulses span {
      position: absolute;
      aspect-ratio: 1;
      border-radius: 50%;
      opacity: .08;
      mix-blend-mode: screen;
      will-change: opacity, filter;
    }
    #tv-light-yellow {
      left: 87.4%;
      top: 4.8%;
      width: 2.2%;
      background: radial-gradient(circle, #fffbd0 0 16%, #ffd21c 38%, rgba(255,185,0,.72) 58%, transparent 76%);
      animation: tv-light-yellow-pulse 1.7s steps(1, end) infinite;
    }
    #tv-light-red {
      left: 90.7%;
      top: 4.9%;
      width: 2.1%;
      background: radial-gradient(circle, #fff0df 0 14%, #ff4a25 36%, rgba(255,35,18,.72) 58%, transparent 76%);
      animation: tv-light-red-pulse 1.35s steps(1, end) -.55s infinite;
    }
    @keyframes tv-light-yellow-pulse {
      0%, 18%, 37%, 68%, 100% { opacity: .08; filter: brightness(.85); }
      19%, 31%, 69%, 82% { opacity: .88; filter: brightness(1.35); }
      32%, 36%, 83%, 91% { opacity: .28; filter: brightness(1); }
    }
    @keyframes tv-light-red-pulse {
      0%, 29%, 48%, 77%, 100% { opacity: .06; filter: brightness(.8); }
      30%, 43%, 78%, 90% { opacity: .82; filter: brightness(1.3); }
      44%, 47%, 91%, 96% { opacity: .24; filter: brightness(1); }
    }
    #logo {
      position: absolute;
      top: 5.4%;
      left: 50%;
      width: 96%;
      height: 26.5%;
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
    #logo[data-brand="bcn"], #logo[data-brand="bl"] {
      top: 2.0875%;
      width: 120%;
      height: 33.125%;
    }
    #logo.visible { opacity: 1; transform: translate(-50%, 0) scale(1); }
    #background-video[hidden], #tv-overlay-video[hidden], #logo[hidden], #corner-logo[hidden] { display: none; }
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
  </style>
</head>
<body>
  <svg aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">
    <defs>
      <mask id="tv-bezel-mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" style="mask-type:alpha">
        <path fill="white" fill-rule="evenodd" d="M0 0H1V1H0Z M.083007 .097510H.914399C.925858 .097510 .935149 .112374 .935149 .130710V.809123C.935149 .827459 .925858 .842323 .914399 .842323H.083007C.071548 .842323 .062257 .827459 .062257 .809123V.130710C.062257 .112374 .071548 .097510 .083007 .097510Z"></path>
      </mask>
    </defs>
  </svg>
  <div id="stage" hidden>
    <video id="background-video" preload="auto" autoplay muted loop playsinline disablepictureinpicture hidden></video>
    <div id="tv-stage">
      <div id="tv-source">
        <div id="video-window">
          <video id="player" preload="metadata" autoplay playsinline disablepictureinpicture></video>
          <img id="corner-logo" alt="" hidden>
        </div>
        <video id="tv-overlay-video" preload="auto" autoplay muted loop playsinline disablepictureinpicture hidden></video>
        <div id="tv-light-pulses" aria-hidden="true">
          <span id="tv-light-yellow"></span>
          <span id="tv-light-red"></span>
        </div>
      </div>
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
    const videoWindow = document.getElementById('video-window');
    const cornerLogo = document.getElementById('corner-logo');
    const logo = document.getElementById('logo');
    const audioGate = document.getElementById('audio-gate');
    const statusBox = document.getElementById('status');

    let activeGeneration = -1;
    let runToken = 0;
    let running = false;
    let logoTimers = [];
    let cornerLogoTimers = [];
    let pendingAudioGate = null;

    const softFitNames = new Set(['eversnow', 'alien', 'crackedencounters']);
    const softFitMaximumStretch = 1.085;

    function showStatus(message) { statusBox.textContent = message; }

    async function post(path) {
      const response = await fetch(path, { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error(`local player update failed (${response.status})`);
    }

    function clearLogo() {
      for (const timer of logoTimers) clearTimeout(timer);
      logoTimers = [];
      logo.classList.remove('visible');
      logo.hidden = true;
      logo.removeAttribute('src');
      delete logo.dataset.brand;
      logo.style.removeProperty('--logo-fade-duration');
    }

    function clearCornerLogo() {
      for (const timer of cornerLogoTimers) clearTimeout(timer);
      cornerLogoTimers = [];
      cornerLogo.classList.remove('visible');
      cornerLogo.hidden = true;
      cornerLogo.removeAttribute('src');
      delete cornerLogo.dataset.variant;
      cornerLogo.style.removeProperty('--corner-logo-fade-duration');
    }

    function showCornerLogo(item, token) {
      clearCornerLogo();
      if (!item.cornerLogoUrl || token !== runToken) return;
      const totalMs = Math.max(1000, item.durationSeconds * 1000);
      const fadeMs = Math.min(2600, Math.max(800, totalMs * .14));
      const revealAt = Math.min(120, totalMs * .03);
      const fadeAt = Math.max(fadeMs + revealAt, totalMs - fadeMs - 200);
      cornerLogo.src = item.cornerLogoUrl;
      cornerLogo.dataset.variant = String(item.cornerLogoVariant || 1);
      cornerLogo.hidden = false;
      cornerLogo.style.setProperty('--corner-logo-fade-duration', `${Math.round(fadeMs)}ms`);
      cornerLogoTimers.push(setTimeout(() => {
        if (token === runToken) cornerLogo.classList.add('visible');
      }, revealAt));
      cornerLogoTimers.push(setTimeout(() => {
        if (token === runToken) cornerLogo.classList.remove('visible');
      }, fadeAt));
    }

    function normalizedCommercialName(name) {
      return String(name || '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
    }

    function resetPlayerFit(item) {
      delete player.dataset.fit;
      if (softFitNames.has(normalizedCommercialName(item?.name))) player.dataset.fit = 'soft';
    }

    function refinePlayerFitFromMetadata(item, token) {
      if (token !== runToken || !player.videoWidth || !player.videoHeight) return;
      const sourceAspect = player.videoWidth / player.videoHeight;
      const apertureAspect = videoWindow.clientWidth > 0 && videoWindow.clientHeight > 0
        ? videoWindow.clientWidth / videoWindow.clientHeight
        : 1.87;
      const stretch = apertureAspect / sourceAspect;
      if (sourceAspect > 1 && stretch >= 1 && stretch <= softFitMaximumStretch) {
        player.dataset.fit = 'soft';
      } else if (!softFitNames.has(normalizedCommercialName(item?.name))) {
        delete player.dataset.fit;
      }
    }

    function clearVisualVideo(video) {
      video.pause();
      video.defaultPlaybackRate = 1;
      video.playbackRate = 1;
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
      delete player.dataset.fit;
      player.load();
      clearVisualVideo(backgroundVideo);
      clearVisualVideo(tvOverlayVideo);
      stage.hidden = true;
      clearLogo();
      clearCornerLogo();
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

    async function startVisualVideo(element, url, label, token, playbackRate = 1) {
      if (!url) throw new Error(`${label} video is unavailable`);
      if (token !== runToken) return;
      element.muted = true;
      element.loop = true;
      element.src = url;
      element.hidden = false;
      element.load();
      element.defaultPlaybackRate = playbackRate;
      element.playbackRate = playbackRate;
      try {
        await element.play();
      } catch (error) {
        throw new Error(`${label} video could not play: ${error?.message || error}`);
      }
      if (token !== runToken) element.pause();
    }

    function showLogo(item, token) {
      clearLogo();
      if (!item.logoUrl || token !== runToken) return;
      const totalMs = Math.max(1000, item.durationSeconds * 1000);
      const fadeMs = Math.min(1800, Math.max(350, totalMs * .2));
      const revealAt = Math.min(180, totalMs * .05);
      const fadeAt = Math.max(fadeMs + revealAt, totalMs - fadeMs - 200);
      logo.src = item.logoUrl;
      if (item.logoBrand) logo.dataset.brand = item.logoBrand;
      logo.hidden = false;
      logo.style.setProperty('--logo-fade-duration', `${Math.round(fadeMs)}ms`);
      logoTimers.push(setTimeout(() => {
        if (token === runToken) logo.classList.add('visible');
      }, revealAt));
      logoTimers.push(setTimeout(() => {
        if (token === runToken) logo.classList.remove('visible');
      }, fadeAt));
    }

    function playItem(item, token) {
      return new Promise((resolve, reject) => {
        if (token !== runToken) { resolve(); return; }
        const cleanup = () => {
          player.removeEventListener('ended', onEnded);
          player.removeEventListener('error', onError);
          player.removeEventListener('loadedmetadata', onMetadata);
        };
        const onEnded = () => { cleanup(); clearLogo(); clearCornerLogo(); resolve(); };
        const onError = () => {
          cleanup();
          clearLogo();
          clearCornerLogo();
          reject(new Error(player.error?.message || `could not play ${item.name}`));
        };
        const onMetadata = () => refinePlayerFitFromMetadata(item, token);
        player.addEventListener('ended', onEnded, { once: true });
        player.addEventListener('error', onError, { once: true });
        player.addEventListener('loadedmetadata', onMetadata, { once: true });
        player.pause();
        resetPlayerFit(item);
        player.src = item.url;
        player.load();
        playWithAudioRecovery(item, token)
          .then(() => { showCornerLogo(item, token); showLogo(item, token); })
          .catch(error => { cleanup(); clearLogo(); clearCornerLogo(); reject(error); });
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
          startVisualVideo(tvOverlayVideo, state.tvOverlayUrl, 'TV overlay', token, .5),
        ]);
        for (let index = startIndex; index < state.items.length; index += 1) {
          if (token !== runToken) return;
          const item = state.items[index];
          showStatus(`BREAK ${state.generation} · ${index + 1}/${state.items.length}\n${item.name}`);
          await post(`/v1/commercials/clip-started?generation=${state.generation}&index=${index}`);
          await playItem(item, token);
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
