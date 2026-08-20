import type { Plugin } from "@tiny/plugin";

/**
 * An endpoint added to the model picker — pi's `registerProvider`, reduced to
 * the part that survives a browser.
 *
 * pi's version also carries credential storage, catalog persistence and a
 * native `pi-ai` provider; none has anywhere to live here. What remains is what
 * actually travels: where to send the request, how to authenticate, and which
 * models exist.
 */
export const groq = (): Plugin =>
  function groq(pi) {
    pi.registerProvider("groq", {
      name: "Groq",
      baseUrl: "https://api.groq.com/openai/v1",
      // Omitting `models` asks the endpoint's own /models route, which is what an
      // OpenAI-compatible server publishes.
      models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
      // A thunk rather than a string, so the key is fetched when a request needs
      // it instead of sitting in the registry where `ctx.settings` would expose
      // it to every other plugin.
      apiKey: () => localStorage.getItem("groq:key") ?? "",
    });

    pi.registerCommand("groq:key", {
      description: "Set the Groq API key",
      handler: async (args, ctx) => {
        const key = args !== "" ? args : await ctx.ui.input("Groq API key", "gsk_…");
        if (key === undefined || key === "") return;
        localStorage.setItem("groq:key", key);
        ctx.ui.notify("Groq key saved", "info");
      },
    });

    pi.registerCommand("groq:off", {
      description: "Remove the Groq provider",
      // Registering and unregistering both work after the factory has returned,
      // as they do in pi — the picker updates without a reload.
      handler: (_args, ctx) => {
        ctx.ui.notify(pi.unregisterProvider("groq") ? "Groq removed" : "Groq was not registered");
      },
    });
  };
