import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "path";

export default defineConfig({
    plugins: [
        cloudflare(),
    ],
    server: {
        port: 8787,
    },
    build: {
        sourcemap: true,
    },
    assetsInclude: ['**/*.sql'],
    resolve: {
        alias: {
            "@core": path.resolve(__dirname, "./src/core"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "@otypes": path.resolve(__dirname, "./src/types"),
            "@services": path.resolve(__dirname, "./src/services"),
            "@middleware": path.resolve(__dirname, "./src/middleware")
        }
    },
});