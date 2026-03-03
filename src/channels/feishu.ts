import * as lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, GROUPS_DIR } from '../config.js';
import { logger } from '../logger.js';
import { readEnvFile } from '../env.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface FeishuChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class FeishuChannel implements Channel {
  name = 'feishu';

  private client!: lark.Client;
  private appId: string;
  private appSecret: string;
  private connected = false;
  private botOpenId: string | undefined;
  private wsClient: lark.WSClient | null = null;

  private opts: FeishuChannelOpts;

  constructor(appId: string, appSecret: string, opts: FeishuChannelOpts) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.client = new lark.Client({
      appId: this.appId,
      appSecret: this.appSecret,
    });

    // Fetch bot's own open_id so we can detect our own messages
    try {
      const resp = await this.client.request({
        method: 'GET',
        url: 'https://open.feishu.cn/open-apis/bot/v3/info',
      });
      this.botOpenId = (resp as any)?.bot?.open_id;
      logger.info({ botOpenId: this.botOpenId }, 'Feishu bot info fetched');
      console.log(`\n  Feishu bot connected (WebSocket)`);
      console.log(`  Bot Open ID: ${this.botOpenId}\n`);
    } catch (err) {
      logger.warn(
        { err },
        'Failed to fetch Feishu bot info, bot message detection may not work',
      );
    }

    // Start WebSocket connection
    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: lark.LoggerLevel.warn,
    });

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        logger.info({ data }, 'Feishu event received');
        await this.handleMessage(data);
      },
    });

    this.wsClient.start({ eventDispatcher });
    this.connected = true;
    logger.info('Connected to Feishu via WebSocket');
  }

  private async handleMessage(data: any): Promise<void> {
    // SDK may pass data as {event: {message, sender}} or directly as {message, sender}
    const msg = data?.message || data?.event?.message;
    const sender = data?.sender || data?.event?.sender;
    if (!msg) return;

    // Skip bot's own messages
    if (
      sender?.sender_id?.open_id &&
      sender.sender_id.open_id === this.botOpenId
    )
      return;

    const chatId = msg.chat_id;
    if (!chatId) return;

    // Only handle text and post (rich text) messages
    const msgType = msg.msg_type || msg.message_type;
    if (msgType !== 'text' && msgType !== 'post' && msgType !== 'image') return;

    const chatJid = `${chatId}@feishu`;

    // Check if group is registered before processing
    const groups = this.opts.registeredGroups();
    const group = groups[chatJid];
    if (!group) {
      logger.info(
        { chatJid, sender: sender?.sender_id?.open_id },
        'Message from unregistered Feishu chat - please register this chat first',
      );
      // Still store the chat metadata so it can be discovered
      const timestamp = new Date(Number(msg.create_time)).toISOString();
      const isGroup = msg.chat_type === 'group';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'feishu',
        isGroup,
      );
      return;
    }

    let content = '';
    const downloadedImages: string[] = [];

    try {
      const parsed = JSON.parse(msg.content || '{}');
      if (msgType === 'text') {
        content = parsed.text || '';
      } else if (msgType === 'post') {
        // Extract text from post (rich text) content
        const textParts: string[] = [];
        if (Array.isArray(parsed.post?.zh_cn)) {
          for (const paragraph of parsed.post.zh_cn) {
            if (Array.isArray(paragraph)) {
              for (const element of paragraph) {
                if (element.tag === 'text' && element.text) {
                  textParts.push(element.text);
                } else if (element.tag === 'img' && element.image_key) {
                  // Download image and add path to message
                  const imagePath = await this.downloadImage(
                    msg.message_id,
                    element.image_key,
                    group.folder,
                  );
                  if (imagePath) {
                    downloadedImages.push(imagePath);
                    textParts.push(`[图片: ${imagePath}]`);
                  } else {
                    textParts.push('[图片下载失败]');
                  }
                } else if (element.tag === 'at') {
                  textParts.push(`@${element.user_name || '用户'}`);
                }
              }
            }
          }
        }
        content = textParts.join(' ');
      } else if (msgType === 'image') {
        // Download image
        const imageKey = parsed.image_key;
        if (imageKey) {
          const imagePath = await this.downloadImage(
            msg.message_id,
            imageKey,
            group.folder,
          );
          if (imagePath) {
            downloadedImages.push(imagePath);
            content = `[图片: ${imagePath}]`;
          } else {
            content = '[图片下载失败]';
          }
        }
      }
    } catch {
      return;
    }
    if (!content) return;

    const timestamp = new Date(Number(msg.create_time)).toISOString();
    const senderName = sender?.sender_id?.open_id || 'unknown';

    // Notify chat metadata
    const isGroup = msg.chat_type === 'group';
    this.opts.onChatMetadata(chatJid, timestamp, undefined, 'feishu', isGroup);

    // Add cleanup hint if images were downloaded
    if (downloadedImages.length > 0) {
      content += `\n\n[图片已下载到容器内的 /workspace/group/images/ 目录，使用后请删除这些图片文件]`;
    }

    // Deliver message
    this.opts.onMessage(chatJid, {
      id: msg.message_id || '',
      chat_jid: chatJid,
      sender: sender?.sender_id?.open_id || '',
      sender_name: senderName,
      content,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });
  }

  /**
   * Download image from Feishu message resources and save to group's images directory.
   */
  private async downloadImage(
    messageId: string,
    imageKey: string,
    groupFolder: string,
  ): Promise<string | null> {
    try {
      const imagesDir = path.join(GROUPS_DIR, groupFolder, 'images');
      fs.mkdirSync(imagesDir, { recursive: true });

      // Get tenant access token using direct HTTP request
      const tokenUrl =
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
      const tokenResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.appId,
          app_secret: this.appSecret,
        }),
      });

      const tokenData = (await tokenResp.json()) as {
        code?: number;
        msg?: string;
        tenant_access_token?: string;
      };
      if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
        logger.warn({ tokenData }, 'Failed to get Feishu tenant access token');
        return null;
      }
      const token = tokenData.tenant_access_token;

      // Download image using message resources API
      const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/resources/${imageKey}?type=image`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { messageId, imageKey, status: response.status, error: errorText },
          'Failed to download Feishu image resource',
        );
        return null;
      }

      // Get content type to determine extension
      const contentType = response.headers.get('content-type') || '';
      let actualExt = 'jpg';
      if (contentType.includes('png')) {
        actualExt = 'png';
      } else if (contentType.includes('gif')) {
        actualExt = 'gif';
      } else if (contentType.includes('webp')) {
        actualExt = 'webp';
      }

      const actualFilename = `${imageKey}.${actualExt}`;
      const actualFilePath = path.join(imagesDir, actualFilename);

      // Write image data to file
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(actualFilePath, buffer);

      logger.info(
        { imageKey, path: actualFilePath, size: buffer.length },
        'Feishu image downloaded',
      );

      // Return container-relative path
      return `/workspace/group/images/${actualFilename}`;
    } catch (err) {
      logger.error(
        { messageId, imageKey, err },
        'Error downloading Feishu image',
      );
      return null;
    }
  }

  /**
   * Build markdown card using schema 2.0 format
   */
  private buildMarkdownCard(text: string): Record<string, unknown> {
    return {
      schema: '2.0',
      config: {
        wide_screen_mode: true,
      },
      body: {
        elements: [
          {
            tag: 'markdown',
            content: text,
          },
        ],
      },
    };
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const chatId = jid.replace(/@feishu$/, '');

    try {
      // Always use card rendering for consistent appearance
      const card = this.buildMarkdownCard(text);
      await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'interactive',
          content: JSON.stringify(card),
        },
      });
      logger.info(
        { jid, length: text.length, mode: 'card' },
        'Feishu message sent',
      );
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Feishu message');
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.endsWith('@feishu');
  }

  async disconnect(): Promise<void> {
    // WSClient doesn't have an explicit stop method in this version
    // Just mark as disconnected
    this.wsClient = null;
    this.connected = false;
    logger.info('Feishu disconnected');
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    // Feishu doesn't support typing indicators via API
  }
}

registerChannel('feishu', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['FEISHU_APP_ID', 'FEISHU_APP_SECRET']);

  const appId = process.env.FEISHU_APP_ID || envVars.FEISHU_APP_ID || '';
  const appSecret =
    process.env.FEISHU_APP_SECRET || envVars.FEISHU_APP_SECRET || '';

  if (!appId || !appSecret) {
    return null;
  }

  return new FeishuChannel(appId, appSecret, opts);
});
