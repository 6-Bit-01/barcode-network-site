# BARCODE Discord Bot

A Discord bot for the **BARCODE Network** interdimensional broadcast station. Lets server members interact with the queue, check station status, and submit entries — all from Discord.

## Commands

| Command | Description | Access |
|---------|-------------|--------|
| `/queue` | Show the current broadcast queue | Everyone |
| `/nowplaying` | Display what's currently playing | Everyone |
| `/submit <artist> <title> [link]` | Submit a free entry to the queue | Everyone |
| `/status` | Show station status (live/offline, queue depth) | Everyone |
| `/skip` | Advance to next track | Moderators+ |

## Features

- **Live Queue Embeds** — Rich Discord embeds with tier colors and emoji
- **Auto Now-Playing** — Posts to a channel whenever the track changes (polls every 15s)
- **Rate Limit Handling** — Shows friendly messages when free submission limit is reached
- **Tier Support** — Free / Featured / Fast Lane / Front Row tiers with matching colors

## Setup

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → name it "BARCODE"
3. Go to **Bot** tab → click **Reset Token** → copy the token
4. Go to **OAuth2** tab → note the **Client ID**
5. Under **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
6. Use the generated URL to invite the bot to your server

### 2. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:
```
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_GUILD_ID=your-server-id
BARCODE_API_URL=https://barcode-network.com
QUEUE_API_KEY=your-queue-api-key
NOTIFY_CHANNEL_ID=channel-id-for-now-playing-posts
```

### 3. Install & Run

```bash
npm install
npm run register   # Register slash commands with Discord
npm start          # Start the bot
```

For development:
```bash
npm run dev        # Uses --watch for auto-restart
```

### 4. Register Commands

Run `npm run register` whenever you add or change slash commands. If `DISCORD_GUILD_ID` is set, commands register instantly for that guild. Without it, commands register globally (takes up to 1 hour).

## Deployment

The bot requires a persistent process (WebSocket gateway connection), so it **cannot** run on Vercel. Recommended hosts:

- **Railway** — `railway up` from the `discord-bot/` directory
- **Fly.io** — Create a Dockerfile or use `fly launch`
- **VPS** — Run with PM2: `pm2 start src/index.js --name barcode-bot`

### Railway Quick Deploy

```bash
cd discord-bot
railway init
railway up
```

Set environment variables in the Railway dashboard.

## Architecture

```
discord-bot/
├── src/
│   ├── index.js              # Main entry — gateway, command loader, now-playing poller
│   ├── api.js                # HTTP client for BARCODE website API
│   ├── register-commands.js  # One-time slash command registration
│   └── commands/
│       ├── queue.js          # /queue — show queue
│       ├── nowplaying.js     # /nowplaying — current track
│       ├── submit.js         # /submit — free queue entry
│       ├── status.js         # /status — station status
│       └── skip.js           # /skip — advance queue (mod only)
├── package.json
├── .env.example
└── README.md
```

The bot communicates with the BARCODE website via its public API:
- `GET /api/queue` — Queue state
- `POST /api/queue/free` — Submit free entry
- `POST /api/queue/next` — Skip track (requires API key)
- `GET /api/admin/live` — Live status