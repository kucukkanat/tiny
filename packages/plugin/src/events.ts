/**
 * `tiny.events` — the shared bus plugins talk to each other over.
 *
 * Deliberately not the lifecycle events of `tiny.on`: those are the host's, with
 * fixed names and payloads, while this is an open namespace plugins own. Kept
 * separate for the same reason pi keeps them separate — a plugin emitting
 * `message_end` should not be able to fool another plugin's handler.
 */

/** Carries a channel's payload type without existing at runtime. */
declare const payload: unique symbol;

/**
 * A named conversation between plugins, with a payload type attached.
 *
 * The bus is the only place plugins compose with *each other* rather than with
 * the host — and it was the one part of the SDK with no types at all: bare
 * string names and `unknown` data, so the publisher and the subscriber agreed by
 * hope. A channel is that agreement written down once, in a value the publisher
 * exports and the subscriber imports:
 *
 * ```ts
 * // in the publisher's package, exported
 * export const decided = defineChannel<{ tool: string; approved: boolean }>(
 *   "hitl.approval.decided",
 * );
 *
 * // in the publisher
 * tiny.events.emit(decided, { tool: "fs_write", approved: true });
 *
 * // in a subscriber, which imports the channel and nothing else
 * tiny.events.on(decided, (event) => log(event.tool));  // `event` is typed
 * ```
 *
 * The import is types-only in effect: a subscriber whose publisher is not
 * installed simply never hears anything, which is what loose coupling at
 * runtime and tight coupling at the type level should both look like.
 */
export type Channel<T> = {
  readonly name: string;
  /** Never present. Its only job is to make `T` inferable from the channel. */
  readonly [payload]?: T;
};

/**
 * Declares a channel.
 *
 * Namespace the name with your plugin's id — the bus is one flat namespace, so
 * `notes.changed` is a claim on a name that every other plugin can also make.
 */
export const defineChannel = <T>(name: string): Channel<T> => ({ name });

/** What a listener is given, for a channel or for a bare name. */
type Listener<T> = (data: T) => void;

export type PluginEvents = {
  on<T>(channel: Channel<T>, listener: Listener<T>): () => void;
  on(event: string, listener: Listener<unknown>): () => void;
  once<T>(channel: Channel<T>, listener: Listener<T>): () => void;
  once(event: string, listener: Listener<unknown>): () => void;
  off<T>(channel: Channel<T>, listener: Listener<T>): void;
  off(event: string, listener: Listener<unknown>): void;
  emit<T>(channel: Channel<T>, data: T): void;
  emit(event: string, data?: unknown): void;
};

/** A channel and its name are the same address; this is which one was passed. */
const nameOf = (event: string | Channel<unknown>): string =>
  typeof event === "string" ? event : event.name;

export const createEvents = (): PluginEvents => {
  const listeners = new Map<string, Set<Listener<never>>>();

  const off = (event: string | Channel<never>, listener: Listener<never>) => {
    const name = nameOf(event);
    const registered = listeners.get(name);
    if (registered === undefined) return;
    registered.delete(listener);
    if (registered.size === 0) listeners.delete(name);
  };

  const on = (event: string | Channel<never>, listener: Listener<never>) => {
    const name = nameOf(event);
    const registered = listeners.get(name) ?? new Set<Listener<never>>();
    registered.add(listener);
    listeners.set(name, registered);
    return () => off(name, listener);
  };

  const once = (event: string | Channel<never>, listener: Listener<never>) => {
    const wrapped = ((data: never) => {
      off(event, wrapped);
      listener(data);
    }) as Listener<never>;
    return on(event, wrapped);
  };

  const emit = (event: string | Channel<never>, data?: never) => {
    // Iterate a copy: a listener that unsubscribes itself, or subscribes
    // another, must not disturb this dispatch.
    for (const listener of [...(listeners.get(nameOf(event)) ?? [])]) {
      try {
        listener(data as never);
      } catch (error) {
        // One plugin's bad listener must not break the emitter's turn.
        console.error(`[plugin] listener for "${nameOf(event)}" failed`, error);
      }
    }
  };

  // Asserted once, here: the overloads above are what callers see, and no single
  // implementation signature can satisfy both halves of each pair.
  return { on, once, off, emit } as PluginEvents;
};
