import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { gzipSync } from "zlib";

import type { CustomParser } from "@messagevisor/parsers";
import type {
  Attribute,
  DatafileContent,
  Locale,
  Message,
  Target,
  Segment,
  Test,
} from "@messagevisor/types";

import { formatDatafilePath, type ProjectConfig } from "../config";
import {
  Adapter,
  type ApplyEntityMutationsOptions,
  type EntityDocument,
  type EntityMutation,
  type EntityMutationResult,
  type EntityType,
} from "./adapter";
import { assertPathWithinDirectory, assertValidEntityKey, omitDerivedEntityKey } from "./entityKey";
import type { DatafileFile, WriteDatafileOptions } from "./index";

const ENTITY_DIRECTORIES: Record<EntityType, keyof ProjectConfig> = {
  locale: "localesDirectoryPath",
  message: "messagesDirectoryPath",
  segment: "segmentsDirectoryPath",
  attribute: "attributesDirectoryPath",
  target: "targetsDirectoryPath",
  test: "testsDirectoryPath",
};

const TEST_SPEC_SUFFIX = ".spec";
let atomicWriteSequence = 0;

export class FilesystemAdapter extends Adapter {
  private get parser() {
    return this.config.parser as CustomParser;
  }

  private getEntityDirectory(type: EntityType) {
    return this.config[ENTITY_DIRECTORIES[type]] as string;
  }

