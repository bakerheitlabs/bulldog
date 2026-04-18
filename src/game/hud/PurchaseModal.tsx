import { useGameStore } from '@/state/gameStore';
import { WEAPONS, WEAPON_ORDER } from '@/game/weapons/weapons';

export default function PurchaseModal({ onClose }: { onClose: () => void }) {
  const money = useGameStore((s) => s.player.money);
  const owned = useGameStore((s) => s.inventory.weapons);
  const addWeapon = useGameStore((s) => s.addWeapon);
  const addMoney = useGameStore((s) => s.addMoney);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#15151a',
          border: '1px solid #333',
          borderRadius: 8,
          padding: 24,
          minWidth: 420,
          color: '#eee',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Bulldog Firearms</div>
          <div style={{ color: '#f5cb5c', fontWeight: 700 }}>${money.toLocaleString()}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WEAPON_ORDER.map((id) => {
            const def = WEAPONS[id];
            const isOwned = owned.includes(id);
            const canAfford = money >= def.price;
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#1f1f25',
                  borderRadius: 6,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{def.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    dmg {def.damage} · {def.projectileCount > 1 ? `${def.projectileCount} pellets` : 'single shot'} · mag {def.magazine}
                  </div>
                </div>
                {isOwned ? (
                  <div style={{ opacity: 0.6 }}>Owned</div>
                ) : (
                  <button
                    style={{
                      padding: '6px 14px',
                      background: canAfford ? '#3a6df0' : '#333',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canAfford}
                    onClick={() => {
                      addMoney(-def.price);
                      addWeapon(id);
                    }}
                  >
                    Buy ${def.price}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 18, textAlign: 'right' }}>
          <button
            style={{
              padding: '6px 14px',
              background: '#1f1f25',
              color: '#eee',
              border: '1px solid #333',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
