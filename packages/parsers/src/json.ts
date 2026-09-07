import type { CustomParser } from "./index";

export const jsonParser: CustomParser = {
  extension: "json",
  cacheVersion: "messagevisor:json:1",
  parse<T>(content: string): T {
    return JSON.parse(content) as T;
  },
  stringify(content: unknown) {
    return JSON.stringify(content, null, 2);
  },
};
