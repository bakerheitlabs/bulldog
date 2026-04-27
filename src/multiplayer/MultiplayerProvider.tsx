import { useMemo } from 'react';
import { useNetStore } from './netStore';
import RemotePlayer from './RemotePlayer';
import RemoteNpcs from './RemoteNpcs';

// Mounted inside <Game/>'s SceneContent. When in a multiplayer session,
// renders a RemotePlayer for every peer except self. The pose data flows
// through remotePlayersStore (updated by hostLoop / clientLoop), not through
// React state — so this component only re-renders when the peer list itself
// changes.

export default function MultiplayerProvider() {
  const inGame = useNetStore((s) => s.inGame);
  const peers = useNetStore((s) => s.peers);
  const selfId = useNetStore((s) => s.selfId);

  const remotes = useMemo(() => {
    if (!inGame) return [];
    return Object.values(peers).filter((p) => p.id !== selfId);
  }, [inGame, peers, selfId]);

  const isHost = useNetStore((s) => s.isHost);

  if (!inGame) return null;

  return (
    <>
      {remotes.map((p) => (
        <RemotePlayer key={p.id} peerId={p.id} name={p.name} />
      ))}
      {/* Clients render NPCs from host snapshots; the host runs Spawner
          locally (npcsEnabled in Game.tsx), so it doesn't render RemoteNpcs. */}
      {!isHost && <RemoteNpcs />}
    </>
  );
}
