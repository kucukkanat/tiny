import { loadPlugins } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";

// Adding the plugin to the registry is the whole wiring: `loadPlugins` collects
// its tools, and `useChat` hands them to `streamChat` for the model to call.
const { tools } = await loadPlugins([fileSystem()]);

for (const tool of tools) console.log(`${tool.name} — ${tool.description.split(".")[0]}`);
