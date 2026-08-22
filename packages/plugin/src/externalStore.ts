import { useSyncExternalStore } from "react";

/** A value React can subscribe to from outside React. */
/** The read half of a store, so a plugin can hand components a value while keeping the writes to itself. */
export type ReadableStore<T> = {
  /** Registers a listener and returns the function that removes it. */
  subscribe(listener: () => void): () => void;
  get(): T;
};

export type ExternalStore<T> = ReadableStore<T> & {
  /** Replaces the value and notifies every listener. */
  set(next: T): void;
};

/** Reads a store from a component, re-rendering when it changes.
 * The third argument is required or the component throws when server-rendered. */
export const useStore = <T>(store: ReadableStore<T>): T =>
  useSyncExternalStore(store.subscribe, store.get, store.get);

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
