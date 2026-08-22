import { type Plugin, PluginHost } from "@tiny/plugin";
import { HashRouter } from "react-router";
import { ChatShell } from "./ChatShell.tsx";

/** The whole application in one component: host, router, shell. `HashRouter` because
 * the app deploys as static files — a hash route survives a hard refresh. */
export function TinyApp({
  plugins,
  uiFallbacks,
  title,
}: {
  /** The plugins to run, in order — see `loadPlugins` for what order decides. */
  readonly plugins: readonly Plugin[];
  /** Extra `ctx.ui` members — pass `piTerminalUI` from `@tiny/plugin-pi` to run pi extensions unmodified. */
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
