import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), mcpPlugin()].filter(Boolean),

  // WebView antigo da Gertec GPOS780/720 (Chrome ~60) não entende sintaxe ES2020
  // (optional chaining, nullish, top-level await) — sem isso o APK abre em branco.
  build: {
    target: ["es2015", "chrome60", "safari12"],
  },
  esbuild: {
    target: "es2015",
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    include: ["pdfjs-dist/build/pdf.mjs"],
  },
}));
