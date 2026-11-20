import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { searchIndexPlugin } from "./src/lib/search-index-plugin.mjs";

const site = process.env.SITE_URL || "https://ce-dric.github.io";
const base = process.env.BASE_PATH || "/pokecard-kr";

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  integrations: [sitemap()],
  vite: {
    plugins: [searchIndexPlugin()],
  },
});
