/**
 * The one channel every plugin problem goes through on its way to the console.
 *
 * A problem is a defect a *developer* has to fix — a clash, a withheld
 * capability, a handler that threw — as opposed to an error the user acts on.
 * These used to be sixteen scattered `console.error` calls, which meant a tool
 * that silently never registered was findable only by someone with the console
 * open at the right moment. Reporting still ends at `console.error`, in the
 * same `[plugin:<id>]` format as always; what this adds is that the report is
 * observable — `PluginHost` shows each one as an error toast in development,
 * and a host or a test can subscribe.
 *
 * Deliberately module-level, like the console it fronts: problems are reported
 * from places that have no host — `loadPlugins` before any mount, an event bus
 * listener — so a per-host channel would silently miss exactly the reports
 * that matter most. Two hosts in one page both hear everything, which for a
 * diagnostic tap is correct.
 */

export type PluginProblem = {
  /** The plugin at fault, or `undefined` when the system itself is reporting. */
  readonly pluginId: string | undefined;
  /** One sentence, exactly as it appears on the console after the label. */
  readonly message: string;
  /** The thrown value, where a throw is what is being reported. */
  readonly error?: unknown;
};

type Listener = (problem: PluginProblem) => void;

const listeners = new Set<Listener>();

/**
 * Hear every problem as it is reported. Returns the unsubscribe.
 *
 * Listeners must not throw; one that does is reported to the console directly
 * rather than back through this channel, which would recurse.
 */
export const onPluginProblem = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/**
 * Report one problem: to the console, then to every subscriber.
 *
 * The console line keeps the format the reports have always had —
 * `[plugin:<id>] <message>` with the thrown value appended when there is one —
 * so nothing that greps logs, or asserts on them, notices this indirection.
 */
export const reportPluginProblem = (problem: PluginProblem): void => {
  const label = problem.pluginId === undefined ? "[plugin]" : `[plugin:${problem.pluginId}]`;
  if ("error" in problem) console.error(`${label} ${problem.message}`, problem.error);
  else console.error(`${label} ${problem.message}`);
  // A copy, so a listener that unsubscribes itself does not disturb dispatch.
  for (const listener of [...listeners]) {
    try {
      listener(problem);
    } catch (error) {
      console.error("[plugin] a problem listener itself failed", error);
    }
  }
};
