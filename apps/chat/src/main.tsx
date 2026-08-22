import { piTerminalUI } from "@tiny/plugin-pi";
import { TinyApp } from "@tiny/shell";
import { createRoot } from "react-dom/client";
import { plugins } from "./plugins.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

// The whole app: `@tiny/shell` assembles the host, the router and the chrome,
// so what remains of this app is the plugin list — which is the point.
//
// `uiFallbacks` is this app opting in to pi compatibility: it adds the
// terminal-only half of pi's `ctx.ui` as the no-ops pi's own RPC mode returns,
// so an extension written for pi and installed here degrades rather than
// throwing. Drop the prop and `ctx.ui` is only methods that do something.
createRoot(root).render(<TinyApp plugins={plugins} uiFallbacks={piTerminalUI} />);

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error("Service worker registration failed", error);
  });
}
