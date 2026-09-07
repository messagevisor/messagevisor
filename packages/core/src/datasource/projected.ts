import { Datasource } from "./index";
import { Adapter, type EntityDocument, type EntityMutation, type EntityType } from "./adapter";
import { MessagevisorCLIError } from "../error";

/** A read only projection. Supplied documents must cover the complete source project. */
export function createProjectedDatasource(
  source: Datasource,
  mutations: EntityMutation[],
  documents?: EntityDocument<unknown>[],
): Datasource {
  const projected = new Map<EntityType, Map<string, EntityMutation>>();
  const reads = new Map<string, Promise<unknown>>();
  const lists = new Map<EntityType, Promise<string[]>>();
  const identity = (type: EntityType, key: string) => JSON.stringify([type, key]);

  for (const mutation of mutations) {
    if (!projected.has(mutation.type)) projected.set(mutation.type, new Map());
    projected.get(mutation.type)!.set(mutation.key, mutation);
  }
  for (const document of documents || []) {
    reads.set(identity(document.type, document.key), Promise.resolve(document.entity));
  }

  function readOnly(): never {
    throw new MessagevisorCLIError("Projected datasources are read only.", {
      code: "read_only_datasource",
    });
  }

  class ProjectedAdapter extends Adapter {
    listSets = () => source.listSets();
    readRevision = () => source.readRevision();
    readDatafile = readOnly;
    readEntityDocument = readOnly;
    writeEntity = readOnly;
    deleteEntity = readOnly;
    applyEntityMutations = readOnly;
    writeRevision = readOnly;
    writeDatafile = readOnly;

    async listEntities(type: EntityType) {
      if (!lists.has(type)) {
        lists.set(
          type,
          (async () => {
            const keys = new Set(
              documents
                ? documents.filter((document) => document.type === type).map(({ key }) => key)
                : await source.listEntities(type),
            );
            for (const [key, mutation] of projected.get(type) || []) {
              if (mutation.operation === "delete") keys.delete(key);
              else keys.add(key);
            }
            return [...keys].sort();
          })(),
        );
      }
      return [...(await lists.get(type)!)];
    }

    async entityExists(type: EntityType, key: string) {
      return (await this.listEntities(type)).includes(key);
    }

    async readEntity<T>(type: EntityType, key: string): Promise<T> {
      const mutation = projected.get(type)?.get(key);
      if (mutation?.operation === "delete") {
        throw new Error(`Unknown projected ${type} "${key}".`);
      }
      const id = identity(type, key);
      if (!mutation && !reads.has(id)) {
        reads.set(id, source.readEntity(type, key));
      }
      const entity = structuredClone(
        mutation?.operation === "write" ? mutation.entity : await reads.get(id),
      );
      if (!entity || typeof entity !== "object" || Array.isArray(entity)) return entity as T;
      return { ...entity, key } as T;
    }
  }

  return new Datasource({ ...source.getConfig(), adapter: ProjectedAdapter });
}
