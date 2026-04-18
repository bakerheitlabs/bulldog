import { create } from 'zustand';
import { deserialize } from '@/save/deserialize';
import { serialize } from '@/save/serialize';
import type { SaveSlotMeta } from '@/save/schema';
import { deleteSlot, listSlots, readSlot, writeSlot } from '@/save/storage';

type SaveStore = {
  slots: SaveSlotMeta[];
  activeSlotId: string | null;
  refresh: () => void;
  save: (id: string, name?: string) => void;
  load: (id: string) => boolean;
  remove: (id: string) => void;
};

export const useSaveStore = create<SaveStore>((set, get) => ({
  slots: listSlots(),
  activeSlotId: null,
  refresh: () => set({ slots: listSlots() }),
  save: (id, name) => {
    const data = serialize();
    writeSlot(id, name ?? id, data);
    set({ slots: listSlots(), activeSlotId: id });
  },
  load: (id) => {
    const raw = readSlot(id);
    if (!raw) return false;
    deserialize(raw);
    set({ activeSlotId: id });
    return true;
  },
  remove: (id) => {
    deleteSlot(id);
    const next = listSlots();
    set({
      slots: next,
      activeSlotId: get().activeSlotId === id ? null : get().activeSlotId,
    });
  },
}));
