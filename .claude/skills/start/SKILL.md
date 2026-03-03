---
name: start
description: Start NanoClaw service. Use when user wants to start NanoClaw after installation or when it's stopped. Triggers on "start nanoclaw", "start", "restart nanoclaw".
---
# NanoClaw Start

Start NanoClaw service with proper platform-specific commands.

**Principle:** Check current status first, then start if needed. Use platform-specific commands for macOS and Linux.

## Check Current Status

First, check if NanoClaw is already running:

**macOS:**
```bash
if launchctl list | grep -q nanoclaw; then
  echo "STATUS=running"
else
  echo "STATUS=stopped"
fi
```

**Linux:**
```bash
if systemctl --user is-active --quiet nanoclaw; then
  echo "STATUS=running"
else
  echo "STATUS=stopped"
fi
```

## Start Commands

### macOS
If not running:
```bash
npm run build
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

If already running:
```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### Linux
If not running:
```bash
npm run build
systemctl --user start nanoclaw
```

If already running:
```bash
systemctl --user restart nanoclaw
```

## After Starting

Verify NanoClaw is running:
- Check status: macOS `launchctl list | grep nanoclaw`, Linux `systemctl --user status nanoclaw`
- Check logs: `tail -f logs/nanoclaw.log`
- Test with a message in your registered chat

## Common Issues

**Service fails to start:**
- Check `logs/nanoclaw.error.log` for errors
- Ensure `.env` file exists with required credentials
- Try rebuilding: `npm run build`

**Permission issues (macOS):**
- Ensure the plist file exists at `~/Library/LaunchAgents/com.nanoclaw.plist`
- Check if NanoClaw.app is executable

**Permission issues (Linux):**
- Ensure user is in docker group: `groups | grep docker`
- If not: `sudo usermod -aG docker $USER` (then log out/in)

## Service Management

### Stop (if needed)
- macOS: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist`
- Linux: `systemctl --user stop nanoclaw`

### Restart
- macOS: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- Linux: `systemctl --user restart nanoclaw`