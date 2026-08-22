import { type Plugin, PluginHost } from "@tiny/plugin";
import { HashRouter } from "react-router";
import { ChatShell } from "./ChatShell.tsx";

/**
 * The whole application, mounted in one line: host, router, shell.
 *
 * ```tsx
 * createRoot(root).render(<TinyApp plugins={plugins} />);
 * ```
 *
 * This is the baseplate. An app that takes it writes its plugin list and
 * nothing else; `apps/chat` is exactly that. The three layers it assembles are
 * each replaceable — mount `PluginHost`, a router of your own and `ChatShell`
 * yourself when you need a `MemoryRouter` in a test or a host the shell does
 * not know about — but assembling them is no longer the price of entry.
 *
 * `HashRouter` rather than `BrowserRouter` because the app deploys as static
 * files: a hash route survives a hard refresh with no server to rewrite URLs.
 */
export function TinyApp({
  plugins,
  uiFallbacks,
  title,
}: {
  /** The plugins to run, in order — see `loadPlugins` for what order decides. */
  readonly plugins: readonly Plugin[];
  /**
   * Extra `ctx.ui` members for methods this host cannot implement — pass
   * `piTerminalUI` from `@tiny/plugin-pi` to run pi extensions unmodified.
   */
  readonly uiFallbacks?: Readonly<Record<string, unknown>> | undefined;
  /** The sidebar's heading. */
  readonly title?: string | undefined;
}) {
  return (
    <PluginHost plugins={plugins} uiFallbacks={uiFallbacks}>
      <HashRouter>
        <ChatShell title={title} />
      </HashRouter>
    </PluginHost>
  );
}
