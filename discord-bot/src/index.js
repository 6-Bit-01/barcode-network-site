// ============================================================
// BARCODE DISCORD BOT — Main Entry
// ============================================================
// Connects to Discord Gateway, handles slash commands, and
// auto-posts now-playing changes to a designated channel.
// ============================================================

import "dotenv/config";
import { Client, GatewayIntentBits, Collection, EmbedBuilder } from "discord.js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getQueueState, TIER_INFO } from "./api.js";

// ── Config ──────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const NOTIFY_CHANNEL_ID = process.env.NOTIFY_CHANNEL_ID || "";
const POLL_INTERVAL_MS = 15_000; // 15 seconds

if (!TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN is required in .env");
  process.exit(1);
}

// ── Client Setup ────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// ── Load Commands ───────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsPath = join(__dirname, "commands");
const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`  ✓ Loaded command: /${command.data.name}`);
  }
}

// ── Interaction Handler ─────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing /${interaction.commandName}:`, error);
    const reply = {
      content: "⚠️ An error occurred while executing this command.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// ── Now-Playing Auto-Post ───────────────────────────────────
let lastNowPlayingId = null;

async function pollNowPlaying() {
  if (!NOTIFY_CHANNEL_ID) return;

  try {
    const { nowPlaying } = await getQueueState();

    // Build a unique ID for the current track
    const currentId = nowPlaying
      ? `${nowPlaying.artist}::${nowPlaying.title}::${nowPlaying.tier}`
      : null;

    // Only post if the track changed
    if (currentId && currentId !== lastNowPlayingId) {
      lastNowPlayingId = currentId;

      const channel = client.channels.cache.get(NOTIFY_CHANNEL_ID);
      if (!channel) return;

      const tier = TIER_INFO[nowPlaying.tier] || TIER_INFO.free;

      const embed = new EmbedBuilder()
        .setTitle("🔊 Now Playing on BARCODE")
        .setColor(tier.color)
        .addFields(
          { name: "Artist", value: nowPlaying.artist || "Unknown", inline: true },
          { name: "Title", value: nowPlaying.title || "Untitled", inline: true },
          { name: "Tier", value: `${tier.emoji} ${tier.name}`, inline: true },
        )
        .setTimestamp();

      if (nowPlaying.link) {
        embed.addFields({ name: "Link", value: nowPlaying.link });
      }

      embed.setFooter({ text: "barcode-network.com" });

      await channel.send({ embeds: [embed] });
    } else if (!currentId) {
      lastNowPlayingId = null;
    }
  } catch (err) {
    // Silently retry on next poll
    console.error("[poll] Now-playing poll error:", err.message);
  }
}

// ── Ready ───────────────────────────────────────────────────
client.once("ready", () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  BARCODE Bot online as ${client.user.tag}`);
  console.log(`║  Serving ${client.guilds.cache.size} guild(s)`);
  console.log(`║  ${client.commands.size} commands loaded`);
  console.log(`╚══════════════════════════════════════╝\n`);

  // Start now-playing poller
  if (NOTIFY_CHANNEL_ID) {
    console.log(`📡 Now-playing auto-post → channel ${NOTIFY_CHANNEL_ID}`);
    setInterval(pollNowPlaying, POLL_INTERVAL_MS);
    pollNowPlaying(); // Initial check
  } else {
    console.log("ℹ️  NOTIFY_CHANNEL_ID not set — auto-post disabled");
  }
});

// ── Launch ──────────────────────────────────────────────────
client.login(TOKEN);