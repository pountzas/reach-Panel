#!/usr/bin/env node
/**
 * Bump companion version from conventional commits since the last companion-v* tag.
 * Usage:
 *   node companion/scripts/bump-version.mjs          # bump if needed, write files
 *   node companion/scripts/bump-version.mjs --check  # always exit 0; sets should_release
 */
import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  androidVersionCode,
  bumpVersion,
  readCurrentVersion,
  resolveBumpType,
  writeVersion,
} from './bump-version-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const companionRoot = join(__dirname, '..');
const repoRoot = join(__dirname, '../..');
const checkOnly = process.argv.includes('--check');

function runGit(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function getCommitsSinceLastTag() {
  let range = 'HEAD';
  try {
    const lastTag = runGit("git describe --tags --match 'companion-v*' --abbrev=0");
    range = `${lastTag}..HEAD`;
  } catch {
    // no companion-v* tags yet
  }

  try {
    const raw = runGit(
      `git log ${range} --pretty=format:%B%x1e -- companion/`,
    );
    return raw
      .split('\x1e')
      .map((message) => message.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const { version } = readCurrentVersion(companionRoot);
  const messages = getCommitsSinceLastTag();
  const bumpType = resolveBumpType(messages);

  if (!bumpType) {
    console.log('No version bump needed (no feat/fix/release/BREAKING commits since last tag).');
    setOutput('should_release', 'false');
    setOutput('current_version', version);
    process.exit(0);
  }

  const newVersion = bumpVersion(version, bumpType);
  const newVersionCode = androidVersionCode(newVersion);

  console.log(`Bump ${bumpType}: ${version} → ${newVersion} (versionCode ${newVersionCode})`);
  setOutput('should_release', 'true');
  setOutput('new_version', newVersion);

  if (checkOnly) {
    process.exit(0);
  }

  writeVersion(companionRoot, newVersion);
}

main();
