#!/usr/bin/env node

/**
 * NanoClaw Stop Script
 * Stops NanoClaw service with platform-specific commands
 */

import { exec } from 'child_process';
import { platform } from 'os';

// Define platform-specific commands
const PLATFORM = platform();
const isMacOS = PLATFORM === 'darwin';
const isLinux = PLATFORM === 'linux';

if (!isMacOS && !isLinux) {
  console.error('Error: NanoClaw stop script only supports macOS and Linux');
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

async function stopService(): Promise<void> {
  console.log('Stopping NanoClaw...');

  try {
    if (isMacOS) {
      await execAsync('launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist');
      console.log('✓ Service unloaded (macOS)');
    } else {
      await execAsync('systemctl --user stop nanoclaw');
      console.log('✓ Service stopped (Linux)');
    }
  } catch (error: any) {
    // If service is already stopped, that's fine
    if (
      (isMacOS && error.stderr?.includes('no such service')) ||
      (isLinux && error.stderr?.includes('could not be found'))
    ) {
      console.log('✓ NanoClaw is already stopped');
      return;
    }

    // For other errors, try force stop
    if (isMacOS) {
      try {
        await execAsync('launchctl stop com.nanoclaw');
        console.log('✓ Service force stopped (macOS)');
      } catch {
        throw new Error('Failed to stop service');
      }
    } else {
      try {
        await execAsync('systemctl --user kill nanoclaw');
        console.log('✓ Service force killed (Linux)');
      } catch {
        throw new Error('Failed to stop service');
      }
    }
  }
}

async function verify(): Promise<void> {
  console.log('Verifying service is stopped...');

  try {
    let status: 'running' | 'stopped';
    if (isMacOS) {
      const { stdout } = await execAsync('launchctl list | grep nanoclaw');
      status = stdout.trim() ? 'running' : 'stopped';
    } else {
      const { stdout } = await execAsync('systemctl --user status nanoclaw');
      status = stdout.includes('active (running)') ? 'running' : 'stopped';
    }

    if (status === 'stopped') {
      console.log('✓ NanoClaw is stopped');
    } else {
      console.log('✗ NanoClaw is still running');
      throw new Error('Service still running');
    }
  } catch (error: any) {
    // If error is "no such service", that means it's stopped
    if (
      (isMacOS && error.stderr?.includes('no such service')) ||
      (isLinux && error.stderr?.includes('could not be found'))
    ) {
      console.log('✓ NanoClaw is stopped');
      return;
    }
    throw error;
  }
}

async function main() {
  console.log('=== NanoClaw Stop ===\n');

  try {
    // Check current status
    const currentStatus = await checkStatus();
    console.log(`Current status: ${currentStatus}\n`);

    if (currentStatus === 'stopped') {
      console.log('NanoClaw is already stopped.');
    } else {
      await stopService();
      console.log('');
      await verify();
    }

    console.log('\n✓ NanoClaw stopped successfully');

  } catch (error: any) {
    console.error('\n✗ Failed to stop NanoClaw:', error.message);
    process.exit(1);
  }
}

main();