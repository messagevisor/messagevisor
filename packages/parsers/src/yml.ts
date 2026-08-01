import * as fs from "node:fs";

import { isAlias, parse, parseDocument, stringify, Scalar } from "yaml";
import type { Pair, YAMLMap, YAMLSeq } from "yaml";

import type { CustomParser } from "./index";

interface CommentedNode {
  comment?: string | null;
  commentBefore?: string | null;
}

interface NodeCreator {
  createNode(value: unknown): unknown;
  createPair(key: unknown, value: unknown): Pair;
}

function getKey(node: unknown) {
  if (node == null) return undefined;
  if (typeof (node as { value?: unknown }).value !== "undefined") {
    return String((node as { value: unknown }).value);
  }
  return typeof node === "string" ? node : undefined;
}

function copyNodeComments(source: unknown, target: unknown) {
  if (!source || !target || typeof source !== "object" || typeof target !== "object") return;
  const from = source as CommentedNode;
  const to = target as CommentedNode;
  if (from.comment != null) to.comment = from.comment;
  if (from.commentBefore != null) to.commentBefore = from.commentBefore;
}

function copyPairComments(source: Pair, target: Pair) {
  copyNodeComments(source, target);
  copyNodeComments(source.key, target.key);
  copyNodeComments(source.value, target.value);
}

function isYamlMap(node: unknown): node is YAMLMap {
  return Boolean(node && typeof node === "object" && Array.isArray((node as YAMLMap).items));
}

function isYamlSequence(node: unknown): node is YAMLSeq {
  return Boolean(node && typeof node === "object" && Array.isArray((node as YAMLSeq).items));
}

function valueIdentity(value: unknown) {
  const node = value as { value?: unknown; toJSON?: () => unknown } | null;
  if (node && typeof node.value !== "undefined") return JSON.stringify(node.value);
  if (node && typeof node.toJSON === "function") return JSON.stringify(node.toJSON());
  return JSON.stringify(value);
}

function valuesEqual(creator: NodeCreator, node: unknown, value: unknown) {
  try {
    const current = isAlias(node)
      ? node.resolve(creator as never)?.toJSON()
      : (node as { toJSON?: () => unknown } | null)?.toJSON?.();
    return JSON.stringify(current) === JSON.stringify(value);
  } catch {
    return false;
  }
}

function createValue(creator: NodeCreator, previous: unknown, value: unknown): unknown {
  if (valuesEqual(creator, previous, value)) return previous;

  if (value === null || typeof value !== "object") {
    const node = previous instanceof Scalar ? previous : new Scalar(value);
    node.value = value;
    copyNodeComments(previous, node);
    return node;
  }

  if (Array.isArray(value)) {
    const previousItems = new Map<string, unknown[]>();
    if (isYamlSequence(previous)) {
      previous.items.forEach((item) => {
        const identity = valueIdentity(item);
        previousItems.set(identity, [...(previousItems.get(identity) || []), item]);
      });
    }
    const sequence = isYamlSequence(previous) ? previous : (creator.createNode([]) as YAMLSeq);
    sequence.items = value.map((entry) => {
      const candidates = previousItems.get(valueIdentity(entry));
      return createValue(creator, candidates?.shift(), entry) as never;
    });
    copyNodeComments(previous, sequence);
    return sequence;
  }

  const previousPairs = new Map<string, Pair>();
  if (isYamlMap(previous)) {
    (previous.items as Pair[]).forEach((pair) => {
      const key = getKey(pair.key);
      if (key !== undefined) previousPairs.set(key, pair);
    });
  }

  const map = isYamlMap(previous) ? previous : (creator.createNode({}) as YAMLMap);
  map.items = Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const previousPair = previousPairs.get(key);
    const pair = previousPair || creator.createPair(key, entry);
    pair.value = createValue(creator, previousPair?.value, entry) as never;
    if (previousPair) copyPairComments(previousPair, pair);
    return pair;
  });
  copyNodeComments(previous, map);
  return map;
}

function replaceDocument(
  document: { contents: unknown } & NodeCreator,
  content: Record<string, unknown>,
) {
  document.contents = createValue(document, document.contents, content);
}

export const ymlParser: CustomParser = {
  extension: "yml",
  parse<T>(content: string): T {
    return parse(content) as T;
  },
  stringify(content: unknown, filePath?: string) {
    if (!filePath || !fs.existsSync(filePath)) return stringify(content);

    const existing = fs.readFileSync(filePath, "utf8");
    if (!existing.trim()) return stringify(content);
    if (content === null || typeof content !== "object" || Array.isArray(content)) {
      throw new Error("Cannot set root document to a primitive value");
    }

    const document = parseDocument(existing) as unknown as { contents: unknown } & NodeCreator;
    replaceDocument(document, content as Record<string, unknown>);
    return document.toString();
  },
};
