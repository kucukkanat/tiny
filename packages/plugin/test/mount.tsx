import { expect } from "bun:test";
import { act, render, waitFor } from "@testing-library/react";
import { usePluginHost } from "../src/hooks.ts";
import { PluginHost } from "../src/PluginHost.tsx";
import { emptyRegistry } from "../src/registry.ts";
import type { Plugin } from "../src/tiny.ts";

/** What the mounted probe captured — how tests reach the host from outside. */
export let host: ReturnType<typeof usePluginHost> | undefined;

export function Probe() {
  host = usePluginHost();
  return null;
}

/** For the rare test that renders `<Probe/>` itself instead of using `mountHost`. */
export const resetHost = () => {
  host = undefined;
};

/**
 * Mounts the real host and waits for the registry to land. Factories resolve a
 * microtask after the first paint; rendering inside `act` keeps that second
 * update in the act scope rather than landing loose.
 */
export const mountHost = async (plugins: readonly Plugin[], children?: React.ReactNode) => {
  host = undefined;
  await act(async () => {
    render(
      <PluginHost plugins={plugins}>
        <Probe />
        {children}
      </PluginHost>,
    );
  });
  await waitFor(() => {
    expect(host).toBeDefined();
    expect(host?.registry).not.toBe(emptyRegistry);
  });
};
