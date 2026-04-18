import type { SaveData, SaveSlotMeta } from './schema';

const SLOT_INDEX_KEY = 'bulldog.saves';
const slotKey = (id: string) => `bulldog.save.${id}`;

export function listSlots(): SaveSlotMeta[] {
  try {
    const raw = localStorage.getItem(SLOT_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaveSlotMeta[]) : [];
  } catch {
    return [];
  }
}

function writeSlots(slots: SaveSlotMeta[]) {
  localStorage.setItem(SLOT_INDEX_KEY, JSON.stringify(slots));
}

export function readSlot(id: string): SaveData | null {
  const raw = localStorage.getItem(slotKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function writeSlot(id: string, name: string, data: SaveData) {
  localStorage.setItem(slotKey(id), JSON.stringify(data));
  const slots = listSlots();
  const meta: SaveSlotMeta = {
    id,
    name,
    savedAt: data.savedAt,
    playtimeMs: data.game.meta.playtimeMs,
  };
  const idx = slots.findIndex((s) => s.id === id);
  if (idx >= 0) slots[idx] = meta;
  else slots.push(meta);
  writeSlots(slots);
}

export function deleteSlot(id: string) {
  localStorage.removeItem(slotKey(id));
  writeSlots(listSlots().filter((s) => s.id !== id));
}
