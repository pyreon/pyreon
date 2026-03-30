import { signal } from "@pyreon/reactivity";

export interface UseToggleResult {
  value: () => boolean;
  toggle: () => void;
  setTrue: () => void;
  setFalse: () => void;
}

/**
 * Simple boolean toggle.
 */
export function useToggle(initial = false): UseToggleResult {
  const value = signal(initial);

  return {
    value,
    toggle: () => value.update((v) => !v),
    setTrue: () => value.set(true),
    setFalse: () => value.set(false),
  };
}
