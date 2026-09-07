import { createHash } from "crypto";
import * as fs from "fs";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { SaxesParser } from "saxes";
import type { Locale, Message, Override, TranslationStatus } from "@messagevisor/types";
import type { ProjectConfig } from "../config";
import type { Datasource } from "../datasource";
import type { ExportRow } from "../exporter";
import {
  collectImportPlansForDatasource,
  createResult,
  writePlans,
  type ImportProjectOptions,
  type ImportRow,
} from "../importer";
import { MessagevisorCLIError } from "../error";
import { resolveLocaleValue } from "../localeResolution";
import { getProjectSetExecutions } from "../sets";
import { getTranslationSourceHash, getTranslationStateIssues } from "../translationWorkflow";

const XLIFF = "urn:oasis:names:tc:xliff:document:2.0";
const NATIVE = "urn:messagevisor:xliff:1";
const XML = "http://www.w3.org/XML/1998/namespace";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const MAX_INPUT_BYTES = 16 * 1024 * 1024;

function fail(message: string, code = "invalid_xliff"): never {
  throw new MessagevisorCLIError(message, { code });
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function escape(value: string) {
  // XML 1.0 excludes these characters even when represented as references.
  if (/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(value)) {
    fail("Text contains a character XML 1.0 cannot represent.");
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;")
    .replace(/\t/g, "&#9;");
}

interface ProtectedText {
  xml: string;
  codes: Record<string, string>;
  literals: Array<{ raw: string; value: string; inPlural: boolean } | undefined>;
}

/** Expose literal spans only. Syntax and rich tags remain exact protected codes. */
export function protectIcu(value: string, prefix: string): ProtectedText {
  const literals: Array<{ start: number; end: number; value: string; inPlural: boolean }> = [];
  function visit(elements: MessageFormatElement[], inPlural = false) {
    for (const element of elements) {
      if (element.type === TYPE.literal && element.location) {
        const { start, end } = element.location;
        literals.push({ start: start.offset, end: end.offset, value: element.value, inPlural });
      } else if (element.type === TYPE.tag) visit(element.children, inPlural);
      else if (element.type === TYPE.plural || element.type === TYPE.select) {
        Object.values(element.options).forEach((option) =>
          visit(option.value, element.type === TYPE.plural),
        );
      }
    }
  }
  try {
    visit(parse(value, { captureLocation: true, shouldParseSkeletons: false }));
  } catch {
    fail("Native XLIFF requires valid ICU text; unsupported text cannot be flattened.");
  }
  literals.sort((a, b) => a.start - b.start);
  const codes: Record<string, string> = {};
  let xml = "";
  let offset = 0;
  let codeCount = 0;
  const slots: ProtectedText["literals"] = [];
  function protect(text: string) {
    if (!text) return;
    const id = `${prefix}${++codeCount}`;
    codes[id] = text;
    xml += `<ph id="${id}" dataRef="${id}" canCopy="no" canDelete="no" canReorder="no"/>`;
  }
  for (const literal of literals) {
    protect(value.slice(offset, literal.start));
    slots[codeCount] = {
      raw: value.slice(literal.start, literal.end),
      value: literal.value,
      inPlural: literal.inPlural,
    };
    xml += escape(literal.value);
    offset = literal.end;
  }
  protect(value.slice(offset));
  return { xml, codes, literals: slots };
}

interface Identity {
  set?: string;
  messageKey: string;
  overrideKey?: string;
  sourceLocale: string;
  targetLocale: string;
}
interface Unit {
  identity: Identity;
  id: string;
  source: string;
  target?: string;
  origin: "direct" | "inherited" | "missing";
  sourceFingerprint: string;
  targetFingerprint: string;
  state: "initial" | "translated" | "reviewed";
  sourceHash: string;
  workflow: string;
  notes: Record<string, string>;
}

function unitFor(
  identity: Identity,
  group: Message | Override,
  locales: Record<string, Locale>,
): Unit {
  const source = resolveLocaleValue(group.translations, identity.sourceLocale, locales);
  if (!source)
    fail(
      `Unit "${identity.messageKey}" has no effective source translation. Target only units are not supported.`,
    );
  const target = resolveLocaleValue(group.translations, identity.targetLocale, locales);
  const state = group.translationStates?.[target?.sourceLocale ?? identity.targetLocale];
  const issues = getTranslationStateIssues(target?.value ?? "", state, source.value);
  const notes: Record<string, string> = {};
  if (group.description !== undefined) notes.description = group.description;
  if (group.summary !== undefined) notes.summary = group.summary;
  if (group.translatorContext) notes.translatorContext = JSON.stringify(group.translatorContext);
  const routing =
    "segments" in group || "conditions" in group
      ? { segments: (group as Override).segments, conditions: (group as Override).conditions }
      : undefined;
  return {
    identity,
    id: `u${hash(identity)}`,
    source: source.value,
    target: target?.value,
    origin: target ? (target.direct ? "direct" : "inherited") : "missing",
    sourceFingerprint: hash({ source, routing }),
    targetFingerprint: hash({ target: target ?? null, state: state ?? null }),
    sourceHash: getTranslationSourceHash(source.value),
    state: !state || state.status === "draft" || issues.length ? "initial" : state.status,
    workflow: JSON.stringify({ state: state ?? null, issues: issues.map((issue) => issue.code) }),
    notes,
  };
}

function serializeUnit(unit: Unit) {
  const { identity } = unit;
  const source = protectIcu(unit.source, "s");
  const target = unit.target === undefined ? { xml: "", codes: {} } : protectIcu(unit.target, "t");
  const notes = Object.entries(unit.notes)
    .map(([category, value]) => `<note category="${category}">${escape(value)}</note>`)
    .join("");
  const data = Object.entries({ ...source.codes, ...target.codes })
    .map(([id, value]) => `<data id="${id}" xml:space="preserve">${escape(value)}</data>`)
    .join("");
  return (
    `    <unit id="${unit.id}" mv:set="${escape(identity.set ?? "")}" mv:messageKey="${escape(identity.messageKey)}" mv:overrideKey="${escape(identity.overrideKey ?? "")}" mv:sourceFingerprint="${unit.sourceFingerprint}" mv:targetFingerprint="${unit.targetFingerprint}" mv:origin="${unit.origin}" mv:sourceHash="${unit.sourceHash}" mv:workflow="${escape(unit.workflow)}">\n` +
    (notes ? `      <notes>${notes}</notes>\n` : "") +
    (data ? `      <originalData>${data}</originalData>\n` : "") +
    `      <segment id="1" state="${unit.state}"><source xml:space="preserve">${source.xml}</source><target xml:space="preserve">${target.xml}</target></segment>\n    </unit>`
  );
}

export function createXliff(rows: ExportRow[], sourceLocale: string, targetLocale: string) {
  if (!sourceLocale || !targetLocale || sourceLocale === targetLocale)
    fail("XLIFF requires distinct sourceLocale and one target locale.", "invalid_option");
  const seen = new Set<string>();
  const units = rows
    .map((row) => {
      for (const locale of [sourceLocale, targetLocale]) {
        if (!Object.hasOwn(row.sourceLocales, locale))
          fail(`Unknown locale "${locale}".`, "unknown_locale");
      }
      const unit = unitFor(
        { set: row.set, ...row.identity, sourceLocale, targetLocale },
        row.group,
        row.sourceLocales,
      );
      if (seen.has(unit.id)) fail(`Duplicate XLIFF identity "${row.identity.messageKey}".`);
      seen.add(unit.id);
      return unit;
    })
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xliff xmlns="${XLIFF}" xmlns:mv="${NATIVE}" version="2.0" srcLang="${escape(sourceLocale)}" trgLang="${escape(targetLocale)}" mv:profile="1">\n  <file id="messagevisor">\n${units.map(serializeUnit).join("\n")}\n  </file>\n</xliff>\n`;
}

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: Array<XmlNode | string>;
}
function attrKey(uri: string, local: string) {
  return uri ? `{${uri}}${local}` : local;
}
function native(local: string) {
  return attrKey(NATIVE, local);
}

function parseXml(content: string): XmlNode {
  if (Buffer.byteLength(content, "utf8") > MAX_INPUT_BYTES)
    fail("XLIFF exceeds the 16 MiB input limit.");
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  let count = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on("error", (error) => fail(`Invalid XLIFF XML: ${error.message}`));
  parser.on("doctype", () => fail("XLIFF DTDs and external entities are unsupported."));
  parser.on("processinginstruction", () => fail("XLIFF processing instructions are unsupported."));
  parser.on("opentag", (tag) => {
    if (++count > 100000 || stack.length >= 64) fail("XLIFF structure exceeds safety limits.");
    if (tag.uri !== XLIFF) fail(`Unsupported XLIFF element namespace: ${tag.name}.`);
    const node: XmlNode = { name: tag.local, attrs: {}, children: [] };
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.uri !== XMLNS)
        node.attrs[attrKey(attribute.uri, attribute.local)] = attribute.value;
    }
    if (stack.length) stack[stack.length - 1].children.push(node);
    else root = node;
    stack.push(node);
  });
  const text = (value: string) => {
    // Empty CDATA is semantically empty, just like a self closing target.
    // Preserve actual whitespace, which can be intentional translated copy.
    if (stack.length && value !== "") stack[stack.length - 1].children.push(value);
  };
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("closetag", () => {
    stack.pop();
  });
  try {
    parser.write(content).close();
  } catch (error) {
    if (error instanceof MessagevisorCLIError) throw error;
    fail("Invalid XLIFF XML.");
  }
  if (!root || root.name !== "xliff") fail("Expected an XLIFF document.");
  return root;
}

function attributes(node: XmlNode, allowed: string[], required: string[] = []) {
  for (const key of Object.keys(node.attrs))
    if (!allowed.includes(key)) fail(`Unsupported ${node.name} attribute "${key}".`);
  for (const key of required)
    if (!Object.hasOwn(node.attrs, key)) fail(`Missing ${node.name} attribute "${key}".`);
}

function children(node: XmlNode, allowed: string[]) {
  const result: XmlNode[] = [];
  for (const child of node.children) {
    if (typeof child === "string") {
      if (child.trim()) fail(`Unexpected text in ${node.name}.`);
    } else {
      if (!allowed.includes(child.name))
        fail(`Unsupported XLIFF structure ${child.name} in ${node.name}.`);
      result.push(child);
    }
  }
  return result;
}

function single(nodes: XmlNode[], name: string, required = true): XmlNode | undefined {
  const found = nodes.filter((node) => node.name === name);
  if (found.length > 1 || (required && found.length !== 1))
    fail(`Expected ${required ? "one" : "at most one"} ${name}.`);
  return found[0];
}

function textOnly(node: XmlNode) {
  if (node.children.some((child) => typeof child !== "string"))
    fail(`Unsupported inline structure in ${node.name}.`);
  return node.children.join("");
}

function decodeText(node: XmlNode, codes: Record<string, string>, baseline: ProtectedText) {
  const expected = Object.keys(baseline.codes);
  attributes(node, [attrKey(XML, "space")]);
  if (node.attrs[attrKey(XML, "space")] && node.attrs[attrKey(XML, "space")] !== "preserve")
    fail("Native XLIFF requires preserved whitespace.");
  const used: string[] = [];
  const slots = [""];
  for (const child of node.children) {
    if (typeof child === "string") {
      slots[slots.length - 1] += child;
      continue;
    }
    if (child.name !== "ph")
      fail(
        `Unsupported inline structure "${child.name}". Native XLIFF accepts protected ph codes only.`,
      );
    attributes(child, ["id", "dataRef", "canCopy", "canDelete", "canReorder"], ["id", "dataRef"]);
    const id = child.attrs.dataRef;
    if (child.children.length || child.attrs.id !== id || !Object.hasOwn(codes, id))
      fail("Invalid protected XLIFF code.");
    for (const name of ["canCopy", "canDelete", "canReorder"])
      if (child.attrs[name] && child.attrs[name] !== "no")
        fail("Protected code permissions cannot be changed.");
    used.push(id);
    slots.push("");
  }
  if (JSON.stringify(used) !== JSON.stringify(expected))
    fail("Protected XLIFF codes were removed, duplicated, reordered, or replaced.");
  const value = slots
    .map((text, index) => {
      const literal = baseline.literals[index];
      // Unchanged prose retains its exact authored spelling, including ICU quoting.
      // Edited prose is encoded as literal text, never interpreted as new ICU syntax.
      const escaped = text.replace(/'/g, "''");
      const encoded =
        literal?.value === text
          ? literal.raw
          : escaped.replace(
              literal?.inPlural ? /[{}<#][\s\S]*/ : /[{}<][\s\S]*/,
              (tail) => `'${tail}'`,
            );
      return encoded + (index < expected.length ? codes[expected[index]] : "");
    })
    .join("");
  const reconstructed = Object.values(protectIcu(value, "check").codes);
  if (reconstructed.join("") !== expected.map((id) => codes[id]).join(""))
    fail("Returned text changes protected ICU structure.");
  return value;
}

interface ReturnedUnit {
  node: XmlNode;
  identity: Identity;
  source: XmlNode;
  target?: XmlNode;
  data: Record<string, string>;
  state: Unit["state"];
}

function readUnits(content: string, options: ImportProjectOptions, sourceLocale?: string) {
  const root = parseXml(content);
  attributes(
    root,
    ["version", "srcLang", "trgLang", native("profile")],
    ["version", "srcLang", "trgLang", native("profile")],
  );
  if (root.attrs.version !== "2.0" || root.attrs[native("profile")] !== "1")
    fail("Only Messagevisor native XLIFF 2.0 profile 1 is supported.");
  if (!root.attrs.srcLang || !root.attrs.trgLang || root.attrs.srcLang === root.attrs.trgLang)
    fail("XLIFF source and target locales must be distinct and nonempty.");
  const requested =
    options.locale === undefined
      ? []
      : Array.isArray(options.locale)
        ? options.locale
        : [options.locale];
  if (
    requested.length > 1 ||
    (requested.length === 1 && requested[0] !== root.attrs.trgLang) ||
    (sourceLocale && sourceLocale !== root.attrs.srcLang)
  )
    fail("XLIFF locale mismatch.", "import_conflict");
  const file = single(children(root, ["file"]), "file")!;
  attributes(file, ["id"], ["id"]);
  if (file.attrs.id !== "messagevisor") fail("Unsupported XLIFF file identity.");
  const seen = new Set<string>();
  return children(file, ["unit"]).map((node): ReturnedUnit => {
    const names = [
      "set",
      "messageKey",
      "overrideKey",
      "sourceFingerprint",
      "targetFingerprint",
      "origin",
      "sourceHash",
      "workflow",
    ].map(native);
    attributes(node, ["id", ...names], ["id", ...names]);
    const identity: Identity = {
      set: node.attrs[native("set")] || undefined,
      messageKey: node.attrs[native("messageKey")],
      overrideKey: node.attrs[native("overrideKey")] || undefined,
      sourceLocale: root.attrs.srcLang,
      targetLocale: root.attrs.trgLang,
    };
    if (!identity.messageKey || node.attrs.id !== `u${hash(identity)}`)
      fail("Invalid native XLIFF unit identity.");
    if (seen.has(node.attrs.id)) fail("Duplicate XLIFF unit.", "import_conflict");
    seen.add(node.attrs.id);
    const parts = children(node, ["notes", "originalData", "segment"]);
    const notes = single(parts, "notes", false);
    if (notes) {
      attributes(notes, []);
      for (const note of children(notes, ["note"])) {
        attributes(note, ["category"]);
        textOnly(note);
      }
    }
    const originalData = single(parts, "originalData", false);
    const data: Record<string, string> = Object.create(null);
    if (originalData) {
      attributes(originalData, []);
      for (const entry of children(originalData, ["data"])) {
        attributes(entry, ["id", attrKey(XML, "space")], ["id"]);
        if (Object.hasOwn(data, entry.attrs.id)) fail("Duplicate originalData identity.");
        data[entry.attrs.id] = textOnly(entry);
      }
    }
    const segment = single(parts, "segment")!;
    attributes(segment, ["id", "state"], ["id", "state"]);
    if (
      segment.attrs.id !== "1" ||
      !["initial", "translated", "reviewed"].includes(segment.attrs.state)
    )
      fail("Unsupported XLIFF segment or state.");
    const texts = children(segment, ["source", "target"]);
    return {
      node,
      identity,
      source: single(texts, "source")!,
      target: single(texts, "target", false),
      data,
      state: segment.attrs.state as Unit["state"],
    };
  });
}

function rowFor(returned: ReturnedUnit, index: number, options: ImportProjectOptions): ImportRow {
  const row: ImportRow = {
    rowNumber: index + 1,
    set: returned.identity.set,
    messageKey: returned.identity.messageKey,
    overrideKey: returned.identity.overrideKey,
    explicitIdentity: true,
    values: {},
    forceDirect: true,
    sourceLocale: returned.identity.sourceLocale,
  };
  row.validate = (message, locales) => {
    const { identity, node } = returned;
    const group = identity.overrideKey
      ? message?.overrides?.find((override) => override.key === identity.overrideKey)
      : message;
    if (!message || message.archived || !group)
      fail(`Unknown, removed, or archived XLIFF unit "${identity.messageKey}".`, "import_conflict");
    for (const locale of [identity.sourceLocale, identity.targetLocale])
      if (!Object.hasOwn(locales, locale)) fail(`Unknown locale "${locale}".`, "import_conflict");
    const current = unitFor(identity, group, locales);
    for (const name of [
      "sourceFingerprint",
      "targetFingerprint",
      "sourceHash",
      "origin",
      "workflow",
    ] as const) {
      if (node.attrs[native(name)] !== current[name])
        fail(
          `XLIFF ${name} conflict for "${identity.messageKey}". Export again before importing.`,
          "import_conflict",
        );
    }
    const source = protectIcu(current.source, "s");
    const target =
      current.target === undefined
        ? { xml: "", codes: {}, literals: [] }
        : protectIcu(current.target, "t");
    const codes = { ...source.codes, ...target.codes };
    if (
      Object.keys(codes).length !== Object.keys(returned.data).length ||
      Object.entries(codes).some(([id, value]) => returned.data[id] !== value)
    )
      fail("Protected originalData differs from the export baseline.", "import_conflict");
    if (decodeText(returned.source, codes, source) !== current.source)
      fail("Returned XLIFF source was edited.", "import_conflict");
    if (!returned.target) return;
    attributes(returned.target, [attrKey(XML, "space")]);
    const empty = returned.target.children.length === 0;
    const value = empty
      ? ""
      : decodeText(returned.target, codes, current.target === undefined ? source : target);
    if (current.origin === "inherited" && !options.materializeInherited) return;
    if (current.origin === "missing" && value === "" && options.emptyValues !== "empty") return;
    if (value === "" && options.emptyValues !== "empty" && options.emptyValues !== "delete") return;
    row.values = { [identity.targetLocale]: value };
    // Unchanged native state is metadata, not a request to refresh stale review hashes.
    if (returned.state !== current.state || value !== current.target) {
      row.translationState = (
        { initial: "draft", translated: "translated", reviewed: "reviewed" } as Record<
          Unit["state"],
          TranslationStatus
        >
      )[returned.state];
      if (value !== current.target && row.translationState === "reviewed")
        row.translationState = "translated";
    }
  };
  return row;
}

async function readInput(inputFilePath: string): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of fs.createReadStream(inputFilePath, { highWaterMark: 64 * 1024 })) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail("XLIFF exceeds the 16 MiB input limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

export async function importXliff(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  inputFilePath: string,
  options: ImportProjectOptions,
) {
  if (
    options.createMissing ||
    options.prune ||
    options.fromJson ||
    options.jsonPath ||
    options.delimiter !== undefined ||
    options.bom !== undefined
  )
    fail(
      "XLIFF does not support createMissing, prune, fromJson, jsonPath, delimiter, or bom.",
      "invalid_option",
    );
  const startTime = Date.now();
  const units = readUnits(
    await readInput(inputFilePath),
    options,
    options.sourceLocale ?? projectConfig.sourceLocale,
  );
  const rows = units.map((unit, index) => rowFor(unit, index, options));
  const requestedSets =
    options.set === undefined ? [] : Array.isArray(options.set) ? options.set : [options.set];
  const executions: Array<{ set?: string; datasource: Datasource }> = projectConfig.sets
    ? await getProjectSetExecutions(projectConfig, datasource, undefined)
    : [{ datasource }];
  for (const set of requestedSets)
    if (!executions.some((entry) => entry.set === set))
      fail(`Unknown set "${set}".`, "unknown_set");
  for (const row of rows)
    if (!executions.some((entry) => entry.set === row.set))
      fail(`Unknown XLIFF set "${row.set ?? "(root)"}".`, "import_conflict");
  const batches: Array<{
    datasource: Datasource;
    plans: Awaited<ReturnType<typeof collectImportPlansForDatasource>>["plans"];
  }> = [];
  const warnings: string[] = [];
  let skippedRows = 0;
  let skippedCells = 0;
  let prunedTranslations = 0;
  for (const execution of executions) {
    if (requestedSets.length && !requestedSets.includes(execution.set!)) {
      skippedRows += rows.filter((row) => row.set === execution.set).length;
      continue;
    }
    const collected = await collectImportPlansForDatasource(
      execution.datasource,
      rows.filter((row) => row.set === execution.set),
      { emptyValues: options.emptyValues },
      execution.set,
      warnings,
    );
    batches.push({ datasource: execution.datasource, plans: collected.plans });
    skippedRows += collected.skippedRows;
    skippedCells += collected.skippedCells;
    prunedTranslations += collected.prunedTranslations;
  }
  if (options.apply) {
    for (const batch of batches) await writePlans(batch.datasource, batch.plans, true);
    for (const batch of batches) await writePlans(batch.datasource, batch.plans);
  }
  return createResult(
    inputFilePath,
    options.apply === true,
    startTime,
    rows.length,
    batches.flatMap((batch) => batch.plans),
    skippedRows,
    skippedCells,
    prunedTranslations,
    warnings,
  );
}
