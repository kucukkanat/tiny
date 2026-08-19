import { PluginHost } from "@tiny/plugin";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import { App } from "./App.tsx";
import { plugins } from "./plugins/index.ts";

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

createRoot(root).render(
  <PluginHost plugins={plugins}>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/c/:id" element={<App />} />
      </Routes>
    </HashRouter>
  </PluginHost>,
);

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.error("Service worker registration failed", error);
  });
}
