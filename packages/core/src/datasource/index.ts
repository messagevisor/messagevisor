import type {
  Attribute,
  DatafileContent,
  Locale,
  Message,
  Target,
  Segment,
  Test,
} from "@messagevisor/types";

import { getProjectConfigForSet, type ProjectConfig } from "../config";
import type { FilesystemAdapter } from "./filesystemAdapter";

export interface WriteDatafileOptions {
  pretty?: boolean;
}

export class Datasource {
  private adapter: FilesystemAdapter;
  private rootConfig: ProjectConfig;

  constructor(
    private config: ProjectConfig,
    private rootDirectoryPath?: string,
    private set?: string,
  ) {
    this.rootConfig = config;
    this.config = set ? getProjectConfigForSet(this.rootConfig, set) : config;
    this.adapter = new this.config.adapter(this.config, rootDirectoryPath);
  }

  getConfig() {
    return this.config;
  }

  getSet() {
    return this.set;
  }

  forSet(set: string) {
    return new Datasource(this.rootConfig, this.rootDirectoryPath, set);
  }

  listSets() {
    return this.adapter.listSets();
  }

  readRevision() {
    return this.adapter.readRevision();
  }

  writeRevision(revision: string) {
    return this.adapter.writeRevision(revision);
  }

  writeDatafile(datafileContent: DatafileContent, options: WriteDatafileOptions = {}) {
    return this.adapter.writeDatafile(datafileContent, options);
  }

  readDatafile(target: string, locale: string) {
    return this.adapter.readDatafile(target, locale);
  }

  listLocales() {
    return this.adapter.listLocales();
  }

  readLocale(localeKey: string): Promise<Locale> {
    return this.adapter.readLocale(localeKey);
  }

  writeLocale(localeKey: string, locale: Locale) {
    return this.adapter.writeLocale(localeKey, locale);
  }

  listMessages() {
    return this.adapter.listMessages();
  }

  readMessage(messageKey: string): Promise<Message> {
    return this.adapter.readMessage(messageKey);
  }

  writeMessage(messageKey: string, message: Message) {
    return this.adapter.writeMessage(messageKey, message);
  }

  listSegments() {
    return this.adapter.listSegments();
  }

  readSegment(segmentKey: string): Promise<Segment> {
    return this.adapter.readSegment(segmentKey);
  }

  writeSegment(segmentKey: string, segment: Segment) {
    return this.adapter.writeSegment(segmentKey, segment);
  }

  listAttributes() {
    return this.adapter.listAttributes();
  }

  readAttribute(attributeKey: string): Promise<Attribute> {
    return this.adapter.readAttribute(attributeKey);
  }

  writeAttribute(attributeKey: string, attribute: Attribute) {
    return this.adapter.writeAttribute(attributeKey, attribute);
  }

  listTargets() {
    return this.adapter.listTargets();
  }

  readTarget(targetKey: string): Promise<Target> {
    return this.adapter.readTarget(targetKey);
  }

  writeTarget(targetKey: string, target: Target) {
    return this.adapter.writeTarget(targetKey, target);
  }

  listTests() {
    return this.adapter.listTests();
  }

  readTest(testKey: string): Promise<Test> {
    return this.adapter.readTest(testKey);
  }

  writeTest(testKey: string, test: Test) {
    return this.adapter.writeTest(testKey, test);
  }
}
