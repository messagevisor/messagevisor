import type { EntityPath, EntityType } from "./types";

export const entityPaths: EntityPath[] = [
  "messages",
  "locales",
  "attributes",
  "segments",
  "targets",
];

export const entityPathToType: Record<EntityPath, EntityType> = {
  locales: "locale",
  messages: "message",
  attributes: "attribute",
  segments: "segment",
  targets: "target",
};

export const entityTypeToPath: Record<EntityType, EntityPath> = {
  locale: "locales",
  message: "messages",
  attribute: "attributes",
  segment: "segments",
  target: "targets",
};

export const entityLabels: Record<EntityType, { singular: string; plural: string }> = {
  locale: { singular: "Locale", plural: "Locales" },
  message: { singular: "Message", plural: "Messages" },
  attribute: { singular: "Attribute", plural: "Attributes" },
  segment: { singular: "Segment", plural: "Segments" },
  target: { singular: "Target", plural: "Targets" },
};

export function encodeRouteSegment(value: string) {
  return encodeURIComponent(value);
}

export function getBasePath(setKey?: string) {
  return setKey ? `/sets/${encodeRouteSegment(setKey)}` : "";
}

export function getEntityRoute(type: EntityType, key: string, setKey?: string) {
  return `${getBasePath(setKey)}/${entityTypeToPath[type]}/${encodeRouteSegment(key)}`;
}

export function getDataBasePath(setKey?: string) {
  return setKey ? `/data/sets/${encodeRouteSegment(setKey)}` : "/data/root";
}
