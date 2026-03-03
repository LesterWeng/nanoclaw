#!/usr/bin/env node

/**
 * NanoClaw Start Script
 * Checks current status and starts NanoClaw service with platform-specific commands
 */

import { exec } from 'child_process';
import { platform } from 'os';

// Define platform-specific commands
const PLATFORM = platform();
const isMacOS = PLATFORM === 'darwin';
const isLinux = PLATFORM === 'linux';

if (!isMacOS && !isLinux) {
  console.error('Error: NanoClaw start script only supports macOS and Linux');
  process.exit(1);
}

function execAsync(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function checkStatus(): Promise<'running' | 'stopped'> {
  try {
    if (isMacOS) {
      const { stdout } = await execAsync('launchctl list | grep -c nanoclaw');
      const count = parseInt(stdout.trim());
      return count > 0 ? 'running' : 'stopped';
    } else {
      const { stdout } = await execAsync('systemctl --user is-active nanoclaw');
      return stdout.trim() === 'active' ? 'running' : 'stopped';
    }
  } catch {
    return 'stopped';
  }
}

async function buildProject(): Promise<void> {
  console.log('Building NanoClaw...');
  try {
    await execAsync('npm run build');
    console.log('✓ Build successful');
  } catch (error: any) {
    console.error('✗ Build failed:', error.stderr);
    throw new Error('Build failed');
  }
}

async function startService(): Promise<void> {
  console.log('Starting NanoClaw...');

  try {
    if (isMacOS) {
      // Check if plist exists first
      try {
        await execAsync('ls ~/Library/LaunchAgents/com.nanoclaw.plist');
      } catch {
        console.error('✗ NanoClaw service plist not found. Run setup first.');
        throw new Error('Service not configured');
      }

      await execAsync('launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist');
      console.log('✓ Service loaded (macOS)');
    } else {
      await execAsync('systemctl --user start nanoclaw');
      console.log('✓ Service started (Linux)');
    }
  } catch (error: any) {
    if (error.stderr?.includes('Failed to start')) {
      console.error('✗ Service failed to start:', error.stderr);
      console.log('Check logs: tail -f logs/nanoclaw.error.log');
      throw new Error('Service failed to start');
    }
    throw error;
  }
}

async function verify(): Promise<void> {
  console.log('Verifying service status...');

  try {
    let status: 'running' | 'stopped';
    if (isMacOS) {
      const { stdout } = await execAsync('launchctl list | grep nanoclaw');
      status = stdout.trim() ? 'running' : 'stopped';
    } else {
      const { stdout } = await execAsync('systemctl --user status nanoclaw');
      status = stdout.includes('active (running)') ? 'running' : 'stopped';
    }

    if (status === 'running') {
      console.log('✓ NanoClaw is running');
      console.log('  - Check logs: tail -f logs/nanoclaw.log');
      console.log('  - Test by sending a message in your registered chat');
    } else {
      console.log('✗ NanoClaw is not running');
      throw new Error('Service verification failed');
    }
  } catch (error: any) {
    console.log('✗ Verification failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('=== NanoClaw Start ===\n');

  try {
    // Check current status
    const currentStatus = await checkStatus();
    console.log(`Current status: ${currentStatus}\n`);

    // Always build
    await buildProject();

    // Start or restart service
    if (currentStatus === 'running') {
      console.log('Restarting NanoClaw...');
      if (isMacOS) {
        await execAsync('launchctl kickstart -k gui/$(id -u)/com.nanoclaw');
        console.log('✓ Service restarted (macOS)');
      } else {
        await execAsync('systemctl --user restart nanoclaw');
        console.log('✓ Service restarted (Linux)');
      }
    } else {
      await startService();
    }

    // Verify
    console.log('');
    await verify();

    console.log('\n✓ NanoClaw started successfully!');

  } catch (error: any) {
    console.error('\n✗ Failed to start NanoClaw:', error.message);
    process.exit(1);
  }
}

main();