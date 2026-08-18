export const VERSION = '0.1.0';

export function androidVersionCode(version: string): number {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (minor > 99 || patch > 99) {
    throw new Error(`minor and patch must be <= 99: ${version}`);
  }

  return major * 10000 + minor * 100 + patch;
}
