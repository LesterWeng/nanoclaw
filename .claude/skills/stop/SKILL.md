---
name: stop
description: Stop NanoClaw service. Use when user wants to stop NanoClaw for maintenance or when it's not needed. Triggers on "stop nanoclaw", "stop", "shutdown nanoclaw".
---
# NanoClaw Stop

Stop NanoClaw service gracefully.

**Principle:** Check current status first, then stop if needed. Use platform-specific commands for macOS and Linux.

## Check Current Status

First, check if NanoClaw is currently running:

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

## Stop Commands

### macOS
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
```

### Linux
```bash
systemctl --user stop nanoclaw
```

## After Stopping

Verify NanoClaw is stopped:
- macOS: `launchctl list | grep nanoclaw` (should return nothing)
- Linux: `systemctl --user status nanoclaw` (should show inactive)

## Common Issues

**Service won't stop:**
- macOS: Try `launchctl stop com.nanoclaw` first, then unload
- Linux: Try `systemctl --user kill nanoclaw` (force kill)

**Permission issues:**
- Ensure you're running with the same user that started the service
- On Linux, verify you're in the systemd user session

## Service Management

### Start (if needed)
- macOS: `launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist`
- Linux: `systemctl --user start nanoclaw`

### Restart (if needed)
- macOS: `launchctl kickstart -k gui/$(id -u)/com.nanoclaw`
- Linux: `systemctl --user restart nanoclaw`