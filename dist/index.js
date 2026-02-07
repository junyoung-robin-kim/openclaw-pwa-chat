import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { pwaChatPlugin } from "./src/channel.js";
import { setRuntime } from "./src/runtime.js";
const plugin = {
    id: "pwa-chat",
    name: "PWA Chat",
    description: "Browser-based PWA messenger channel plugin",
    configSchema: emptyPluginConfigSchema(),
    register(api) {
        setRuntime(api.runtime);
        api.registerChannel({ plugin: pwaChatPlugin });
    },
};
export default plugin;
