#!/usr/bin/env bash
# Rebuild public/game/ptcg.wasm and public/game/ptcg.mjs.
# This clones the engine at build time. Do not commit the C++ source.
# CI does not run this script. The site and the Node test use the committed wasm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT="26fd4e3df0e5a9d943560c027ddada40320059cc"
REPO="https://github.com/nikephorosphokas99/ptcg-ai-sim.git"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ is not on PATH. Install emsdk and run: source emsdk_env.sh" >&2
  exit 1
fi

git clone --filter=blob:none --sparse "$REPO" "$WORKDIR/src"
git -C "$WORKDIR/src" sparse-checkout set "rl-train/engine/ptcg_engine_playground"
git -C "$WORKDIR/src" checkout "$COMMIT"

ENGINE="$WORKDIR/src/rl-train/engine/ptcg_engine_playground/ptcgProgram 22"
OUT="$ROOT/public/game"
mkdir -p "$OUT"

# Struct-returning functions (BattleStart, GetBattleData) keep the Emscripten
# ABI: the JS caller passes a result pointer as the first argument.
# getValue, setValue and UTF8ToString are how that caller reads the pointer.
cd "$ENGINE"
em++ -std=c++20 -O2 Export.cpp -o "$OUT/ptcg.mjs" \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=createPtcg \
  -sENVIRONMENT=web,node,worker \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=64MB \
  -sSTACK_SIZE=4MB \
  -fexceptions \
  -sEXPORTED_FUNCTIONS='["_GameInitialize","_BattleStart","_BattleStartReverse","_AgentStart","_BattleFinish","_GetBattleData","_Select","_VisualizeData","_SearchBegin","_SearchStep","_SearchEnd","_SearchRelease","_AllCard","_AllAttack","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["UTF8ToString","getValue","setValue"]'

echo "wrote $OUT/ptcg.wasm and $OUT/ptcg.mjs"
