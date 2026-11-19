import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createNaverSearch, emptySnapshot, refreshSnapshot } from "../src/lib/community.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "src/data/community/reactions.json");

function loadSets() {
  const dir = join(root, "src/data/sets");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
}

function loadPrevious() {
  try {
    return JSON.parse(readFileSync(outFile, "utf8"));
  } catch {
    return emptySnapshot();
  }
}

function writeJsonAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, file);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const env = process.env;
  const parsed = Number(env.NAVER_MAX_CALLS);
  const maxCalls = Number.isFinite(parsed) && parsed > 0 ? parsed : 480;
  try {
    const result = await refreshSnapshot({
      sets: loadSets(),
      previous: loadPrevious(),
      env,
      maxCalls,
      search: createNaverSearch({
        fetchImpl: globalThis.fetch,
        clientId: env.NAVER_CLIENT_ID,
        clientSecret: env.NAVER_CLIENT_SECRET,
        pause: sleep,
      }),
    });
    if (result.skipped === "no-key") {
      console.log("NAVER API keys are missing. Keeping the existing reaction snapshot.");
      if (!existsSync(outFile)) writeJsonAtomic(outFile, result.snapshot);
      return;
    }
    writeJsonAtomic(outFile, result.snapshot);
    const setCount = Object.keys(result.snapshot.sets || {}).length;
    console.log(
      `calls=${result.calls} errors=${result.errors.length} halted=${Boolean(result.halted)} sets=${setCount}`,
    );
    for (const error of result.errors.slice(0, 8)) {
      console.log(`search failed source=${error.source} status=${error.status}`);
    }
  } catch (error) {
    console.error("Reaction collection failed. Keeping the existing snapshot.");
    console.error(error instanceof Error ? error.message : String(error));
  }
}

await main();
