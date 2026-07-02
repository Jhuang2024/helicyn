#!/bin/bash
# Double-click launcher (macOS): starts the helicyn-ml /recommend server
# used by the simulator's optional "external_helicyn" policy.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/helicyn-ml" || { echo "Could not find helicyn-ml/ next to this script."; read -rp "Press Enter to close..."; exit 1; }

if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source ".venv/bin/activate"
else
  echo "No .venv found in helicyn-ml/ -- using system/default python3."
fi

if [ ! -d "artifacts/models" ]; then
  echo "Warning: artifacts/models not found under helicyn-ml/. The server may fail to load models."
  echo "See helicyn-sim/docs/how_to_use_without_terminal.md for troubleshooting."
fi

echo "Starting helicyn-ml server on http://127.0.0.1:8765 ..."
echo "This window must stay open while the server is running. Close it to stop."
echo "You only need this for the simulator's 'external_helicyn' policy;"
echo "'integrated_coordination' does not require this server."
echo

python -m helicyn_ml serve --models artifacts/models --host 127.0.0.1 --port 8765
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo
  echo "helicyn-ml server exited with an error (status $STATUS)."
  echo "See helicyn-sim/docs/how_to_use_without_terminal.md for troubleshooting."
  read -rp "Press Enter to close..."
fi
