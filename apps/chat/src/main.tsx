import { piTerminalUI } from "@tiny/plugin-pi";
import { TinyApp } from "@tiny/shell";
import { createRoot } from "react-dom/client";
import { plugins } from "./plugins.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

// `@tiny/shell` assembles host, router and chrome; what remains here is the
// plugin list. `uiFallbacks` opts in to pi compatibility — drop it and
// `ctx.ui` is only methods that do something.
createRoot(root).render(<TinyApp plugins={plugins} uiFallbacks={piTerminalUI} />);

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error("Service worker registration failed", error);
  });
}
