// ============================================================
// BARCODE STREAM ENGINE — OBS Connection Manager
// ============================================================
// Handles WebSocket connection to OBS Studio, scene switching,
// and source manipulation via obs-websocket-js.
// ============================================================

import OBSWebSocket from "obs-websocket-js";

export class OBSManager {
  /** @type {OBSWebSocket} */
  #obs;
  #url;
  #password;
  #connected = false;
  #reconnectTimer = null;

  constructor() {
    this.#obs = new OBSWebSocket();
    this.#url = process.env.OBS_WS_URL || "ws://localhost:4455";
    this.#password = process.env.OBS_WS_PASSWORD || "";

    // Connection events
    this.#obs.on("ConnectionClosed", () => {
      console.warn("[OBS] Connection closed");
      this.#connected = false;
      this.#scheduleReconnect();
    });

    this.#obs.on("ConnectionError", (err) => {
      console.error("[OBS] Connection error:", err.message);
      this.#connected = false;
    });
  }

  get connected() {
    return this.#connected;
  }

  /** Connect to OBS WebSocket */
  async connect() {
    try {
      const result = await this.#obs.connect(this.#url, this.#password);
      this.#connected = true;
      console.log(`[OBS] Connected — OBS v${result.obsWebSocketVersion}, RPC v${result.rpcVersion}`);
      return true;
    } catch (err) {
      console.error("[OBS] Failed to connect:", err.message);
      this.#connected = false;
      this.#scheduleReconnect();
      return false;
    }
  }

  /** Disconnect from OBS */
  async disconnect() {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
    if (this.#connected) {
      await this.#obs.disconnect();
      this.#connected = false;
      console.log("[OBS] Disconnected");
    }
  }

  /** Schedule reconnection attempt */
  #scheduleReconnect() {
    if (this.#reconnectTimer) return;
    console.log("[OBS] Reconnecting in 5s…");
    this.#reconnectTimer = setTimeout(async () => {
      this.#reconnectTimer = null;
      await this.connect();
    }, 5000);
  }

  // ── Scene Control ───────────────────────────────────────

  /** Get current scene name */
  async getCurrentScene() {
    if (!this.#connected) return null;
    try {
      const { currentProgramSceneName } = await this.#obs.call("GetCurrentProgramScene");
      return currentProgramSceneName;
    } catch (err) {
      console.error("[OBS] GetCurrentScene error:", err.message);
      return null;
    }
  }

  /** Switch to a named scene */
  async switchScene(sceneName) {
    if (!this.#connected) {
      console.warn("[OBS] Cannot switch scene — not connected");
      return false;
    }
    try {
      await this.#obs.call("SetCurrentProgramScene", { sceneName });
      console.log(`[OBS] Switched to scene: ${sceneName}`);
      return true;
    } catch (err) {
      console.error(`[OBS] Scene switch error (${sceneName}):`, err.message);
      return false;
    }
  }

  /** List all available scenes */
  async getScenes() {
    if (!this.#connected) return [];
    try {
      const { scenes } = await this.#obs.call("GetSceneList");
      return scenes.map((s) => s.sceneName);
    } catch (err) {
      console.error("[OBS] GetSceneList error:", err.message);
      return [];
    }
  }

  // ── Source Control ──────────────────────────────────────

  /** Set a text source value (e.g., now-playing text overlay) */
  async setText(sourceName, text) {
    if (!this.#connected) return false;
    try {
      await this.#obs.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: { text },
      });
      return true;
    } catch (err) {
      console.error(`[OBS] SetText error (${sourceName}):`, err.message);
      return false;
    }
  }

  /** Set a browser source URL */
  async setBrowserSourceUrl(sourceName, url) {
    if (!this.#connected) return false;
    try {
      await this.#obs.call("SetInputSettings", {
        inputName: sourceName,
        inputSettings: { url },
      });
      return true;
    } catch (err) {
      console.error(`[OBS] SetBrowserSource error (${sourceName}):`, err.message);
      return false;
    }
  }

  /** Show or hide a source in the current scene */
  async setSourceVisible(sceneName, sourceName, visible) {
    if (!this.#connected) return false;
    try {
      const { sceneItemId } = await this.#obs.call("GetSceneItemId", {
        sceneName,
        sourceName,
      });
      await this.#obs.call("SetSceneItemEnabled", {
        sceneName,
        sceneItemId,
        sceneItemEnabled: visible,
      });
      return true;
    } catch (err) {
      console.error(`[OBS] SetSourceVisible error (${sourceName}):`, err.message);
      return false;
    }
  }

  // ── Streaming Control ─────────────────────────────────

  /** Check if OBS is currently streaming */
  async isStreaming() {
    if (!this.#connected) return false;
    try {
      const { outputActive } = await this.#obs.call("GetStreamStatus");
      return outputActive;
    } catch (err) {
      console.error("[OBS] GetStreamStatus error:", err.message);
      return false;
    }
  }

  /** Start streaming */
  async startStream() {
    if (!this.#connected) return false;
    try {
      await this.#obs.call("StartStream");
      console.log("[OBS] Stream started");
      return true;
    } catch (err) {
      console.error("[OBS] StartStream error:", err.message);
      return false;
    }
  }

  /** Stop streaming */
  async stopStream() {
    if (!this.#connected) return false;
    try {
      await this.#obs.call("StopStream");
      console.log("[OBS] Stream stopped");
      return true;
    } catch (err) {
      console.error("[OBS] StopStream error:", err.message);
      return false;
    }
  }

  /** Register an event handler */
  on(event, callback) {
    this.#obs.on(event, callback);
  }
}