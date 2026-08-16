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
import type { Adapter, ApplyEntityMutationsOptions, EntityMutation, EntityType } from "./adapter";

export * from "./adapter";

export interface WriteDatafileOptions {
  pretty?: boolean;
}

export interface DatafileFile {
  path: string;
  size: number;
  gzipSize: number;
}

export class Datasource {
  private adapter: Adapter;
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

  listEntities(entityType: EntityType) {
    return this.adapter.listEntities(entityType);
  }

  entityExists(entityType: EntityType, entityKey: string) {
    return this.adapter.entityExists(entityType, entityKey);
  }

  readEntity<T>(entityType: EntityType, entityKey: string) {
    return this.adapter.readEntity<T>(entityType, entityKey);
  }

  getEntityFingerprint(entityType: EntityType, entityKey: string) {
    return this.adapter.getEntityFingerprint?.(entityType, entityKey) || Promise.resolve(undefined);
  }

  getSnapshotCachePath() {
    return this.adapter.getSnapshotCachePath?.();
  }

  readEntityDocument<T>(entityType: EntityType, entityKey: string) {
    return this.adapter.readEntityDocument<T>(entityType, entityKey);
  }

  writeEntity<T>(entityType: EntityType, entityKey: string, entity: T) {
    return this.adapter.writeEntity(entityType, entityKey, entity);
  }

  deleteEntity(entityType: EntityType, entityKey: string) {
    return this.adapter.deleteEntity(entityType, entityKey);
  }

  applyEntityMutations(mutations: EntityMutation[], options?: ApplyEntityMutationsOptions) {
    return this.adapter.applyEntityMutations(mutations, options);
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

  listDatafiles(): Promise<DatafileFile[]> {
    return typeof this.adapter.listDatafiles === "function"
      ? this.adapter.listDatafiles()
      : Promise.resolve([]);
  }

  readDatafile(target: string, locale: string) {
    return this.adapter.readDatafile(target, locale);
  }

  listLocales() {
    return this.adapter.listEntities("locale");
  }

  localeExists(localeKey: string) {
    return this.adapter.entityExists("locale", localeKey);
  }

  readLocale(localeKey: string): Promise<Locale> {
    return this.adapter.readEntity<Locale>("locale", localeKey);
  }

  writeLocale(localeKey: string, locale: Locale) {
    return this.adapter.writeEntity("locale", localeKey, locale);
  }

  deleteLocale(localeKey: string) {
    return this.adapter.deleteEntity("locale", localeKey);
  }

  listMessages() {
    return this.adapter.listEntities("message");
  }

  messageExists(messageKey: string) {
    return this.adapter.entityExists("message", messageKey);
  }

  readMessage(messageKey: string): Promise<Message> {
    return this.adapter.readEntity<Message>("message", messageKey);
  }

  writeMessage(messageKey: string, message: Message) {
    return this.adapter.writeEntity("message", messageKey, message);
  }

  deleteMessage(messageKey: string) {
    return this.adapter.deleteEntity("message", messageKey);
  }

  listSegments() {
    return this.adapter.listEntities("segment");
  }

  segmentExists(segmentKey: string) {
    return this.adapter.entityExists("segment", segmentKey);
  }

  readSegment(segmentKey: string): Promise<Segment> {
    return this.adapter.readEntity<Segment>("segment", segmentKey);
  }

  writeSegment(segmentKey: string, segment: Segment) {
    return this.adapter.writeEntity("segment", segmentKey, segment);
  }

  deleteSegment(segmentKey: string) {
    return this.adapter.deleteEntity("segment", segmentKey);
  }

  listAttributes() {
    return this.adapter.listEntities("attribute");
  }

  attributeExists(attributeKey: string) {
    return this.adapter.entityExists("attribute", attributeKey);
  }

  readAttribute(attributeKey: string): Promise<Attribute> {
    return this.adapter.readEntity<Attribute>("attribute", attributeKey);
  }

  writeAttribute(attributeKey: string, attribute: Attribute) {
    return this.adapter.writeEntity("attribute", attributeKey, attribute);
  }

  deleteAttribute(attributeKey: string) {
    return this.adapter.deleteEntity("attribute", attributeKey);
  }

  listTargets() {
    return this.adapter.listEntities("target");
  }

  targetExists(targetKey: string) {
    return this.adapter.entityExists("target", targetKey);
  }

  readTarget(targetKey: string): Promise<Target> {
    return this.adapter.readEntity<Target>("target", targetKey);
  }

  writeTarget(targetKey: string, target: Target) {
    return this.adapter.writeEntity("target", targetKey, target);
  }

  deleteTarget(targetKey: string) {
    return this.adapter.deleteEntity("target", targetKey);
  }

  listTests() {
    return this.adapter.listEntities("test");
  }

  testExists(testKey: string) {
    return this.adapter.entityExists("test", testKey);
  }

  readTest(testKey: string): Promise<Test> {
    return this.adapter.readEntity<Test>("test", testKey);
  }

  writeTest(testKey: string, test: Test) {
    return this.adapter.writeEntity("test", testKey, test);
  }

  deleteTest(testKey: string) {
    return this.adapter.deleteEntity("test", testKey);
  }
}
