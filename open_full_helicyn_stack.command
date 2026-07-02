#!/bin/bash
# Double-click launcher (macOS): starts the full local Helicyn stack --
# the helicyn-ml server in one Terminal window, then the Helicyn Sim
# dashboard in this window.
#
# Limitation: opening a second Terminal window from a .command file is
# best-effort. This uses `osascript` to open a new Terminal tab/window
# running start_helicyn_ml_server.command. If your Mac blocks
# AppleScript/Terminal automation (System Settings -> Privacy & Security ->
# Automation), start the ML server manually instead by double-clicking
# start_helicyn_ml_server.command, then run this script (or
# open_helicyn_dashboard.command) separately.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting helicyn-ml server in a new Terminal window..."
osascript -e "tell application \"Terminal\" to do script \"'${SCRIPT_DIR}/start_helicyn_ml_server.command'\"" >/dev/null 2>&1
OSA_STATUS=$?

if [ $OSA_STATUS -ne 0 ]; then
  echo "Could not open a new Terminal window automatically (Automation may be blocked)."
  echo "Start it manually: double-click start_helicyn_ml_server.command, then re-run this script."
  read -rp "Press Enter to continue and open the dashboard anyway..."
fi

echo
echo "Opening the Helicyn Sim dashboard in this window..."
echo "(external_helicyn will only work once the helicyn-ml server window above is ready;"
echo " integrated_coordination works immediately without it.)"
echo

exec "${SCRIPT_DIR}/open_helicyn_dashboard.command"
