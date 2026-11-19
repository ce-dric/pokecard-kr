import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { externalLinks } from "./external-links.mjs";

const naverInfo = "https://blog.naver.com/mdsd12/224483594953";
const middleDot = "\u00b7";

test("external links are omitted when a set does not list any", () => {
  assert.deepEqual(externalLinks(undefined), []);
  assert.deepEqual(externalLinks(null), []);
  assert.deepEqual(externalLinks({}), []);
  assert.deepEqual(externalLinks({ externalLinks: null }), []);
  assert.deepEqual(externalLinks({ externalLinks: [] }), []);
  assert.deepEqual(externalLinks({ externalLinks: "https://example.com" }), []);
  assert.deepEqual(
    externalLinks({
      externalLinks: [
        { label: "  ", href: "https://example.com/blank" },
        { label: "script", href: "javascript:alert(1)" },
        { href: "https://example.com/no-label" },
        { label: "no href" },
      ],
    }),
    [],
  );
});

test("external links keep http labels and drop everything else", () => {
  assert.deepEqual(
    externalLinks({
      externalLinks: [
        { label: " 추가 정보 ", href: ` ${naverInfo} ` },
        { label: "상대 경로", href: "/sets/storm-emeralda/" },
      ],
    }),
    [{ label: "추가 정보", href: naverInfo }],
  );
});

test("Storm Emeralda links the Naver info post and other sets do not", () => {
  const dir = new URL("../data/sets/", import.meta.url);
  const names = readdirSync(dir).filter((name) => name.endsWith(".json"));
  assert.ok(names.includes("m6.json"));
  for (const name of names) {
    const raw = readFileSync(new URL(name, dir), "utf8");
    assert.equal(raw.includes(middleDot), false, name);
    const set = JSON.parse(raw);
    const links = externalLinks(set);
    if (set.id === "m6") {
      assert.deepEqual(links, [{ label: "추가 정보", href: naverInfo }]);
    } else {
      assert.deepEqual(links, [], set.id);
    }
  }
});

test("the set page shows those links under the description", () => {
  const page = readFileSync(new URL("../pages/sets/[slug].astro", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/site.css", import.meta.url), "utf8");
  assert.equal(page.includes(naverInfo), false);
  assert.equal(page.includes(middleDot), false);
  assert.equal(css.includes(middleDot), false);
  const lede = page.indexOf('class="lede"');
  const more = page.indexOf('class="more-info"');
  const facts = page.indexOf('class="facts"');
  assert.ok(lede !== -1 && more > lede && facts > more);
  const block = page.slice(more, facts);
  assert.match(page, /externalLinks\(set\)/);
  assert.match(block, /rel="noopener"/);
  assert.match(block, /target="_blank"/);
  assert.match(block, /class="sr-only"/);
  assert.match(css, /\.more-info\s*\{[^}]*font-size:\s*12px/);
});
