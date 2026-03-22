import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "HelpForgeWidget",
      fileName: (format) => `widget.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      // React is expected to be available on the host page (CDN or bundle)
      // so we externalise it in ES mode but inline it in UMD for standalone embed
      external: [],
    },
    cssCodeSplit: false,   // single CSS file bundled into JS
  },
});
