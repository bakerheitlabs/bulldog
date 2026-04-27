import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNetStore } from '@/multiplayer/netStore';
import { mpIpc } from '@/multiplayer/ipc';
import { tokens } from '@/ui/tokens';

type View = 'menu' | 'host-setup' | 'join-setup';

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: `1px solid ${tokens.color.borderStrong}`,
  borderRadius: tokens.radius.sm,
  color: tokens.color.text,
  fontFamily: tokens.font.mono,
  fontSize: 14,
  width: 280,
};

const buttonStyle: React.CSSProperties = {
  padding: '12px 24px',
  fontSize: 16,
  background: '#1f1f1f',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: 6,
  cursor: 'pointer',
  minWidth: 200,
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: tokens.color.accent,
  color: '#1a1a22',
  border: `1px solid ${tokens.color.accent}`,
  fontWeight: 700,
};

export default function MultiplayerRoute() {
  const navigate = useNavigate();
  const status = useNetStore((s) => s.status);
  const inGame = useNetStore((s) => s.inGame);
  const errorMessage = useNetStore((s) => s.errorMessage);
  const clearError = useNetStore((s) => s.clearError);
  const [view, setView] = useState<View>('menu');

  const inLobby = status === 'lobby-host' || status === 'lobby-client';
  const electronAvailable = mpIpc.isAvailable();

  // Once the host launches (or the client receives the launch event) drop
  // straight into the game route. The session lives in netStore, so navigating
  // away and back is safe.
  useEffect(() => {
    if (inGame) navigate('/game');
  }, [inGame, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 18,
        background: 'linear-gradient(180deg, #0c0c10 0%, #1a1a22 100%)',
        color: tokens.color.text,
        fontFamily: tokens.font.display,
      }}
    >
      {!electronAvailable && (
        <div
          style={{
            background: 'rgba(217,77,58,0.15)',
            border: `1px solid ${tokens.color.danger}`,
            borderRadius: tokens.radius.md,
            padding: '12px 18px',
            maxWidth: 480,
            color: tokens.color.text,
            fontSize: 13,
          }}
        >
          Multiplayer is only available in the desktop app. Run <code>npm run dev</code> or
          launch the built Electron app.
        </div>
      )}

      {!inLobby && view === 'menu' && (
        <>
          <div style={{ fontSize: 48, fontWeight: 800, color: tokens.color.accent, marginBottom: 16 }}>
            Multiplayer
          </div>
          <button
            style={electronAvailable ? buttonStyle : { ...buttonStyle, opacity: 0.4, cursor: 'not-allowed' }}
            disabled={!electronAvailable}
            onClick={() => { clearError(); setView('host-setup'); }}
          >
            Host Game
          </button>
          <button
            style={electronAvailable ? buttonStyle : { ...buttonStyle, opacity: 0.4, cursor: 'not-allowed' }}
            disabled={!electronAvailable}
            onClick={() => { clearError(); setView('join-setup'); }}
          >
            Join Game
          </button>
          <button style={{ ...buttonStyle, marginTop: 16 }} onClick={() => navigate('/menu')}>
            Back
          </button>
        </>
      )}

      {!inLobby && view === 'host-setup' && (
        <HostSetup onCancel={() => setView('menu')} />
      )}

      {!inLobby && view === 'join-setup' && (
        <JoinSetup onCancel={() => setView('menu')} />
      )}

      {inLobby && <Lobby />}

      {errorMessage && !inLobby && (
        <div
          style={{
            color: tokens.color.danger,
            fontSize: 13,
            marginTop: 8,
            maxWidth: 480,
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

function HostSetup({ onCancel }: { onCancel: () => void }) {
  const startHost = useNetStore((s) => s.startHost);
  const port = useNetStore((s) => s.port);
  const playerName = useNetStore((s) => s.playerName);
  const status = useNetStore((s) => s.status);
  const [portInput, setPortInput] = useState(String(port));
  const [nameInput, setNameInput] = useState(playerName);
  const [info, setInfo] = useState<{ lanIps: string[]; wanIp: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    mpIpc.getNetworkInfo().then((n) => {
      if (!cancelled) setInfo({ lanIps: n.lanIps, wanIp: n.wanIp });
    }).catch(() => {
      if (!cancelled) setInfo({ lanIps: [], wanIp: null });
    });
    return () => { cancelled = true; };
  }, []);

  const portNum = parseInt(portInput, 10);
  const canStart = Number.isFinite(portNum) && portNum > 0 && portNum < 65536 && nameInput.trim().length > 0 && status !== 'starting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 540 }}>
      <div style={{ fontSize: 32, fontWeight: 700 }}>Host Game</div>

      <div
        style={{
          width: 480,
          padding: 16,
          background: tokens.color.panel,
          border: `1px solid ${tokens.color.border}`,
          borderRadius: tokens.radius.md,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <SectionHeader>Network</SectionHeader>
        {info === null && <div style={{ fontSize: 13, color: tokens.color.textMuted }}>Detecting interfaces…</div>}
        {info && (
          <>
            {info.lanIps.length === 0 && (
              <div style={{ fontSize: 13, color: tokens.color.textMuted }}>No LAN interfaces found.</div>
            )}
            {info.lanIps.map((ip) => (
              <CopyRow key={ip} label="LAN" value={`${ip}:${portInput || port}`} />
            ))}
            <CopyRow
              label="WAN"
              value={info.wanIp ? `${info.wanIp}:${portInput || port}` : 'unavailable'}
              hint={info.wanIp ? 'Requires manual port forwarding on your router for internet play.' : undefined}
            />
          </>
        )}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>Port</span>
        <input
          style={inputStyle}
          value={portInput}
          inputMode="numeric"
          onChange={(e) => setPortInput(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>Your Name</span>
        <input
          style={inputStyle}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value.slice(0, 24))}
          maxLength={24}
        />
      </label>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button style={buttonStyle} onClick={onCancel} disabled={status === 'starting'}>
          Cancel
        </button>
        <button
          style={canStart ? primaryButtonStyle : { ...primaryButtonStyle, opacity: 0.5, cursor: 'not-allowed' }}
          disabled={!canStart}
          onClick={() => startHost(portNum, nameInput)}
        >
          {status === 'starting' ? 'Starting…' : 'Start Hosting'}
        </button>
      </div>
    </div>
  );
}

function JoinSetup({ onCancel }: { onCancel: () => void }) {
  const join = useNetStore((s) => s.join);
  const port = useNetStore((s) => s.port);
  const playerName = useNetStore((s) => s.playerName);
  const status = useNetStore((s) => s.status);
  const [host, setHost] = useState('127.0.0.1');
  const [portInput, setPortInput] = useState(String(port));
  const [nameInput, setNameInput] = useState(playerName);

  const portNum = parseInt(portInput, 10);
  const canJoin =
    host.trim().length > 0 &&
    Number.isFinite(portNum) &&
    portNum > 0 &&
    portNum < 65536 &&
    nameInput.trim().length > 0 &&
    status !== 'starting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 540 }}>
      <div style={{ fontSize: 32, fontWeight: 700 }}>Join Game</div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>Host Address</span>
        <input
          style={inputStyle}
          value={host}
          onChange={(e) => setHost(e.target.value.trim())}
          placeholder="192.168.1.42 or hostname"
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>Port</span>
        <input
          style={inputStyle}
          value={portInput}
          inputMode="numeric"
          onChange={(e) => setPortInput(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, color: tokens.color.textMuted }}>Your Name</span>
        <input
          style={inputStyle}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value.slice(0, 24))}
          maxLength={24}
        />
      </label>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button style={buttonStyle} onClick={onCancel} disabled={status === 'starting'}>
          Cancel
        </button>
        <button
          style={canJoin ? primaryButtonStyle : { ...primaryButtonStyle, opacity: 0.5, cursor: 'not-allowed' }}
          disabled={!canJoin}
          onClick={() => join(host.trim(), portNum, nameInput)}
        >
          {status === 'starting' ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

function Lobby() {
  const isHost = useNetStore((s) => s.isHost);
  const peers = useNetStore((s) => s.peers);
  const selfId = useNetStore((s) => s.selfId);
  const hostId = useNetStore((s) => s.hostId);
  const chatLog = useNetStore((s) => s.chatLog);
  const sendChat = useNetStore((s) => s.sendChat);
  const stopHost = useNetStore((s) => s.stopHost);
  const disconnect = useNetStore((s) => s.disconnect);
  const launchWorld = useNetStore((s) => s.launchWorld);

  const [draft, setDraft] = useState('');
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatLog]);

  const peerList = useMemo(() => Object.values(peers), [peers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 640 }}>
      <div style={{ fontSize: 28, fontWeight: 700, textAlign: 'center' }}>
        {isHost ? 'Host Lobby' : 'Connected'}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div
          style={{
            flex: '0 0 200px',
            background: tokens.color.panel,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.md,
            padding: 12,
          }}
        >
          <SectionHeader>Players ({peerList.length})</SectionHeader>
          {peerList.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '4px 0',
                color: p.id === selfId ? tokens.color.accent : tokens.color.text,
              }}
            >
              <span>{p.name}</span>
              <span style={{ fontSize: 10, color: tokens.color.textMuted }}>
                {p.id === hostId ? 'host' : ''}{p.id === selfId ? ' (you)' : ''}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: tokens.color.panel,
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.md,
            padding: 12,
            gap: 8,
            minHeight: 240,
          }}
        >
          <SectionHeader>Chat</SectionHeader>
          <div
            ref={chatRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              fontSize: 13,
              fontFamily: tokens.font.mono,
              minHeight: 180,
            }}
          >
            {chatLog.length === 0 && (
              <div style={{ color: tokens.color.textMuted, fontStyle: 'italic' }}>
                Chat is empty. Say hi.
              </div>
            )}
            {chatLog.map((c) => (
              <div key={c.id}>
                <span style={{ color: tokens.color.accent }}>{c.name}: </span>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              sendChat(draft);
              setDraft('');
            }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              style={{ ...inputStyle, flex: 1, width: 'auto' }}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              maxLength={240}
            />
            <button type="submit" style={buttonStyle}>Send</button>
          </form>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          style={buttonStyle}
          onClick={() => (isHost ? stopHost() : disconnect())}
        >
          {isHost ? 'Stop Hosting' : 'Disconnect'}
        </button>
        {isHost && (
          <button
            style={primaryButtonStyle}
            onClick={() => launchWorld()}
            title="Start the game world for everyone in the lobby."
          >
            Launch World
          </button>
        )}
        {!isHost && (
          <span style={{ alignSelf: 'center', color: tokens.color.textMuted, fontSize: 13 }}>
            Waiting for host to launch the world…
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        letterSpacing: 2.4,
        textTransform: 'uppercase',
        color: tokens.color.accent,
        fontFamily: tokens.font.mono,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: tokens.color.textMuted, width: 36 }}>{label}</span>
        <span
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 13,
            flex: 1,
            color: tokens.color.text,
          }}
        >
          {value}
        </span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              /* ignore */
            }
          }}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            background: copied ? tokens.color.accentDim : 'rgba(255,255,255,0.06)',
            border: `1px solid ${tokens.color.border}`,
            borderRadius: tokens.radius.sm,
            color: tokens.color.text,
            cursor: 'pointer',
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: tokens.color.textMuted, paddingLeft: 46 }}>{hint}</div>
      )}
    </div>
  );
}
