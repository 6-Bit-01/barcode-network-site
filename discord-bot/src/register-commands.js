// ============================================================
// BARCODE DISCORD BOT — Register Slash Commands
// ============================================================
// Run once (or after command changes) to register slash
// commands with Discord's API.
//
// Usage:  npm run register
// ============================================================

import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // Optional: guild-specific for instant deploy

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required in .env");
  process.exit(1);
}

// ── Load command data ───────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const commandsPath = join(__dirname, "commands");
const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

const commands = [];
for (const file of commandFiles) {
  const command = await import(`./commands/${file}`);
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`  ✓ ${command.data.name}`);
  }
}

// ── Register ────────────────────────────────────────────────
const rest = new REST({ version: "10" }).setToken(TOKEN);

try {
  console.log(`\nRegistering ${commands.length} commands…`);

  if (GUILD_ID) {
    // Guild-specific (instant, good for dev)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log(`✅ Registered to guild ${GUILD_ID}`);
  } else {
    // Global (can take up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands,
    });
    console.log("✅ Registered globally (may take up to 1 hour to propagate)");
  }
} catch (error) {
  console.error("❌ Registration failed:", error);
  process.exit(1);
}