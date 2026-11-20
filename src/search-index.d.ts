declare module "virtual:card-search" {
  import type { SearchItem } from "./lib/site-search";

  const items: SearchItem[];
  export default items;
}
