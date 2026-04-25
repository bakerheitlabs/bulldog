// Module-level interaction state. The HUD reads this via subscription so the
// player can see context-sensitive prompts (e.g. "Press E to shop").

type Listener = () => void;

export type InteractionPrompt = {
  id: string;
  label: string;
  onActivate: () => void;
};

let prompt: InteractionPrompt | null = null;
const listeners = new Set<Listener>();

export function setPrompt(p: InteractionPrompt | null) {
  // Visible state (id + label) drives HUD re-renders, but onActivate is a
  // fresh closure each frame from the producer (e.g. useVehicleInteraction
  // captures the *currently nearest* vehicle's id). Always store the latest
  // object so `activate()` calls the right target; only notify listeners
  // when what they display actually changed.
  const sameVisible = prompt?.id === p?.id && prompt?.label === p?.label;
  prompt = p;
  if (!sameVisible) listeners.forEach((l) => l());
}

export function clearPrompt(id: string) {
  if (prompt?.id === id) {
    prompt = null;
    listeners.forEach((l) => l());
  }
}

export function getPrompt(): InteractionPrompt | null {
  return prompt;
}

export function subscribePrompt(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function activate() {
  prompt?.onActivate();
}
