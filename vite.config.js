import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { installStudioApi } from "./server/studioApi.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      {
        name: "ploton-studio-api",
        configureServer(server) {
          installStudioApi(server, env);
        }
      }
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const moduleId = id.replaceAll("\\", "/");
            if (!moduleId.includes("node_modules")) return undefined;
            if (moduleId.includes("@react-three/fiber")) return "vendor-react-three-fiber";
            if (moduleId.includes("@react-three/drei")) return "vendor-react-three-drei";
            if (moduleId.includes("node_modules/three/examples/jsm")) return "vendor-three-addons";
            if (moduleId.includes("node_modules/three")) return "vendor-three-core";
            if (moduleId.includes("lucide-react")) return "vendor-icons";
            return undefined;
          }
        }
      }
    }
  };
});
