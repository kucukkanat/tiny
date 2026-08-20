/**
 * `pi.events` — the shared bus plugins talk to each other over.
 *
 * Deliberately not the lifecycle events of `pi.on`: those are the host's, with
 * fixed names and payloads, while this is an open namespace plugins own. Kept
 * separate for the same reason pi keeps them separate — a plugin emitting
 * `message_end` should not be able to fool another plugin's handler.
 */
export type PluginEvents = {
  on(event: string, listener: (data: unknown) => void): () => void;
  once(event: string, listener: (data: unknown) => void): () => void;
  off(event: string, listener: (data: unknown) => void): void;
  emit(event: string, data?: unknown): void;
};

export const createEvents = (): PluginEvents => {
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  const off: PluginEvents["off"] = (event, listener) => {
    const registered = listeners.get(event);
    if (registered === undefined) return;
    registered.delete(listener);
    if (registered.size === 0) listeners.delete(event);
  };

  const on: PluginEvents["on"] = (event, listener) => {
    const registered = listeners.get(event) ?? new Set();
    registered.add(listener);
    listeners.set(event, registered);
    return () => off(event, listener);
  };

  return {
    on,
    off,
    once: (event, listener) => {
      const wrapped = (data: unknown) => {
        off(event, wrapped);
        listener(data);
      };
      return on(event, wrapped);
    },
    emit: (event, data) => {
      // Iterate a copy: a listener that unsubscribes itself, or subscribes
      // another, must not disturb this dispatch.
      for (const listener of [...(listeners.get(event) ?? [])]) {
        try {
          listener(data);
        } catch (error) {
          // One plugin's bad listener must not break the emitter's turn.
          console.error(`[plugin] listener for "${event}" failed`, error);
        }
      }
    },
  };
};
