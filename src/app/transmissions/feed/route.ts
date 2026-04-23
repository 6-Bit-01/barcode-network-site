import { getAllTransmissions } from "@/lib/transmissions";

export async function GET() {
  const posts = getAllTransmissions();
  const siteUrl = "https://barcode-network.com";

  const rssItems = posts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <link>${siteUrl}/transmissions/${post.slug}</link>
      <guid isPermaLink="true">${siteUrl}/transmissions/${post.slug}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>${post.author}</author>
      <description><![CDATA[${post.excerpt}]]></description>
      ${post.tags.map((tag) => `<category>${tag}</category>`).join("\n      ")}
    </item>`,
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BARCODE Network — Transmissions</title>
    <link>${siteUrl}/transmissions</link>
    <description>Dispatches from the BARCODE Network. Dev logs, signal reports, and broadcast notes.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/transmissions/feed" rel="self" type="application/rss+xml" />
    ${rssItems}
  </channel>
</rss>`;

  return new Response(rss.trim(), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}