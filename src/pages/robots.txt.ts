import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const site = import.meta.env.SITE || "https://ce-dric.github.io";
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${site}${base}/sitemap-index.xml\n`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
