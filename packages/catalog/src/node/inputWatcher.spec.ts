import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { createCatalogInputWatcher } from "./inputWatcher";

jest.mock("fs", () => ({ __esModule: true, ...jest.requireActual("fs") }));

describe("Catalog input watcher boundary", () => {
  const root = path.resolve("catalog-watch-fixture");
  const messages = path.join(root, "messages");
  const config = { messagesDirectoryPath: messages, setsDirectoryPath: path.join(root, "sets") };
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("uses native events without polling or parsing source files", () => {
    const close = jest.fn();
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest
      .spyOn(fs, "statSync")
      .mockImplementation(
        (value) => ({ isDirectory: () => String(value) === messages }) as fs.Stats,
      );
    const watch = jest
      .spyOn(fs, "watch")
      .mockReturnValue(Object.assign(new EventEmitter(), { close }) as unknown as fs.FSWatcher);
    const stat = jest.spyOn(fs.promises, "stat");
    const read = jest.spyOn(fs.promises, "readFile");
    const changed = jest.fn();
    stop = createCatalogInputWatcher(root, config, [path.join(messages, "generated")], changed);
    expect(watch).toHaveBeenCalledTimes(2);
    expect(watch.mock.calls[0].slice(0, 2)).toEqual([root, { recursive: false }]);
    const [, , listener] = watch.mock.calls[1] as unknown as [
      string,
      fs.WatchOptions,
      fs.WatchListener<string>,
    ];
    listener("change", "welcome.yml");
    listener("change", "generated/output.json");
    expect(changed.mock.calls).toEqual([[[path.join(messages, "welcome.yml")]]]);
    expect(stat).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    stop();
    stop = undefined;
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("anchors missing inputs outside their directory and follows creation and replacement", () => {
    let exists = false;
    jest.spyOn(fs, "existsSync").mockImplementation((value) => String(value) === root);
    jest.spyOn(fs, "statSync").mockImplementation((value) => {
      if (String(value) === messages && exists) return { isDirectory: () => true } as fs.Stats;
      throw new Error("ENOENT");
    });
    const close = jest.fn();
    const watch = jest
      .spyOn(fs, "watch")
      .mockReturnValue(Object.assign(new EventEmitter(), { close }) as unknown as fs.FSWatcher);
    const changed = jest.fn();
    stop = createCatalogInputWatcher(root, config, [], changed);
    expect(watch.mock.calls[0].slice(0, 2)).toEqual([root, { recursive: false }]);
    const listenerAt = (index: number) =>
      (
        watch.mock.calls[index] as unknown as [string, fs.WatchOptions, fs.WatchListener<string>]
      )[2];
    exists = true;
    listenerAt(0)("rename", "messages");
    expect(watch.mock.calls[1].slice(0, 2)).toEqual([messages, { recursive: true }]);
    listenerAt(1)("rename", "hello.yml");
    listenerAt(1)("change", "hello.yml");
    listenerAt(0)("rename", "messages");
    listenerAt(2)("change", "new.yml");
    expect(watch.mock.calls.filter(([directory]) => directory === root)).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(5);
    stop();
    listenerAt(2)("change", "hello.yml");
    expect(changed).toHaveBeenCalledTimes(5);
  });

  it("falls back once on asynchronous watcher errors and closes all resources", async () => {
    jest.useFakeTimers();
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    const emitter = Object.assign(new EventEmitter(), { close: jest.fn() });
    jest.spyOn(fs, "watch").mockReturnValue(emitter as unknown as fs.FSWatcher);
    jest.spyOn(fs.promises, "stat").mockRejectedValue(new Error("not found"));
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    stop = createCatalogInputWatcher(root, config, [], jest.fn());
    emitter.emit("error", new Error("EMFILE"));
    emitter.emit("error", new Error("EMFILE"));
    await jest.advanceTimersByTimeAsync(0);
    expect(emitter.close).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("measures one metadata scan per fallback tick and reports only changed inputs", async () => {
    jest.useFakeTimers();
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest.spyOn(fs, "statSync").mockReturnValue({ isDirectory: () => true } as fs.Stats);
    jest.spyOn(fs, "watch").mockImplementation(() => {
      throw new Error("unsupported");
    });
    let revision = 1;
    const count = 128;
    const stat = jest.spyOn(fs.promises, "stat").mockImplementation(
      async (file) =>
        ({
          isFile: () => String(file) !== messages,
          size: 1,
          mtimeMs: String(file).endsWith("message-0.yml") ? revision : 1,
        }) as fs.Stats,
    );
    const readdir = jest.spyOn(fs.promises, "readdir").mockResolvedValue(
      Array.from({ length: count }, (_, index) => ({
        name: `message-${index}.yml`,
        isDirectory: () => false,
        isFile: () => true,
      })) as never,
    );
    const read = jest.spyOn(fs.promises, "readFile");
    const changed = jest.fn();
    stop = createCatalogInputWatcher(root, config, [], changed);
    await jest.advanceTimersByTimeAsync(0);
    expect(stat).toHaveBeenCalledTimes(count + 2);
    expect(readdir).toHaveBeenCalledTimes(1);
    changed.mockClear();
    stat.mockClear();
    readdir.mockClear();
    await jest.advanceTimersByTimeAsync(1000);
    expect(stat).toHaveBeenCalledTimes(count + 2);
    expect(readdir).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    revision++;
    await jest.advanceTimersByTimeAsync(1000);
    expect(changed.mock.calls).toEqual([[[path.join(messages, "message-0.yml")]]]);
    expect(read).not.toHaveBeenCalled();
    stop();
    stop = undefined;
    stat.mockClear();
    await jest.advanceTimersByTimeAsync(5000);
    expect(stat).not.toHaveBeenCalled();
  });

  it("does not publish a pending fallback scan after closing", async () => {
    jest.useFakeTimers();
    jest.spyOn(fs, "existsSync").mockReturnValue(false);
    let finish!: (stat: fs.Stats) => void;
    jest.spyOn(fs.promises, "stat").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const changed = jest.fn();
    stop = createCatalogInputWatcher(
      root,
      { setsDirectoryPath: config.setsDirectoryPath },
      [],
      changed,
    );
    stop();
    stop = undefined;
    finish({ isFile: () => true, size: 1, mtimeMs: 1 } as fs.Stats);
    await jest.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
  });
});
