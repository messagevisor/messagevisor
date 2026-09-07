import * as fs from "fs";
import * as path from "path";

interface CatalogWatchConfig {
  sets?: boolean;
  setsDirectoryPath: string;
  localesDirectoryPath?: string;
  messagesDirectoryPath?: string;
  attributesDirectoryPath?: string;
  segmentsDirectoryPath?: string;
  targetsDirectoryPath?: string;
  testsDirectoryPath?: string;
}

export function getCatalogInputWatchPaths(
  rootDirectoryPath: string,
  projectConfig: CatalogWatchConfig,
) {
  const paths: Array<string | undefined> = [path.join(rootDirectoryPath, "messagevisor.config.js")];

  if (projectConfig.sets) {
    paths.push(projectConfig.setsDirectoryPath);
    return paths as string[];
  }

  paths.push(
    projectConfig.localesDirectoryPath,
    projectConfig.messagesDirectoryPath,
    projectConfig.attributesDirectoryPath,
    projectConfig.segmentsDirectoryPath,
    projectConfig.targetsDirectoryPath,
    projectConfig.testsDirectoryPath,
  );

  return paths.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function createCatalogInputWatcher(
  rootDirectoryPath: string,
  projectConfig: CatalogWatchConfig,
  ignoredDirectoryPaths: string[],
  onChange: (changedPaths: string[]) => void,
) {
  const watchPaths = getCatalogInputWatchPaths(rootDirectoryPath, projectConfig);

  function shouldIgnore(targetPath: string) {
    const resolvedTargetPath = path.resolve(targetPath);

    return ignoredDirectoryPaths.some((ignoredDirectoryPath) => {
      const resolvedIgnoredPath = path.resolve(ignoredDirectoryPath);

      return (
        resolvedTargetPath === resolvedIgnoredPath ||
        resolvedTargetPath.startsWith(`${resolvedIgnoredPath}${path.sep}`)
      );
    });
  }

  function shouldWatch(targetPath: string) {
    const resolvedTargetPath = path.resolve(targetPath);

    if (shouldIgnore(resolvedTargetPath)) {
      return false;
    }

    return watchPaths.some((watchPath) => {
      const resolvedWatchPath = path.resolve(watchPath);

      return (
        resolvedTargetPath === resolvedWatchPath ||
        resolvedTargetPath.startsWith(`${resolvedWatchPath}${path.sep}`)
      );
    });
  }

  async function collectSnapshotEntries(
    directoryPath: string,
    snapshotEntries: Map<string, string>,
  ): Promise<void> {
    if (shouldIgnore(directoryPath)) {
      return;
    }

    let entries: fs.Dirent[] = [];

    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (shouldIgnore(entryPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await collectSnapshotEntries(entryPath, snapshotEntries);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const stat = await fs.promises.stat(entryPath);
        snapshotEntries.set(entryPath, `${stat.size}:${stat.mtimeMs}`);
      } catch {
        // Ignore transient editor save races.
      }
    }
  }

  async function createSnapshot() {
    const snapshotEntries = new Map<string, string>();

    for (const watchPath of watchPaths) {
      let stat: fs.Stats;

      try {
        stat = await fs.promises.stat(watchPath);
      } catch {
        continue;
      }

      if (stat.isFile()) {
        snapshotEntries.set(watchPath, `${stat.size}:${stat.mtimeMs}`);
        continue;
      }

      await collectSnapshotEntries(watchPath, snapshotEntries);
    }

    return snapshotEntries;
  }

  function getSnapshotChanges(previous: Map<string, string>, next: Map<string, string>) {
    const changedPaths = new Set<string>();

    for (const [filePath, signature] of Array.from(next.entries())) {
      if (previous.get(filePath) !== signature) {
        changedPaths.add(filePath);
      }
    }

    for (const filePath of Array.from(previous.keys())) {
      if (!next.has(filePath)) {
        changedPaths.add(filePath);
      }
    }

    return Array.from(changedPaths);
  }

  function createPollingWatcher() {
    let previousSnapshot = new Map<string, string>();
    let checking = false;
    let stopped = false;

    async function poll() {
      if (stopped || checking) {
        return;
      }

      checking = true;

      try {
        const nextSnapshot = await createSnapshot();
        if (stopped) return;
        const changedPaths = getSnapshotChanges(previousSnapshot, nextSnapshot).filter(shouldWatch);

        previousSnapshot = nextSnapshot;

        if (changedPaths.length > 0) {
          onChange(changedPaths);
        }
      } finally {
        checking = false;
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 1000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }

  const watchers = new Map<string, { watcher: fs.FSWatcher; recursive: boolean }>();
  let stopped = false;
  let stopPolling: (() => void) | undefined;
  function closeWatchers() {
    for (const { watcher } of watchers.values()) watcher.close();
    watchers.clear();
  }
  function usePolling(error?: unknown) {
    if (stopped || stopPolling) return;
    closeWatchers();
    console.warn(
      "Catalog native watching unavailable; using polling.",
      error instanceof Error ? error.message : "",
    );
    stopPolling = createPollingWatcher();
  }

  function reconcile(replacedPath?: string) {
    if (stopped || stopPolling) return;
    // Parent sentinels are nonrecursive: do not traverse node_modules or generated
    // output simply to discover a newly created input directory.
    const directories = new Map<string, boolean>();
    for (const watchPath of watchPaths) {
      let ancestor = path.dirname(path.resolve(watchPath));
      while (!fs.existsSync(ancestor)) {
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
      if (fs.existsSync(ancestor) && !directories.has(ancestor)) directories.set(ancestor, false);
      try {
        if (!shouldIgnore(watchPath) && fs.statSync(watchPath).isDirectory())
          directories.set(watchPath, true);
      } catch {
        // A missing input is covered by its nearest existing parent sentinel.
      }
    }
    for (const [directory, registration] of watchers) {
      const replaced =
        replacedPath &&
        (directory === replacedPath || directory.startsWith(`${replacedPath}${path.sep}`));
      if (directories.get(directory) !== registration.recursive || replaced) {
        registration.watcher.close();
        watchers.delete(directory);
      }
    }
    for (const [directoryPath, recursive] of directories) {
      if (watchers.has(directoryPath)) continue;
      try {
        const watcher = fs.watch(directoryPath, { recursive }, (eventType, filename) => {
          if (stopped || stopPolling || watchers.get(directoryPath)?.watcher !== watcher) return;
          const changedPath = filename
            ? path.resolve(directoryPath, filename.toString())
            : directoryPath;

          const inputAncestorChanged = watchPaths
            .slice(1)
            .some(
              (watchPath) =>
                watchPath === changedPath || watchPath.startsWith(`${changedPath}${path.sep}`),
            );
          if (!filename || (eventType === "rename" && inputAncestorChanged)) reconcile(changedPath);
          if (!filename) {
            onChange(watchPaths.filter((entry) => !shouldIgnore(entry)));
          } else if (shouldWatch(changedPath)) {
            onChange([changedPath]);
          }
        });

        watchers.set(directoryPath, { watcher, recursive });
        watcher.on("error", (error) => {
          if (watchers.get(directoryPath)?.watcher === watcher) usePolling(error);
        });
      } catch (error) {
        usePolling(error);
        break;
      }
    }
    if (watchers.size === 0 && !stopPolling) usePolling();
  }
  reconcile();

  return () => {
    if (stopped) return;
    stopped = true;
    stopPolling?.();
    closeWatchers();
  };
}
