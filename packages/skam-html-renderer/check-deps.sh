#!/bin/bash
# Dependency direction enforcement: shared -> display -> api
# Violations are flagged when a lower layer imports from a higher layer.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/src" && pwd)"

# Layer definitions (files without .ts extension for import matching)
# Shared (基盤層): types, config, pure helpers — must not import display or api
SHARED="render-config render-tree-types html-utils css-tag mark-utils styles"
# Display (表示層): render tree build/render, token renderer, orchestrator — must not import api
DISPLAY="build-render-tree render-tree token-renderer render-display-layer"
# API (公開層): public entry points
API="renderer"
# Standalone: calibrate, interactive — not part of the layer chain (only used by renderer/index)

errors=0

check_no_import() {
  local src_file="$1"
  local forbidden_module="$2"
  local violation_label="$3"
  if [ -f "$DIR/${src_file}.ts" ] && grep -qE "from '\\.\\/($forbidden_module)\\.js'" "$DIR/${src_file}.ts" 2>/dev/null; then
    echo "VIOLATION: ${src_file}.ts imports ${forbidden_module}.ts ($violation_label)"
    errors=$((errors + 1))
  fi
}

# Shared must not import Display or API
for src in $SHARED; do
  for target in $DISPLAY $API; do
    check_no_import "$src" "$target" "shared -> display/api"
  done
done

# Display must not import API
for src in $DISPLAY; do
  for target in $API; do
    check_no_import "$src" "$target" "display -> api"
  done
done

if [ "$errors" -gt 0 ]; then
  echo "Found $errors dependency direction violation(s)"
  exit 1
fi
echo "No dependency direction violations found"
