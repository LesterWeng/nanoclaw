#!/usr/bin/env node

/**
 * NanoClaw Stop Test
 * Tests the stop functionality
 */

import { execSync } from 'child_process';
import { platform } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLATFORM = platform();
const isMacOS = PLATFORM === 'darwin';
const isLinux = PLATFORM === 'linux';

console.log('=== NanoClaw Stop Test ===\n');

// Test 1: Check if script can be compiled
try {
  console.log('1. Testing TypeScript compilation...');
  execSync('npx tsc scripts/stop.ts --outDir test-dist --target es2020 --moduleResolution node --esModuleInterop --lib es2020 --noImplicitAny --noImplicitReturns --noUnusedLocals --strict', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe'
  });
  console.log('✓ TypeScript compilation successful');
} catch (error) {
  console.error('✗ TypeScript compilation failed:', error.message);
  process.exit(1);
}

// Test 2: Check if script can be executed
try {
  console.log('\n2. Testing script execution...');
  const result = execSync('npx tsx scripts/stop.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
    timeout: 5000
  });
  console.log('✓ Script execution test passed');
} catch (error) {
  // Expected to fail since service might not be running, but should parse correctly
  if (error.message.includes('NanoClaw is already stopped') ||
      error.message.includes('NanoClaw stop script only supports')) {
    console.log('✓ Script execution test passed (expected error)');
  } else {
    console.error('✗ Unexpected error during script execution:', error.message);
    process.exit(1);
  }
}

// Test 3: Validate manifest structure
try {
  console.log('\n3. Testing manifest validation...');

  const manifestContent = fs.readFileSync(path.resolve(__dirname, '..', 'manifest.yaml'), 'utf8');

  // Basic validation - check if it contains required fields
  if (!manifestContent.includes('skill:') || !manifestContent.includes('stop')) {
    throw new Error('Invalid skill name in manifest');
  }

  if (!manifestContent.includes('version:') || !manifestContent.includes('description:')) {
    throw new Error('Missing required fields in manifest');
  }

  console.log('✓ Manifest validation passed');
} catch (error) {
  console.error('✗ Manifest validation failed:', error.message);
  process.exit(1);
}

console.log('\n✓ All tests passed!');

// Cleanup
try {
  execSync('rm -rf test-dist', { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' });
} catch {
  // Ignore cleanup errors
}