import { PluginHost } from "@tiny/plugin";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router";
import { App } from "./App.tsx";
import { plugins } from "./plugins.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

// `App` is the shell and owns the route table itself, because a page a plugin
// registers renders *inside* that shell — see the `<Routes>` in App.tsx.
createRoot(root).render(
  <PluginHost plugins={plugins}>
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
