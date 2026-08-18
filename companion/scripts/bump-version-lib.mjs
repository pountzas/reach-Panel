import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

export function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function bumpVersion(current, type) {
  const v = parseVersion(current);
  if (type === 'major') {
    return formatVersion({ major: v.major + 1, minor: 0, patch: 0 });
  }
  if (type === 'minor') {
    return formatVersion({ major: v.major, minor: v.minor + 1, patch: 0 });
  }
  return formatVersion({ major: v.major, minor: v.minor, patch: v.patch + 1 });
}

export function androidVersionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (minor > 99 || patch > 99) {
    throw new Error(
      `Android versionCode encoding requires minor and patch in 0..99 (got ${version})`,
    );
  }
  return major * 10000 + minor * 100 + patch;
}

export function readCurrentVersion(companionRoot) {
  const versioningPath = join(companionRoot, 'src/versioning.cjs');
  const source = readFileSync(versioningPath, 'utf8');
  const versionMatch = /const VERSION = '([^']+)'/.exec(source);
  if (!versionMatch) {
    throw new Error('Could not parse VERSION from src/versioning.cjs');
  }
  return { version: versionMatch[1], versioningPath };
}

export function writeVersion(companionRoot, version) {
  const { versioningPath } = readCurrentVersion(companionRoot);
  let source = readFileSync(versioningPath, 'utf8');
  source = source.replace(
    /const VERSION = '[^']+'/,
    `const VERSION = '${version}'`,
  );
  writeFileSync(versioningPath, source);

  const packageJsonPath = join(companionRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  pkg.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

export function resolveBumpType(messages) {
  let bump = null;

  for (const message of messages) {
    const subject = message.split('\n')[0];
    const breaking =
      /^(\w+)(\(.+\))?!:/.test(subject) ||
      subject.startsWith('BREAKING:') ||
      /^BREAKING CHANGE:/m.test(message);

    if (breaking) {
      return 'major';
    }

    const match = /^(\w+)(?:\(.+\))?!?:/.exec(subject);
    if (!match) {
      continue;
    }

    const type = match[1];
    if (type === 'feat' || type === 'release') {
      bump = bump === 'major' ? 'major' : 'minor';
    } else if (type === 'fix') {
      if (bump !== 'minor' && bump !== 'major') {
        bump = 'patch';
      }
    }
  }

  return bump;
}
