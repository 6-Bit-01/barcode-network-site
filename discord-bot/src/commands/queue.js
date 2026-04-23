// ============================================================
// COMMAND: /queue — Show the current broadcast queue
// ============================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getQueueState, TIER_INFO } from "../api.js";

export const data = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("Show the current BARCODE broadcast queue");

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const { nowPlaying, queue, totalPlayed } = await getQueueState();

    const embed = new EmbedBuilder()
      .setTitle("📡 BARCODE — Broadcast Queue")
      .setColor(0x00ff88)
      .setTimestamp();

    // Now playing
    if (nowPlaying) {
      const tier = TIER_INFO[nowPlaying.tier] || TIER_INFO.free;
      embed.addFields({
        name: "🔊 NOW PLAYING",
        value: `${tier.emoji} **${nowPlaying.artist}** — ${nowPlaying.title}${nowPlaying.link ? ` ([link](${nowPlaying.link}))` : ""}`,
      });
    } else {
      embed.addFields({
        name: "🔊 NOW PLAYING",
        value: "_Waiting for transmission…_",
      });
    }

    // Upcoming
    if (queue.length > 0) {
      const lines = queue.slice(0, 10).map((entry, i) => {
        const tier = TIER_INFO[entry.tier] || TIER_INFO.free;
        return `\`${i + 1}.\` ${tier.emoji} **${entry.artist}** — ${entry.title}`;
      });
      if (queue.length > 10) {
        lines.push(`_…and ${queue.length - 10} more_`);
      }
      embed.addFields({
        name: `📋 Up Next (${queue.length})`,
        value: lines.join("\n"),
      });
    } else {
      embed.addFields({
        name: "📋 Up Next",
        value: "_Queue is empty — submit something!_",
      });
    }

    embed.setFooter({ text: `Total played this session: ${totalPlayed || 0}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/queue]", err);
    await interaction.editReply("⚠️ Failed to fetch queue. The station may be offline.");
  }
}