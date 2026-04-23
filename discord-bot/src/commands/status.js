// ============================================================
// COMMAND: /status — Show BARCODE broadcast station status
// ============================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getQueueState, getLiveStatus } from "../api.js";

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show BARCODE broadcast station status");

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const [queueData, liveData] = await Promise.all([
      getQueueState().catch(() => null),
      getLiveStatus().catch(() => null),
    ]);

    const isLive = liveData?.isLive ?? false;
    const isScheduled = liveData?.isScheduled ?? false;
    const queueLength = queueData?.queue?.length ?? 0;
    const totalPlayed = queueData?.totalPlayed ?? 0;
    const hasNowPlaying = !!queueData?.nowPlaying;

    const statusEmoji = isLive ? "🟢" : "🔴";
    const statusText = isLive ? "LIVE — Broadcasting" : "OFFLINE";

    const embed = new EmbedBuilder()
      .setTitle("📡 BARCODE Station Status")
      .setColor(isLive ? 0x00ff88 : 0xff4444)
      .addFields(
        { name: "Status", value: `${statusEmoji} ${statusText}`, inline: true },
        { name: "Queue Depth", value: `${queueLength} entries`, inline: true },
        { name: "Total Played", value: `${totalPlayed}`, inline: true },
      );

    if (isScheduled && !isLive) {
      embed.addFields({
        name: "📅 Schedule",
        value: "Within scheduled broadcast window — may go live soon",
      });
    }

    if (hasNowPlaying && queueData.nowPlaying) {
      embed.addFields({
        name: "🔊 Currently Playing",
        value: `**${queueData.nowPlaying.artist}** — ${queueData.nowPlaying.title}`,
      });
    }

    if (liveData?.streamUrl) {
      embed.addFields({
        name: "🔗 Watch",
        value: `[barcode-network.com](${liveData.streamUrl})`,
      });
    }

    embed.setFooter({ text: "barcode-network.com" }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/status]", err);
    await interaction.editReply("⚠️ Failed to fetch station status.");
  }
}