import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { loadPlugins } from "@tiny/plugin";
import * as react from "react";
import { compile, transpile } from "../src/compile.ts";
import { PluginManagerError } from "../src/errors.ts";
import { defaultModules, hostModules } from "../src/runtime.ts";

// bun:test hooks aren't globals, so testing-library can't auto-register this.
afterEach(cleanup);

/*
 * A plugin installed at runtime may be written in TypeScript and JSX. Nothing
 * is stubbed here: the source is really transpiled, really imported as a blob
 * module, and — for the test that matters most — really rendered by the same
 * `react-dom` the app uses, so a hook that resolves against the wrong React
 * would throw rather than quietly pass.
 */

const PLAIN = 'export default (tiny) => tiny.registerCommand("hello", { handler: () => {} });';

describe("typescript", () => {
  test("strips types and runs", async () => {
    const registered: string[] = [];
    const plugin = await compile(`
      import type { Plugin, PluginAPI } from "@tiny/plugin";

      type Options = { readonly name: string };

      const make = ({ name }: Options): Plugin => (tiny: PluginAPI) => {
        tiny.registerCommand(name, { description: "typed", handler: () => {} });
      };

      export default make({ name: "typed" }) satisfies Plugin;
    `);
    await plugin({ registerCommand: (name: string) => registered.push(name) } as never);
    expect(registered).toEqual(["typed"]);
  });

  test("elides a type-only import, so its module needs no runtime entry", async () => {
    // `Plugin` is a type, so the import never survives to be resolved — which is
    // what lets a plugin be fully typed against packages the host does not offer.
    const js = await transpile('import type { Plugin } from "@tiny/nothing";\nexport default {};');
    expect(js).not.toContain("@tiny/nothing");
  });

  test("leaves plain JavaScript byte-for-byte alone", async () => {
    // The guarantee for everything installed before this existed.
    expect(await transpile(PLAIN)).toBe(PLAIN);
  });
});

describe("jsx", () => {
  test("renders through the host's React, hooks and all", async () => {
    const plugin = await compile(`
      import { useState } from "react";

      const Counter = ({ label }: { readonly label: string }) => {
        const [count, setCount] = useState<number>(0);
        return (
          <>
            <span data-testid="label">{label}</span>
            <button type="button" data-testid="bump" onClick={() => setCount((n) => n + 1)}>
              {count}
            </button>
          </>
        );
      };

      export default (tiny) => {
        tiny.contribute("app.overlays", () => <Counter label="from a runtime plugin" />);
      };
    `);

    let contributed: react.ComponentType | undefined;
    await plugin({
      contribute: (_slot: string, component: react.ComponentType) => {
        contributed = component;
      },
    } as never);
    expect(contributed).toBeDefined();

    render(react.createElement(contributed as react.ComponentType));
    expect(screen.getByTestId("label").textContent).toBe("from a runtime plugin");

    const bump = screen.getByTestId("bump");
    expect(bump.textContent).toBe("0");

    // The assertion the whole design exists for: a second copy of React would
    // have thrown on `useState` while rendering, and a shared-but-stale
    // dispatcher would fail to re-render here.
    fireEvent.click(bump);
    expect(bump.textContent).toBe("1");
  });

  test("a JSX plugin loads through loadPlugins like any other", async () => {
    const plugin = await compile(
      'export default (tiny) => tiny.contribute("app.overlays", () => <p>hi</p>);',
    );
    const registry = await loadPlugins([plugin]);
    expect(registry.contributions.filter((entry) => entry.slot === "app.overlays")).toHaveLength(1);
  });
});

describe("imports", () => {
  test("rewrites a bare specifier to the host's own instance", async () => {
    const js = await transpile('import { useState } from "react";\nexport default useState;');
    expect(js).toContain("blob:");
    expect(js).not.toMatch(/from "react"/);

    const module: { default: unknown } = await import(
      URL.createObjectURL(new Blob([js], { type: "text/javascript" }))
    );
    expect(module.default).toBe(react.useState);
  });

  test("rewrites a dynamic import, quotes included", async () => {
    const js = await transpile('export default async () => (await import("react")).useState;');
    expect(js).toMatch(/import\("blob:[^"]+"\)/);

    const plugin = await compile('export default async () => (await import("react")).useState;');
    expect(await (plugin as unknown as () => Promise<unknown>)()).toBe(react.useState);
  });

  test("refuses a module the host does not offer, and says what it does", async () => {
    const failing = transpile('import _ from "lodash";\nexport default () => _;');
    await expect(failing).rejects.toThrow(PluginManagerError);
    await expect(failing).rejects.toThrow('Cannot import "lodash"');
    await expect(failing).rejects.toThrow('"react", "react/jsx-runtime", "@tiny/plugin"');
  });

  test("refuses a relative import rather than failing opaquely later", async () => {
    await expect(transpile('import { x } from "./helper.js";\nexport default x;')).rejects.toThrow(
      "a plugin is one file",
    );
  });

  test("leaves an absolute URL alone", async () => {
    const js = await transpile('import x from "https://example.com/m.js";\nexport default x;');
    expect(js).toContain('"https://example.com/m.js"');
  });

  test("leaves a runtime-computed specifier alone", async () => {
    const js = await transpile("export default (name) => import(name);");
    expect(js).toContain("import(name)");
  });

  test("a host can add its own modules, keeping the defaults", async () => {
    const design = { Card: () => null };
    const modules = hostModules({ "@tiny/ui": design });
    expect(Object.keys(modules)).toEqual([...Object.keys(defaultModules), "@tiny/ui"]);

    const plugin = await compile(
      'import { Card } from "@tiny/ui";\nexport default () => Card;',
      modules,
    );
    expect((plugin as unknown as () => unknown)()).toBe(design.Card);
  });
});

describe("rejection", () => {
  test("reports a parse failure as such", async () => {
    await expect(compile("export default (")).rejects.toThrow("does not parse");
  });

  test("still insists on a default export that is a function", async () => {
    await expect(compile("export const x: number = 1;")).rejects.toThrow(
      "must `export default` a function",
    );
  });
});
