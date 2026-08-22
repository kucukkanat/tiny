/** The one channel every plugin problem goes through on its way to the console.
 * Deliberately module-level: problems are reported from places that have no host. */

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

/** Hear every problem as it is reported. Returns the unsubscribe. */
export const onPluginProblem = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Report one problem: to the console (`[plugin:<id>] <message>`), then to every subscriber. */
export const reportPluginProblem = (problem: PluginProblem): void => {
  const label = problem.pluginId === undefined ? "[plugin]" : `[plugin:${problem.pluginId}]`;
  if ("error" in problem) console.error(`${label} ${problem.message}`, problem.error);
  else console.error(`${label} ${problem.message}`);
  for (const listener of [...listeners]) {
    try {
      listener(problem);
    } catch (error) {
      console.error("[plugin] a problem listener itself failed", error);
    }
  }
};
