import { useState } from 'react';
import { useGameStore, hotelRoomActive } from '@/state/gameStore';
import { useNetStore } from '@/multiplayer/netStore';
import { HOTEL_TIERS, HOTEL_TIER_ORDER } from '@/game/world/buildings/hotelTiers';
import { formatDate } from '@/game/world/gameDate';
import type { HotelRoomTier } from '@/save/schema';

const MIN_DAYS = 1;
const MAX_DAYS = 7;

export default function HotelRentModal({ onClose }: { onClose: () => void }) {
  const money = useGameStore((s) => s.player.money);
  const room = useGameStore((s) => s.properties.hotelRoom);
  const isActive = useGameStore(hotelRoomActive);
  const rentHotelRoom = useGameStore((s) => s.rentHotelRoom);
  const inMpSession = useNetStore((s) => s.inGame);

  const [selected, setSelected] = useState<HotelRoomTier>(room?.roomId ?? 'standard');
  const [days, setDays] = useState(1);

  const def = HOTEL_TIERS[selected];
  const total = def.costPerDay * days;
  const canAfford = money >= total;

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
          minWidth: 520,
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
          <div style={{ fontSize: 22, fontWeight: 700 }}>Grand Hotel — Reception</div>
          <div style={{ color: '#f5cb5c', fontWeight: 700 }}>${money.toLocaleString()}</div>
        </div>

        {inMpSession ? (
          <div
            style={{
              padding: 18,
              background: '#1f1f25',
              borderRadius: 6,
              textAlign: 'center',
              opacity: 0.85,
            }}
          >
            Hotel rentals are single-player only for now. Your room won't sync between
            host and clients. Check back after multiplayer property support lands.
          </div>
        ) : (
          <>
            {isActive && room && (
              <div
                style={{
                  padding: 10,
                  background: '#1a2a1a',
                  border: '1px solid #2d4a2d',
                  borderRadius: 6,
                  marginBottom: 14,
                  fontSize: 13,
                }}
              >
                You currently have a {HOTEL_TIERS[room.roomId].name} (Floor{' '}
                {HOTEL_TIERS[room.roomId].floor}). Expires {formatDate(room.expires)}.
                Renting again will replace the current rental and add days from today.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {HOTEL_TIER_ORDER.map((id) => {
                const tier = HOTEL_TIERS[id];
                const sel = selected === id;
                return (
                  <div
                    key={id}
                    onClick={() => setSelected(id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      background: sel ? '#26303d' : '#1f1f25',
                      border: sel ? '1px solid #3a6df0' : '1px solid transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {tier.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· Floor {tier.floor}</span>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.6 }}>{tier.description}</div>
                    </div>
                    <div style={{ color: '#f5cb5c', fontWeight: 700 }}>
                      ${tier.costPerDay.toLocaleString()}/day
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ opacity: 0.7 }}>Days</span>
                <button
                  onClick={() => setDays((d) => Math.max(MIN_DAYS, d - 1))}
                  style={stepperBtnStyle}
                >
                  −
                </button>
                <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{days}</span>
                <button
                  onClick={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}
                  style={stepperBtnStyle}
                >
                  +
                </button>
              </div>
              <div style={{ fontSize: 14, opacity: 0.85 }}>
                Total: <strong style={{ color: canAfford ? '#f5cb5c' : '#c44' }}>${total.toLocaleString()}</strong>
              </div>
            </div>
          </>
        )}

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
            {inMpSession ? 'Close' : 'Cancel'}
          </button>
          {!inMpSession && (
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
                const res = rentHotelRoom(selected, days, def.costPerDay);
                if (res.ok) onClose();
              }}
            >
              {isActive ? 'Replace rental' : 'Check in'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const stepperBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  background: '#1f1f25',
  color: '#eee',
  border: '1px solid #333',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
};
