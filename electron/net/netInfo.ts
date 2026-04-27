import * as os from 'node:os';
import * as https from 'node:https';

export interface NetworkInfo {
  lanIps: string[];
  wanIp: string | null;
  defaultPort: number;
}

const WAN_TIMEOUT_MS = 1500;
let wanCache: { value: string | null; at: number } | null = null;
const WAN_CACHE_TTL_MS = 5 * 60 * 1000;

function lanIps(): string[] {
  const ifaces = os.networkInterfaces();
  const out: string[] = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

function fetchWanIp(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org', { timeout: WAN_TIMEOUT_MS }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const trimmed = body.trim();
        resolve(/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed) ? trimmed : null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  let wanIp: string | null = null;
  if (wanCache && Date.now() - wanCache.at < WAN_CACHE_TTL_MS) {
    wanIp = wanCache.value;
  } else {
    wanIp = await fetchWanIp();
    wanCache = { value: wanIp, at: Date.now() };
  }
  return { lanIps: lanIps(), wanIp, defaultPort: 7777 };
}
