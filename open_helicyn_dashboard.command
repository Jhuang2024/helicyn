#!/bin/bash
# Double-click launcher (macOS): opens the Helicyn Sim research dashboard
# in Streamlit without typing any terminal commands.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/helicyn-sim" || { echo "Could not find helicyn-sim/ next to this script."; read -rp "Press Enter to close..."; exit 1; }

if [ -f ".venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source ".venv/bin/activate"
else
  echo "No .venv found in helicyn-sim/ -- using system/default python3."
fi

echo "Starting Helicyn Sim dashboard (streamlit run helicyn_sim/dashboard/app.py)..."
echo "This window must stay open while the dashboard is running. Close it to stop."
echo

streamlit run helicyn_sim/dashboard/app.py
STATUS=$?

if [ $STATUS -ne 0 ]; then
  echo
  echo "Dashboard exited with an error (status $STATUS)."
  echo "See helicyn-sim/docs/how_to_use_without_terminal.md for troubleshooting."
  read -rp "Press Enter to close..."
fi
