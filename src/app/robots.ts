import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/obs", "/api/"],
      },
    ],
    sitemap: "https://www.barcode-network.com/sitemap.xml",
  };
}