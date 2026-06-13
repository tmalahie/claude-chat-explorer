#!/usr/bin/env bash
# Stop and remove the Claude Chat Explorer LaunchAgent.
set -euo pipefail

LABEL="com.tim.claude-chat-explorer"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ -f "$PLIST" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "✓ Removed LaunchAgent and stopped the background server."
else
  echo "Nothing to remove — $PLIST does not exist."
fi
