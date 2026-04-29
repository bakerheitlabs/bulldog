import { useGameStore } from '@/state/gameStore';
import { WEAPONS } from '@/game/weapons/weapons';
import type { WeaponId } from '@/save/schema';

const DEPOSIT_AMOUNTS = [100, 500, 1000];

export default function StashModal({ onClose }: { onClose: () => void }) {
  const room = useGameStore((s) => s.properties.hotelRoom);
  const playerWeapons = useGameStore((s) => s.inventory.weapons);
  const playerMoney = useGameStore((s) => s.player.money);
  const setHotelStash = useGameStore((s) => s.setHotelStash);
  const addMoney = useGameStore((s) => s.addMoney);

  if (!room) {
    // The wardrobe interaction is gated by hotelRoomActive() in HotelSuite,
    // but render a fallback in case the modal opens during a race.
    return null;
  }

  const stash = room.stash;

  const depositWeapon = (id: WeaponId) => {
    // Read latest state inside the updater so rapid double-clicks can't
    // double-deposit using a stale closure snapshot.
    useGameStore.setState((s) => {
      const curRoom = s.properties.hotelRoom;
      if (!curRoom) return {};
      if (curRoom.stash.weapons.includes(id)) return {};
      if (!s.inventory.weapons.includes(id)) return {};
      const nextWeapons = s.inventory.weapons.filter((w) => w !== id);
      const nextEquipped =
        s.inventory.equipped === id ? nextWeapons[0] ?? null : s.inventory.equipped;
      const nextAmmo = { ...s.inventory.ammo };
      delete nextAmmo[id];
      return {
        inventory: { weapons: nextWeapons, equipped: nextEquipped, ammo: nextAmmo },
        properties: {
          hotelRoom: {
            ...curRoom,
            stash: { ...curRoom.stash, weapons: [...curRoom.stash.weapons, id] },
          },
        },
      };
    });
  };

  const withdrawWeapon = (id: WeaponId) => {
    useGameStore.setState((s) => {
      const curRoom = s.properties.hotelRoom;
      if (!curRoom) return {};
      if (!curRoom.stash.weapons.includes(id)) return {};
      if (s.inventory.weapons.includes(id)) return {};
      const def = WEAPONS[id];
      const nextWeapons = [...s.inventory.weapons, id];
      const nextAmmo = {
        ...s.inventory.ammo,
        [id]: s.inventory.ammo[id] ?? { magazine: def.magazine, reserve: def.magazine * 2 },
      };
      return {
        inventory: {
          weapons: nextWeapons,
          equipped: s.inventory.equipped ?? id,
          ammo: nextAmmo,
        },
        properties: {
          hotelRoom: {
            ...curRoom,
            stash: {
              ...curRoom.stash,
              weapons: curRoom.stash.weapons.filter((w) => w !== id),
            },
          },
        },
      };
    });
  };

  const depositCash = (amount: number) => {
    const take = Math.min(amount, playerMoney);
    if (take <= 0) return;
    addMoney(-take);
    setHotelStash({ weapons: stash.weapons, cash: stash.cash + take });
  };

  const withdrawCash = (amount: number) => {
    const take = Math.min(amount, stash.cash);
    if (take <= 0) return;
    addMoney(take);
    setHotelStash({ weapons: stash.weapons, cash: stash.cash - take });
  };

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
          minWidth: 600,
          color: '#eee',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700 }}>Wardrobe — Personal Stash</div>
          <div style={{ color: '#f5cb5c', fontWeight: 700 }}>${playerMoney.toLocaleString()}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Column title="On you">
            <Section heading="Weapons">
              {playerWeapons.length === 0 ? (
                <Muted>No weapons.</Muted>
              ) : (
                playerWeapons.map((id) => (
                  <Row key={id}>
                    <span>{WEAPONS[id].name}</span>
                    <button style={btnStyle} onClick={() => depositWeapon(id)}>
                      Stash →
                    </button>
                  </Row>
                ))
              )}
            </Section>
            <Section heading="Cash on hand">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DEPOSIT_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    style={{ ...btnStyle, opacity: playerMoney >= amt ? 1 : 0.4 }}
                    disabled={playerMoney < amt}
                    onClick={() => depositCash(amt)}
                  >
                    Stash ${amt}
                  </button>
                ))}
              </div>
            </Section>
          </Column>

          <Column title={`Stash · $${stash.cash.toLocaleString()}`}>
            <Section heading="Weapons">
              {stash.weapons.length === 0 ? (
                <Muted>Empty.</Muted>
              ) : (
                stash.weapons.map((id) => (
                  <Row key={id}>
                    <span>{WEAPONS[id].name}</span>
                    <button style={btnStyle} onClick={() => withdrawWeapon(id)}>
                      ← Take
                    </button>
                  </Row>
                ))
              )}
            </Section>
            <Section heading="Cash">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DEPOSIT_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    style={{ ...btnStyle, opacity: stash.cash >= amt ? 1 : 0.4 }}
                    disabled={stash.cash < amt}
                    onClick={() => withdrawCash(amt)}
                  >
                    Take ${amt}
                  </button>
                ))}
              </div>
            </Section>
          </Column>
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

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#1a1a20', borderRadius: 6, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>{heading}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 8px',
        background: '#1f1f25',
        borderRadius: 4,
      }}
    >
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, opacity: 0.5, padding: '4px 0' }}>{children}</div>;
}

const btnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#3a6df0',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};
