import { defineConfig } from "vite";
import { injectDmnoConfigVitePlugin } from '@dmno/vite-integration';
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
    plugins: [
        injectDmnoConfigVitePlugin({ injectSensitiveConfig: true }),
        cloudflare()
    ],
});