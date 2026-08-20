/**
 * A value React can subscribe to from outside React.
 *
 * Plugin state cannot live in component state: a command handler, a shortcut and
 * a contributed component are three call sites that need the same switch, and
 * only the last of them is a component. So the value lives in the plugin's
 * closure and components read it with `useSyncExternalStore`.
 *
 * ```ts
 * const open = createExternalStore(false);
 *
 * function Overlay() {
 *   const shown = useSyncExternalStore(open.subscribe, open.get, open.get);
 *   return shown ? <Dialog onClose={() => open.set(false)} /> : null;
 * }
 *
 * tiny.registerCommand("settings", { handler: () => open.set(true) });
 * tiny.contribute("app.overlays", Overlay);
 * ```
 */
export type ExternalStore<T> = {
  /** Registers a listener and returns the function that removes it. */
  subscribe(listener: () => void): () => void;
  get(): T;
  /** Replaces the value and notifies every listener. */
  set(next: T): void;
};

export const createExternalStore = <T>(initial: T): ExternalStore<T> => {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get: () => current,
    set: (next) => {
      current = next;
      for (const listener of listeners) listener();
    },
  };
};
