#!/usr/bin/env bash
# Install Claude Chat Explorer as a macOS LaunchAgent so it starts at login
# and stays running in the background. Re-run to update.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.tim.claude-chat-explorer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT="${PORT:-9876}"

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Error: node not found on PATH. Install Node or adjust PATH, then re-run." >&2
  exit 1
fi

# Make sure the frontend is built so there is something to serve.
if [ ! -f "$APP_DIR/client/dist/index.html" ]; then
  echo "Frontend not built yet — running 'npm run setup'…"
  (cd "$APP_DIR" && npm run setup)
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$APP_DIR/server/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>$PORT</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/claude-chat-explorer.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/claude-chat-explorer.err.log</string>
</dict>
</plist>
PLIST_EOF

# Reload if already loaded, then load.
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ Installed LaunchAgent: $PLIST"
echo "✓ Claude Chat Explorer is running at http://localhost:$PORT"
echo "  Logs: /tmp/claude-chat-explorer.log (and .err.log)"
echo "  To stop/remove: scripts/uninstall-autostart.sh"
