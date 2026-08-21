#!/bin/zsh
# Installs a macOS LaunchAgent that keeps the HALO PWA downloader running:
#  - starts at login (RunAtLoad)
#  - auto-restarts on crash (KeepAlive)
#  - prevents system sleep while running (caffeinate -is)
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.halo.downloader.plist"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.halo.downloader</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>-lc</string>
        <string>cd '$PROJECT_DIR' && exec caffeinate -is npm run downloader</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/downloader.log</string>

    <key>StandardErrorPath</key>
    <string>$LOG_DIR/downloader.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✅ HALO daemon installed and started."
echo "   Logs:      npm run daemon:logs"
echo "   Stop:      npm run daemon:stop"
echo "   Restart:   npm run daemon:restart"
