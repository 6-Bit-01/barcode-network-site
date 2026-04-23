# BARCODE Stream Automation Engine

An AI-powered stream automation service that connects OBS Studio to the BARCODE Network queue system for automated broadcasting.

## What It Does

1. **Connects to OBS** via WebSocket (obs-websocket-js v5)
2. **Polls the queue API** to detect track changes
3. **Auto-advances** to the next track when a timer expires
4. **Switches OBS scenes** based on queue state (live → waiting → offline)
5. **Updates text overlays** in OBS with now-playing info
6. **Sends heartbeat** to the website API for monitoring

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────┐
│  Stream Engine   │ ◄────────────────► │  OBS Studio  │
│  (Node.js)       │                    │              │
└────────┬────────┘                    └──────┬──────┘
         │ HTTP                               │ RTMP
         ▼                                    ▼
┌─────────────────┐                    ┌─────────────┐
│  BARCODE API     │                    │  TikTok /   │
│  (Next.js)       │                    │  Twitch     │
└─────────────────┘                    └─────────────┘
```

## Flow

1. Engine starts → connects to OBS WebSocket
2. Polls `GET /api/queue` every 10s to get current state
3. When a new track is detected:
   - Switches OBS to "BARCODE Live" scene
   - Updates `NowPlaying-Artist`, `NowPlaying-Title`, `NowPlaying-Tier` text sources
   - Starts a 3-minute timer (configurable)
4. When timer expires → calls `POST /api/queue/next` to advance
5. If queue is empty → switches to "Waiting Screen" scene
6. Sends heartbeat to `POST /api/stream-engine/heartbeat` every 30s

## OBS Scene Setup

Create these scenes in OBS (names configurable via env):

| Scene | Purpose |
|-------|---------|
| `BARCODE Live` | Main broadcast scene — shows content + overlays |
| `Waiting Screen` | Shown when queue is empty (use Google Drive iframe) |
| `Intro Sequence` | Optional intro animation |
| `Offline` | Shown when stream is off |

### Recommended OBS Sources (in "BARCODE Live" scene)

| Source Name | Type | Purpose |
|-------------|------|---------|
| `NowPlaying-Artist` | Text (GDI+) | Artist name overlay |
| `NowPlaying-Title` | Text (GDI+) | Track title overlay |
| `NowPlaying-Tier` | Text (GDI+) | Tier badge text |
| `QueueCount` | Text (GDI+) | "X in queue" counter |
| `BrowserOverlay` | Browser | BARCODE OBS overlay page |

## Setup

### Prerequisites

- **OBS Studio** with WebSocket Server enabled (Tools → WebSocket Server Settings)
- **Node.js** 18+
- BARCODE Network API key

### 1. Configure Environment

```bash
cp .env.example .env
```

Fill in `.env`:
```
OBS_WS_URL=ws://localhost:4455
OBS_WS_PASSWORD=your-obs-password
BARCODE_API_URL=https://barcode-network.com
QUEUE_API_KEY=your-api-key
SCENE_LIVE=BARCODE Live
SCENE_WAITING=Waiting Screen
DEFAULT_TRACK_DURATION=180
AUTO_ADVANCE=true
```

### 2. Install & Run

```bash
npm install
npm start
```

For development (auto-restart on changes):
```bash
npm run dev
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OBS_WS_URL` | `ws://localhost:4455` | OBS WebSocket URL |
| `OBS_WS_PASSWORD` | _(empty)_ | OBS WebSocket password |
| `BARCODE_API_URL` | `https://barcode-network.com` | Website API base URL |
| `QUEUE_API_KEY` | _(required)_ | API key for queue operations |
| `SCENE_LIVE` | `BARCODE Live` | OBS scene for active playback |
| `SCENE_WAITING` | `Waiting Screen` | OBS scene when queue is empty |
| `SCENE_INTRO` | `Intro Sequence` | OBS scene for intro animation |
| `SCENE_OFFLINE` | `Offline` | OBS scene when stream is off |
| `DEFAULT_TRACK_DURATION` | `180` | Seconds per track before auto-advance |
| `ADVANCE_WARNING` | `10` | Warning seconds before auto-advance |
| `POLL_INTERVAL` | `10` | Seconds between queue polls |
| `HEARTBEAT_INTERVAL` | `30` | Seconds between heartbeat pings |
| `AUTO_ADVANCE` | `true` | Enable timer-based auto-advance |

## Monitoring

The engine sends heartbeat data to `POST /api/stream-engine/heartbeat`.
Check engine status via `GET /api/stream-engine/heartbeat`:

```json
{
  "online": true,
  "ageSeconds": 12,
  "scene": "BARCODE Live",
  "obsConnected": true,
  "streaming": true,
  "currentTrack": "Artist::Title::free",
  "queueDepth": 5,
  "uptime": 3600
}
```

## Deployment

This runs on the **same machine as OBS Studio** (needs local WebSocket access). Keep it running alongside OBS using:

- **PM2**: `pm2 start src/index.js --name barcode-engine`
- **Windows**: Create a scheduled task or use NSSM as a service
- **tmux/screen**: `screen -S engine node src/index.js`