// ============================================================
// COMMAND: /submit — Submit a free entry to the BARCODE queue
// ============================================================

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { submitFreeEntry, TIER_INFO } from "../api.js";

export const data = new SlashCommandBuilder()
  .setName("submit")
  .setDescription("Submit a free entry to the BARCODE broadcast queue")
  .addStringOption((opt) =>
    opt.setName("artist").setDescription("Artist name").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("title").setDescription("Track / submission title").setRequired(true),
  )
  .addStringOption((opt) =>
    opt.setName("link").setDescription("Link to the content (optional)").setRequired(false),
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const artist = interaction.options.getString("artist");
  const title = interaction.options.getString("title");
  const link = interaction.options.getString("link") || "";

  try {
    const { entry } = await submitFreeEntry(artist, title, link);

    const embed = new EmbedBuilder()
      .setTitle("✅ Submission Received")
      .setColor(0x00ff88)
      .setDescription("Your transmission has been added to the BARCODE queue.")
      .addFields(
        { name: "Artist", value: artist, inline: true },
        { name: "Title", value: title, inline: true },
        { name: "Tier", value: `${TIER_INFO.free.emoji} ${TIER_INFO.free.name}`, inline: true },
      )
      .setFooter({
        text: "Upgrade at barcode-network.com to jump the queue!",
      })
      .setTimestamp();

    if (link) {
      embed.addFields({ name: "Link", value: link });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/submit]", err);

    // Handle rate limit
    if (err.message.includes("Rate limit") || err.message.includes("429") || err.message.includes("Too many")) {
      await interaction.editReply(
        "⏳ Rate limited — you can submit 3 free entries per hour. Try again later, or visit **barcode-network.com** to submit a paid entry.",
      );
      return;
    }

    await interaction.editReply(
      `⚠️ Submission failed: ${err.message}`,
    );
  }
}