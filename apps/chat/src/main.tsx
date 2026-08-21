import { PluginHost } from "@tiny/plugin";
import { piTerminalUI } from "@tiny/plugin-pi";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { App } from "./App.tsx";
import { plugins } from "./plugins.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

// `App` is the shell and owns the route table itself, because a page a plugin
// registers renders *inside* that shell — see the `<Routes>` in App.tsx.
//
// `uiFallbacks` is this app opting in to pi compatibility: it adds the
// terminal-only half of pi's `ctx.ui` as the no-ops pi's own RPC mode returns,
// so an extension written for pi and installed here degrades rather than
// throwing. Drop the prop and `ctx.ui` is only methods that do something.
createRoot(root).render(
  <PluginHost plugins={plugins} uiFallbacks={piTerminalUI}>
    <HashRouter>
      <App />
    </HashRouter>
  </PluginHost>,
);

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error("Service worker registration failed", error);
  });
}
