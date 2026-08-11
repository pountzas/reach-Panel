export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 17890;

export type PairingPayload = {
  hostId: string;
  ip: string;
  port: number;
  pairingToken: string;
  protocolVersion: number;
  pubkey: string;
  candidateIps?: string[];
};

export type StoredCredential = {
  hostId: string;
  deviceId: string;
  credential: string;
  lastIp: string;
  port: number;
  deviceName: string;
};

export type Envelope = {
  v: number;
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
};

export function parsePairingPayload(raw: string): PairingPayload {
  const data = JSON.parse(raw) as Partial<PairingPayload>;
  if (
    typeof data.hostId !== 'string' ||
    typeof data.ip !== 'string' ||
    typeof data.port !== 'number' ||
    typeof data.pairingToken !== 'string' ||
    typeof data.protocolVersion !== 'number'
  ) {
    throw new Error('Invalid pairing payload');
  }
  if (data.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${data.protocolVersion}`);
  }
  return {
    hostId: data.hostId,
    ip: data.ip,
    port: data.port,
    pairingToken: data.pairingToken,
    protocolVersion: data.protocolVersion,
    pubkey: typeof data.pubkey === 'string' ? data.pubkey : '',
    candidateIps: Array.isArray(data.candidateIps)
      ? data.candidateIps.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
}

let nextId = 1;

export function makeEnvelope(
  type: string,
  payload: Record<string, unknown> = {},
): Envelope {
  const id = `c-${nextId}`;
  nextId += 1;
  return { v: PROTOCOL_VERSION, id, type, payload };
}
