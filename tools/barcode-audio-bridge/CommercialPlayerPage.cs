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
    video { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: contain; background: transparent; }
    video[hidden] { display: none; }
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
      z-index: 2;
    }
    body.debug #status { display: block; }
  </style>
</head>
<body>
  <video id="player" preload="auto" autoplay playsinline disablepictureinpicture hidden></video>
  <div id="status">LOCAL COMMERCIAL PLAYER READY</div>
  <script>
    const query = new URLSearchParams(location.search);
    const debug = query.get('debug') === '1';
    document.body.classList.toggle('debug', debug);

    const player = document.getElementById('player');
    const statusBox = document.getElementById('status');
    if (debug) player.controls = true;

    let activeGeneration = -1;
    let runToken = 0;
    let running = false;
    let preloadPlayer = null;

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

    function clearPlayer() {
      runToken += 1;
      running = false;
      player.pause();
      player.removeAttribute('src');
      player.load();
      player.hidden = true;
      releasePreload();
    }

    function preload(item) {
      releasePreload();
      if (!item) return;
      preloadPlayer = document.createElement('video');
      preloadPlayer.preload = 'auto';
      preloadPlayer.src = item.url;
      preloadPlayer.load();
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
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(player.error?.message || `could not play ${item.name}`));
        };

        player.addEventListener('ended', onEnded, { once: true });
        player.addEventListener('error', onError, { once: true });
        player.src = item.url;
        player.hidden = false;
        player.load();
        preload(nextItem);
        player.play().catch(error => {
          cleanup();
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
      showStatus(`BREAK ${state.generation} · ${state.sponsorCount} SPONSORS · STARTING`);

      try {
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
