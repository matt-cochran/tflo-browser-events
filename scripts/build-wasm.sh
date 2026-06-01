#!/usr/bin/env bash
# Build the tflo-cep WASM bindings consumed by this package.
#
# Expects:
#   - $TFLO_PATH — path to the companion tflo monorepo (default: ../tflo)
#   - wasm-pack installed (https://rustwasm.github.io/wasm-pack/)
#
# Output: ./src/wasm/ with the wasm-pack --target web bundle.

set -euo pipefail

TFLO_PATH="${TFLO_PATH:-../tflo}"
OUT_DIR="$(pwd)/src/wasm"

if [[ ! -d "$TFLO_PATH/tflo-cep-wasm" ]]; then
  echo "error: tflo-cep-wasm not found at $TFLO_PATH/tflo-cep-wasm"
  echo "       set TFLO_PATH or clone https://github.com/matt-cochran/tflo next to this repo"
  exit 1
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "error: wasm-pack not installed"
  echo "       see https://rustwasm.github.io/wasm-pack/installer/"
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

pushd "$TFLO_PATH/tflo-cep-wasm" >/dev/null
wasm-pack build --target web --release --out-dir "$OUT_DIR" --out-name tflo_cep_wasm
popd >/dev/null

echo "build-wasm: wrote $OUT_DIR"
