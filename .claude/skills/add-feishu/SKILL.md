---
name: add-feishu
description: Add Feishu (Lark) as a channel using WebSocket long-connection. Supports full bi-directional messaging with groups and direct messages.
---

# Add Feishu Channel

This skill adds Feishu (Lark) support to NanoClaw using WebSocket long-connection mode.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `feishu` is in `applied_skills`, skip to Phase 3 (Setup).

## Phase 2: Apply Code Changes

Run the skills engine to apply this skill's code package.

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-feishu
```

This deterministically:
- Adds `src/channels/feishu.ts` (FeishuChannel class with WebSocket support)
- Adds `src/channels/feishu.test.ts` (unit tests)
- Appends `import './feishu.js'` to `src/channels/index.ts`
- Installs the `@larksuiteoapi/node-sdk` npm dependency
- Updates `.env.example` with `FEISHU_APP_ID` and `FEISHU_APP_SECRET`
- Records the application in `.nanoclaw/state.yaml`

### Validate code changes

```bash
npm test
npm run build
```

## Phase 3: Setup

### Create Feishu App

1. Go to [Feishu Open Platform](https://open.feishu.cn/app) (or [Lark Developer Platform](https://open.larksuite.com/app) for international users)
2. Click "Create Self-built App" (创建自建应用)
3. Fill in:
   - App Name: e.g., "Andy Assistant"
   - App Description: e.g., "AI Assistant"
4. After creation, go to **App Credentials** (凭证与基础信息) to get:
   - **App ID**
   - **App Secret**

### Configure Event Subscription

1. In your Feishu app, go to **Event Subscription** (事件订阅)
2. Enable event subscription
3. Subscribe to these events:
   - `im.message.receive_v1` (Receive message)
4. No need to configure Encrypt Key or Verification Token for WebSocket mode

### Configure Permissions

Go to **Permissions & Scopes** (权限管理) and add:
- `im:message` (Send and receive messages)
- `im:message:group_at_msg` (Read group @mentions)
- `im:chat` (Access chat information)

### Configure environment

Add to `.env`:

```bash
FEISHU_APP_ID=<your-app-id>
FEISHU_APP_SECRET=<your-app-secret>
```

Sync to container environment:

```bash
mkdir -p data/env && cp .env data/env/env
```

### Build and restart

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

### Verify Connection

Check logs to confirm WebSocket connection:

```bash
tail -f logs/nanoclaw.log
```

You should see:
```
Feishu bot connected (WebSocket)
Bot Open ID: ou_xxxxx
Connected to Feishu via WebSocket
```

## Phase 4: Registration

### Add Bot to Chat

1. In Feishu, search for your app by name
2. Add it to a group chat or start a direct message
3. Send a test message

### Get Chat ID

When you send a message, check the logs for "unregistered Feishu chat":

```bash
tail -f logs/nanoclaw.log | grep "unregistered"
```

You'll see the Chat ID (format: `oc_xxxxx`).

### Register the chat

Use SQLite to register directly:

```bash
sqlite3 store/messages.db << 'EOF'
INSERT INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger, is_main)
VALUES (
  'oc_xxxxx@feishu',
  'Feishu Chat',
  'feishu_main',
  '@Andy',
  datetime('now'),
  0,
  1
);
EOF
```

For a main chat (responds to all messages, no trigger needed), set `requires_trigger=0` and `is_main=1`.

For regular groups (requires @Andy trigger), set `requires_trigger=1` and `is_main=0`.

Restart service:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 5: Verify

### Test the connection

Send a message to your registered Feishu chat:
- For main chat: Any message works
- For non-main: `@Andy hello`

The bot should respond within a few seconds with a **card-formatted message**.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log
```

## Features

- ✅ WebSocket long-connection (real-time message delivery)
- ✅ Card-format responses (Markdown rendering)
- ✅ Automatic image download to container
- ✅ Rich text message parsing
- ✅ Filters out bot's own messages

## Troubleshooting

### Bot not responding

Check:
1. All Feishu credentials are set in `.env` AND synced to `data/env/env`
2. Chat is registered in SQLite
3. Event subscription is configured in Feishu open platform
4. Service is running: `launchctl list | grep nanoclaw` (macOS)

### No messages received

1. Check event subscription is enabled in Feishu app
2. Verify `im.message.receive_v1` event is subscribed
3. Check logs for "Feishu event received" - if not present, WebSocket isn't getting events
4. Make sure bot has permissions to access the chat

### Images not downloading

1. Check bot has `im:message` and `im:chat` permissions
2. Verify group folder exists and is writable
3. Check logs for specific download errors

## After Setup

If running `npm run dev` while the service is active:

```bash
# macOS:
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
npm run dev
# When done testing:
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

## Removal

To remove Feishu integration:

1. Delete `src/channels/feishu.ts` and `src/channels/feishu.test.ts`
2. Remove `import './feishu.js'` from `src/channels/index.ts`
3. Remove Feishu credentials from `.env`
4. Remove Feishu registrations from SQLite: `sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE '%@feishu'"`
5. Uninstall: `npm uninstall @larksuiteoapi/node-sdk`
6. Rebuild and restart service