  async listSets(): Promise<string[]> {
    if (!this.config.sets || !fs.existsSync(this.config.setsDirectoryPath)) {
      return [];
    }

    const entries = await fs.promises.readdir(this.config.setsDirectoryPath, {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  private getEntityPath(type: EntityType, key: string) {
    const segments = assertValidEntityKey(this.config, key);
    const extension = `.${this.parser.extension}`;
    const directoryPath = this.getEntityDirectory(type);
    const basePath = assertPathWithinDirectory(
      directoryPath,
      path.join(directoryPath, ...segments),
    );

    if (type === "test") {
      const specPath = `${basePath}${TEST_SPEC_SUFFIX}${extension}`;

      if (fs.existsSync(specPath)) {
        return specPath;
      }

      const legacyPath = `${basePath}${extension}`;

      if (fs.existsSync(legacyPath)) {
        return legacyPath;
      }

      return specPath;
    }

    return `${basePath}${extension}`;
  }

  private getEntityWritePath(type: EntityType, key: string) {
    const directoryPath = this.getEntityDirectory(type);
    const segments = assertValidEntityKey(this.config, key);
    return assertPathWithinDirectory(
      directoryPath,
      path.join(directoryPath, ...segments) +
        `${type === "test" ? TEST_SPEC_SUFFIX : ""}.${this.parser.extension}`,
    );
  }

  private getKeyFromEntityPath(type: EntityType, directoryPath: string, filePath: string) {
    const extension = `.${this.parser.extension}`;
    const relativePath = path.relative(directoryPath, filePath).slice(0, -extension.length);
    const pathSegments = relativePath.split(path.sep);

    if (type === "test") {
      const lastSegment = pathSegments[pathSegments.length - 1];

      if (lastSegment.endsWith(TEST_SPEC_SUFFIX)) {
        pathSegments[pathSegments.length - 1] = lastSegment.slice(0, -TEST_SPEC_SUFFIX.length);
      }
    }

    return pathSegments.join(this.config.namespaceCharacter);
  }

  private assertReservedCharactersNotInPathName(
    type: EntityType,
    entryName: string,
    entryPath: string,
    isFile: boolean,
  ) {
    let nameToCheck = isFile ? entryName.slice(0, -`.${this.parser.extension}`.length) : entryName;

    if (type === "test" && isFile && nameToCheck.endsWith(TEST_SPEC_SUFFIX)) {
      nameToCheck = nameToCheck.slice(0, -TEST_SPEC_SUFFIX.length);
    }

    const reservedCharacters = [
      ["namespaceCharacter", this.config.namespaceCharacter],
      ["exportOverrideKeySeparator", this.config.exportOverrideKeySeparator],
    ];

    for (const [label, reservedCharacter] of reservedCharacters) {
      if (!reservedCharacter || !nameToCheck.includes(reservedCharacter)) {
        continue;
      }

      throw new Error(
        `Invalid ${type} path "${entryPath}": ${label} "${reservedCharacter}" is not allowed in directory or file names.`,
      );
    }
  }

  private async readFile<T>(filePath: string): Promise<T> {
    const content = await fs.promises.readFile(filePath, "utf8");
    return this.parser.parse<T>(content, filePath);
  }

  private getContentVersion(content: string | Buffer) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private async getFileVersion(filePath: string): Promise<string | null> {
    try {
      return this.getContentVersion(await fs.promises.readFile(filePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  private async writeFile(filePath: string, content: unknown) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await this.writeTextAtomically(filePath, this.parser.stringify(content, filePath));
  }

  private async writeTextAtomically(filePath: string, content: string | Buffer) {
    const temporaryPath = path.join(
      path.dirname(filePath),
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${atomicWriteSequence++}.tmp`,
    );
    await fs.promises.writeFile(temporaryPath, content);

    try {
      await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
      await fs.promises.rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async listEntities(type: EntityType): Promise<string[]> {
    const directoryPath = this.getEntityDirectory(type);

    if (!fs.existsSync(directoryPath)) {
      return [];
    }

    const extension = `.${this.parser.extension}`;
    const files: string[] = [];

    const assertReservedCharactersNotInPathName =
      this.assertReservedCharactersNotInPathName.bind(this);

    async function walk(currentDirectoryPath: string) {
      const entries = await fs.promises.readdir(currentDirectoryPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentDirectoryPath, entry.name);

        if (entry.isDirectory()) {
          assertReservedCharactersNotInPathName(type, entry.name, entryPath, false);
          await walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith(extension)) {
          assertReservedCharactersNotInPathName(type, entry.name, entryPath, true);
          files.push(entryPath);
        }
      }
    }

    await walk(directoryPath);

    return Array.from(
      new Set(files.map((filePath) => this.getKeyFromEntityPath(type, directoryPath, filePath))),
    ).sort();
  }

  async entityExists(type: EntityType, key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.getEntityPath(type, key));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async readEntity<T>(type: EntityType, key: string): Promise<T> {
    const entity = await this.readFile<T>(this.getEntityPath(type, key));

    return { ...(entity as Record<string, unknown>), key } as T;
  }

  async readEntityDocument<T>(type: EntityType, key: string): Promise<EntityDocument<T>> {
    const filePath = this.getEntityPath(type, key);
    const content = await fs.promises.readFile(filePath, "utf8");
    const entity = this.parser.parse<T>(content, filePath);

    return {
      type,
      key,
      entity: { ...(entity as Record<string, unknown>), key } as T,
      version: this.getContentVersion(content),
    };
  }

  async writeEntity<T>(type: EntityType, key: string, entity: T): Promise<T> {
    const persistedEntity = omitDerivedEntityKey(entity);
    await this.writeFile(this.getEntityWritePath(type, key), persistedEntity);
    return { ...(persistedEntity as Record<string, unknown>), key } as T;
  }

  async deleteEntity(type: EntityType, key: string): Promise<void> {
    const entityPath = this.getEntityPath(type, key);

    if (fs.existsSync(entityPath)) {
      await fs.promises.unlink(entityPath);
    }
  }

  async applyEntityMutations(
    mutations: EntityMutation[],
    options: ApplyEntityMutationsOptions = {},
  ): Promise<EntityMutationResult[]> {
    const identities = mutations.map((mutation) => `${mutation.type}\0${mutation.key}`);
    if (new Set(identities).size !== identities.length) {
      throw new Error("A mutation batch cannot contain the same entity more than once.");
    }
    const snapshots = new Map<string, Buffer | null>();
    const paths = mutations.map((mutation) => this.getEntityWritePath(mutation.type, mutation.key));

    for (let index = 0; index < mutations.length; index++) {
      const mutation = mutations[index];
      const filePath = paths[index];
      const version = await this.getFileVersion(filePath);

      if (typeof mutation.expectedVersion !== "undefined" && mutation.expectedVersion !== version) {
        throw new Error(
          `Entity conflict for ${mutation.type} "${mutation.key}": expected version ${mutation.expectedVersion ?? "missing"}, found ${version ?? "missing"}.`,
        );
      }

      if (!snapshots.has(filePath)) {
        snapshots.set(filePath, version === null ? null : await fs.promises.readFile(filePath));
      }
    }

    if (options.dryRun) {
      return mutations.map((mutation, index) => {
        if (mutation.operation === "delete") {
          return { type: mutation.type, key: mutation.key, operation: "delete", version: null };
        }
        const content = this.parser.stringify(omitDerivedEntityKey(mutation.entity), paths[index]);
        return {
          type: mutation.type,
          key: mutation.key,
          operation: "write",
          version: this.getContentVersion(content),
        };
      });
    }

    const results: EntityMutationResult[] = [];

    try {
      for (let index = 0; index < mutations.length; index++) {
        const mutation = mutations[index];
        const filePath = paths[index];

        if (mutation.operation === "delete") {
          await fs.promises.rm(filePath, { force: true });
          results.push({ ...mutation, version: null });
          continue;
        }

        const persisted = omitDerivedEntityKey(mutation.entity);
        await this.writeFile(filePath, persisted);
        results.push({
          type: mutation.type,
          key: mutation.key,
          operation: mutation.operation,
          version: await this.getFileVersion(filePath),
        });
      }
    } catch (error) {
      for (const [filePath, content] of Array.from(snapshots.entries()).reverse()) {
        if (content === null) await fs.promises.rm(filePath, { force: true });
        else await this.writeTextAtomically(filePath, content);
      }
      throw error;
    }

    return results;
  }

  async readRevision() {
    const revisionFilePath = path.join(
      this.config.stateDirectoryPath,
      this.config.revisionFileName,
    );

    if (!fs.existsSync(revisionFilePath)) {
      return "0";
    }

    return (await fs.promises.readFile(revisionFilePath, "utf8")).trim() || "0";
  }

  async writeRevision(revision: string) {
    await fs.promises.mkdir(this.config.stateDirectoryPath, { recursive: true });
    await this.writeTextAtomically(
      path.join(this.config.stateDirectoryPath, this.config.revisionFileName),
      revision,
    );
  }

  async writeDatafile(datafileContent: DatafileContent, options: WriteDatafileOptions = {}) {
    const datafilePath = path.join(
      this.config.datafilesDirectoryPath,
      formatDatafilePath(this.config, datafileContent.target, datafileContent.locale),
    );

    await fs.promises.mkdir(path.dirname(datafilePath), { recursive: true });
    await this.writeTextAtomically(
      datafilePath,
      options.pretty ? JSON.stringify(datafileContent, null, 2) : JSON.stringify(datafileContent),
    );
  }

  async listDatafiles(): Promise<DatafileFile[]> {
    const directoryPath = this.config.datafilesDirectoryPath;

    if (!fs.existsSync(directoryPath)) {
      return [];
    }

    const files: string[] = [];

    async function walk(currentDirectoryPath: string) {
      const entries = await fs.promises.readdir(currentDirectoryPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentDirectoryPath, entry.name);

        if (entry.isDirectory()) {
          await walk(entryPath);
        } else if (entry.isFile()) {
          files.push(entryPath);
        }
      }
    }

    await walk(directoryPath);

    const datafiles = await Promise.all(
      files
        .filter((filePath) => path.basename(filePath) !== this.config.revisionFileName)
        .filter((filePath) => !path.basename(filePath).startsWith("."))
        .map(async (filePath) => {
          const content = await fs.promises.readFile(filePath);

          return {
            path: path.relative(directoryPath, filePath).split(path.sep).join("/"),
            size: content.length,
            gzipSize: gzipSync(content).length,
          };
        }),
    );

    return datafiles.sort((a, b) => a.path.localeCompare(b.path));
  }

  async readDatafile(target: string, locale: string): Promise<DatafileContent> {
    const datafilePath = path.join(
      this.config.datafilesDirectoryPath,
      formatDatafilePath(this.config, target, locale),
    );
    return JSON.parse(await fs.promises.readFile(datafilePath, "utf8"));
  }

  listLocales() {
    return this.listEntities("locale");
  }

  readLocale(key: string) {
    return this.readEntity<Locale>("locale", key);
  }

  writeLocale(key: string, locale: Locale) {
    return this.writeEntity<Locale>("locale", key, locale);
  }

  listMessages() {
    return this.listEntities("message");
  }

  readMessage(key: string) {
    return this.readEntity<Message>("message", key);
  }

  writeMessage(key: string, message: Message) {
    return this.writeEntity<Message>("message", key, message);
  }

  listSegments() {
    return this.listEntities("segment");
  }

  readSegment(key: string) {
    return this.readEntity<Segment>("segment", key);
  }

  writeSegment(key: string, segment: Segment) {
    return this.writeEntity<Segment>("segment", key, segment);
  }

  listAttributes() {
    return this.listEntities("attribute");
  }

  readAttribute(key: string) {
    return this.readEntity<Attribute>("attribute", key);
  }

  writeAttribute(key: string, attribute: Attribute) {
    return this.writeEntity<Attribute>("attribute", key, attribute);
  }

  listTargets() {
    return this.listEntities("target");
  }

  readTarget(key: string) {
    return this.readEntity<Target>("target", key);
  }

  writeTarget(key: string, target: Target) {
    return this.writeEntity<Target>("target", key, target);
  }

  listTests() {
    return this.listEntities("test");
  }

  readTest(key: string) {
    return this.readEntity<Test>("test", key);
  }

  writeTest(key: string, test: Test) {
    return this.writeEntity<Test>("test", key, test);
  }
}
