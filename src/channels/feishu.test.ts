import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeishuChannel } from './feishu.js';

describe('FeishuChannel', () => {
  let mockOpts: any;
  let channel: FeishuChannel;

  beforeEach(() => {
    mockOpts = {
      onMessage: vi.fn(),
      onChatMetadata: vi.fn(),
      registeredGroups: vi.fn(() => ({})),
    };
    channel = new FeishuChannel(
      'test_app_id',
      'test_app_secret',
      mockOpts,
    );
  });

  describe('name', () => {
    it('should have correct channel name', () => {
      expect(channel.name).toBe('feishu');
    });
  });

  describe('ownsJid', () => {
    it('should own feishu JIDs', () => {
      expect(channel.ownsJid('fs:123456')).toBe(true);
    });

    it('should not own non-feishu JIDs', () => {
      expect(channel.ownsJid('tg:123456')).toBe(false);
      expect(channel.ownsJid('wa:123456')).toBe(false);
      expect(channel.ownsJid('123456')).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(channel.isConnected()).toBe(false);
    });
  });

  describe('setTyping', () => {
    it('should be callable (no-op for Feishu)', async () => {
      await expect(channel.setTyping('fs:123', true)).resolves.toBeUndefined();
    });
  });

  describe('disconnect', () => {
    it('should handle disconnect gracefully', async () => {
      await expect(channel.disconnect()).resolves.toBeUndefined();
    });
  });
});
