import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

function createCatalogPublicDirReloadPlugin(publicDir: string): Plugin {
  const resolvedPublicDir = path.resolve(publicDir);
  const packagePublicDir = path.resolve(process.cwd(), "public");
  const watchRoots =
    resolvedPublicDir === packagePublicDir
      ? [resolvedPublicDir]
      : [resolvedPublicDir, packagePublicDir];
  let reloadTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    name: "catalog-public-dir-reload",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      for (const root of watchRoots) {
        server.watcher.add(root);
      }

      const triggerReload = (changedPath: string) => {
        const normalizedPath = path.resolve(changedPath);

        const underWatchedRoot = watchRoots.some(
          (root) => normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`),
        );

        if (!underWatchedRoot) {
          return;
        }

        if (reloadTimer) {
          clearTimeout(reloadTimer);
        }

        reloadTimer = setTimeout(() => {
          reloadTimer = null;
          server.ws.send({ type: "full-reload", path: "*" });
        }, 75);
      };

      server.watcher.on("add", triggerReload);
      server.watcher.on("change", triggerReload);
      server.watcher.on("unlink", triggerReload);
    },
  };
}

const publicDir = process.env.CATALOG_PUBLIC_DIR || "public";

export default defineConfig({
  base: "/",
  plugins: [react(), createCatalogPublicDirReloadPlugin(publicDir)],
  publicDir,
  server: {
    host: "127.0.0.1",
    port: 3000,
    open: true,
  },
});
