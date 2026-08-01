import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDirectories = ["cjs", "dist", "esm", "lib", "node-esm"];

// Node's filesystem APIs do not expand globs. Walk only the two known workspace
// roots so clean remains portable across Unix and Windows shells.
for (const packageType of ["packages", "projects"]) {
  const packageRoot = join(root, packageType);
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const directory of outputDirectories) {
      rmSync(join(packageRoot, entry.name, directory), { recursive: true, force: true });
    }
  }
}
