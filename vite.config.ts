import { resolve } from "node:path";
import { builtinModules } from "node:module";
import { defineConfig } from "vite";
import nodeResolve from "@rollup/plugin-node-resolve";

const nodeModules = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

export default defineConfig({
  build: {
    sourcemap: false,
    target: "esnext",
    minify: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.mjs",
    },
    rollupOptions: {
      external: nodeModules,
      output: {
        inlineDynamicImports: true,
      },
    },
    outDir: "dist",
  },
  plugins: [nodeResolve()],
});
