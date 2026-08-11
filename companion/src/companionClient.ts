import {
  makeEnvelope,
  type Envelope,
  type PairingPayload,
  type StoredCredential,
} from './protocol';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting';

type StatusListener = (status: ConnectionStatus, detail?: string) => void;
type MessageListener = (env: Envelope) => void;

const PING_INTERVAL_MS = 5000;
const BASE_BACKOFF_MS = 800;
const MAX_BACKOFF_MS = 12_000;

export class CompanionClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private statusListeners = new Set<StatusListener>();
  private messageListeners = new Set<MessageListener>();
  private pending = new Map<
    string,
    { resolve: (env: Envelope) => void; reject: (err: Error) => void }
  >();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = BASE_BACKOFF_MS;
  private intentionalClose = false;
  private credential: StoredCredential | null = null;
  private pairing: PairingPayload | null = null;
  private deviceName: string;

  constructor(deviceName = 'ReachPanel Tablet') {
    this.deviceName = deviceName;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getCredential(): StoredCredential | null {
    return this.credential;
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  async pair(payload: PairingPayload): Promise<StoredCredential> {
    this.pairing = payload;
    this.credential = null;
    await this.openSocket(payload.ip, payload.port);
    await this.hello();
    const auth = await this.request(
      makeEnvelope('auth', {
        pairingToken: payload.pairingToken,
        deviceName: this.deviceName,
      }),
    );
    if (auth.type === 'auth.err') {
      const message =
        typeof auth.payload?.message === 'string'
          ? auth.payload.message
          : 'Pairing failed';
      throw new Error(message);
    }
    const deviceId = String(auth.payload?.deviceId ?? '');
    const credential = String(auth.payload?.credential ?? '');
    if (!deviceId || !credential) {
      throw new Error('Host did not return device credentials');
    }
    const stored: StoredCredential = {
      hostId: payload.hostId,
      deviceId,
      credential,
      lastIp: payload.ip,
      port: payload.port,
      deviceName: this.deviceName,
    };
    this.credential = stored;
    this.pairing = null;
    this.backoffMs = BASE_BACKOFF_MS;
    this.setStatus('connected');
    this.startPing();
    return stored;
  }

  async connectWithCredential(cred: StoredCredential): Promise<void> {
    this.credential = cred;
    this.intentionalClose = false;
    await this.openSocket(cred.lastIp, cred.port);
    await this.hello();
    const auth = await this.request(
      makeEnvelope('auth', {
        deviceId: cred.deviceId,
        credential: cred.credential,
        deviceName: cred.deviceName || this.deviceName,
      }),
    );
    if (auth.type === 'auth.err') {
      const message =
        typeof auth.payload?.message === 'string'
          ? auth.payload.message
          : 'Auth failed';
      throw new Error(message);
    }
    this.backoffMs = BASE_BACKOFF_MS;
    this.setStatus('connected');
    this.startPing();
  }

  async send(type: string, payload: Record<string, unknown> = {}): Promise<Envelope> {
    return this.request(makeEnvelope(type, payload));
  }

  /** Fire-and-forget for high-frequency trackpad moves. */
  sendFireAndForget(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const env = makeEnvelope(type, payload);
    this.ws.send(JSON.stringify(env));
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnect();
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  private async openSocket(ip: string, port: number): Promise<void> {
    this.clearReconnect();
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    const url = `ws://${ip}:${port}`;
    this.setStatus(
      this.credential && !this.pairing ? 'reconnecting' : 'connecting',
    );

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;

      ws.onopen = () => {
        settled = true;
        this.ws = ws;
        this.setStatus('authenticating');
        resolve();
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to connect to ${url}`));
        }
      };

      ws.onclose = () => {
        this.ws = null;
        this.stopPing();
        this.rejectAllPending(new Error('Connection closed'));
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      };

      ws.onmessage = (event) => {
        this.handleMessage(String(event.data));
      };
    });
  }

  private async hello(): Promise<void> {
    const reply = await this.request(
      makeEnvelope('hello', { deviceName: this.deviceName }),
    );
    if (reply.type !== 'hello.ok') {
      throw new Error('Unexpected hello response');
    }
  }

  private request(env: Envelope): Promise<Envelope> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      if (!env.id) {
        reject(new Error('Request requires id'));
        return;
      }
      this.pending.set(env.id, { resolve, reject });
      this.ws.send(JSON.stringify(env));
      setTimeout(() => {
        if (this.pending.delete(env.id!)) {
          reject(new Error(`Timeout waiting for ${env.type}`));
        }
      }, 10_000);
    });
  }

  private handleMessage(raw: string): void {
    let env: Envelope;
    try {
      env = JSON.parse(raw) as Envelope;
    } catch {
      return;
    }
    if (env.id && this.pending.has(env.id)) {
      const pending = this.pending.get(env.id);
      this.pending.delete(env.id);
      pending?.resolve(env);
    }
    for (const listener of this.messageListeners) {
      listener(env);
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      void this.send('ping', { t: Date.now() }).catch(() => {
        /* reconnect path handles failures */
      });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.credential) {
      this.setStatus('disconnected');
      return;
    }
    this.setStatus('reconnecting', `Retrying in ${Math.round(this.backoffMs / 1000)}s`);
    this.clearReconnect();
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      const cred = this.credential;
      if (!cred) {
        return;
      }
      void this.connectWithCredential(cred).catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(err);
    }
    this.pending.clear();
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }
}
