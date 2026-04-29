import { useEffect, useState } from 'react';

// Where the renderer fetches the latest-version manifest. Swap this for your
// real host (GitHub Pages, S3, raw.githubusercontent.com, etc.). The expected
// JSON shape is { "version": "X.Y.Z", "releaseUrl": "https://..." }.
const UPDATE_FEED_URL = 'https://example.com/bulldog/latest.json';

const SESSION_DISMISS_KEY = 'bulldog:update-banner-dismissed-version';

type Manifest = { version: string; releaseUrl: string };

function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

async function fetchManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch(UPDATE_FEED_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Manifest>;
    if (typeof data.version !== 'string' || typeof data.releaseUrl !== 'string') {
      return null;
    }
    if (!/^https?:\/\//i.test(data.releaseUrl)) return null;
    return { version: data.version, releaseUrl: data.releaseUrl };
  } catch {
    return null;
  }
}

export default function UpdateBanner() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() =>
    sessionStorage.getItem(SESSION_DISMISS_KEY),
  );

  useEffect(() => {
    let cancelled = false;
    fetchManifest().then((m) => {
      if (cancelled) return;
      if (m && compareVersions(m.version, __APP_VERSION__) > 0) {
        setManifest(m);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!manifest || dismissed === manifest.version) return null;

  const handleDownload = () => {
    if (window.bulldogMP?.openExternal) {
      void window.bulldogMP.openExternal(manifest.releaseUrl);
    } else {
      window.open(manifest.releaseUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_DISMISS_KEY, manifest.version);
    setDismissed(manifest.version);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(20, 25, 35, 0.92)',
        color: '#eee',
        border: '1px solid #3a4658',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 13,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 1000,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <span>
        Update available: <strong>{manifest.version}</strong>{' '}
        <span style={{ opacity: 0.6 }}>(you have {__APP_VERSION__})</span>
      </span>
      <button
        type="button"
        onClick={handleDownload}
        style={{
          background: '#4a7fb8',
          color: '#fff',
          border: 'none',
          padding: '4px 10px',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        Download
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          color: '#888',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          padding: 0,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
