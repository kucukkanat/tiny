import type { Plugin } from "@tiny/plugin";
import { humanInTheLoop } from "@tiny/plugin-hitl";

/**
 * The default: every tool call stops and asks, and nothing is remembered until
 * the user ticks the box.
 */
export const plugins: readonly Plugin[] = [humanInTheLoop()];
