// ============================================================
// COMMAND: /skip — Advance to next track (Moderator only)
// ============================================================

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { skipTrack, TIER_INFO } from "../api.js";

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("Skip to the next track in the queue (Moderator+)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const result = await skipTrack();

    const embed = new EmbedBuilder()
      .setTitle("⏭️ Track Skipped")
      .setColor(0xffaa00)
      .setTimestamp();

    if (result.nowPlaying) {
      const tier = TIER_INFO[result.nowPlaying.tier] || TIER_INFO.free;
      embed.setDescription(
        `Now playing: ${tier.emoji} **${result.nowPlaying.artist}** — ${result.nowPlaying.title}`,
      );
    } else {
      embed.setDescription("Queue is now empty. Waiting for next transmission…");
    }

    embed.setFooter({ text: `Skipped by ${interaction.user.tag}` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/skip]", err);
    await interaction.editReply(`⚠️ Skip failed: ${err.message}`);
  }
}