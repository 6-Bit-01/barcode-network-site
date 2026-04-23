// ============================================================
// COMMAND: /nowplaying — Show current track details
// ============================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getQueueState, TIER_INFO } from "../api.js";

export const data = new SlashCommandBuilder()
  .setName("nowplaying")
  .setDescription("Show what's currently playing on BARCODE");

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const { nowPlaying, queue } = await getQueueState();

    if (!nowPlaying) {
      const embed = new EmbedBuilder()
        .setTitle("📡 BARCODE — Now Playing")
        .setDescription("_No transmission active. The airwaves are silent…_")
        .setColor(0x333333)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const tier = TIER_INFO[nowPlaying.tier] || TIER_INFO.free;

    const embed = new EmbedBuilder()
      .setTitle("🔊 Now Playing on BARCODE")
      .setColor(tier.color)
      .addFields(
        { name: "Artist", value: nowPlaying.artist || "Unknown", inline: true },
        { name: "Title", value: nowPlaying.title || "Untitled", inline: true },
        { name: "Tier", value: `${tier.emoji} ${tier.name}`, inline: true },
      );

    if (nowPlaying.link) {
      embed.addFields({ name: "Link", value: nowPlaying.link });
    }

    if (nowPlaying.submittedBy) {
      embed.setFooter({ text: `Submitted by ${nowPlaying.submittedBy}` });
    }

    if (queue.length > 0) {
      const next = queue[0];
      const nextTier = TIER_INFO[next.tier] || TIER_INFO.free;
      embed.addFields({
        name: "⏭️ Up Next",
        value: `${nextTier.emoji} **${next.artist}** — ${next.title}`,
      });
    }

    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/nowplaying]", err);
    await interaction.editReply("⚠️ Failed to fetch now-playing data.");
  }
}