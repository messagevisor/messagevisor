import type { ProjectConfig } from "../config";
import type {
  Datasource,
  EntityDocument,
  EntityMutation,
  EntityMutationResult,
  EntityType,
} from "../datasource";
import { createProjectedDatasource } from "../datasource/projected";
import { lintProject, type LintEntityType, type LintProjectOptions } from "../linter";
import { MessagevisorCLIError } from "../error";
import { renameReferences } from "./references";

export interface EditorialValidationIssue {
  type: LintEntityType;
  key: string;
  path: (string | number)[];
  message: string;
  code?: string;
}

export interface EditorialMutationPreview {
  mutations: EntityMutation[];
  results: EntityMutationResult[];
  issues: EditorialValidationIssue[];
}

export interface RenameEntityOptions {
  dryRun?: boolean;
  /** Apply even if projected entities fail validation. Defaults to false. */
  allowInvalid?: boolean;
  validation?: LintProjectOptions;
}

export interface RenameEntityResult extends EditorialMutationPreview {
  applied: boolean;
}

const entityTypes: EntityType[] = ["locale", "attribute", "segment", "message", "target", "test"];

export async function previewEntityMutations(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  mutations: EntityMutation[],
  options: LintProjectOptions = {},
): Promise<EditorialMutationPreview> {
  return previewProjection(projectConfig, datasource, mutations, options);
}

async function previewProjection(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  mutations: EntityMutation[],
  options: LintProjectOptions,
  documents?: EntityDocument<unknown>[],
): Promise<EditorialMutationPreview> {
  const results = await datasource.applyEntityMutations(mutations, { dryRun: true });
  const projected = createProjectedDatasource(datasource, mutations, documents);
  const lint = await lintProject(projectConfig, projected, options);
  const issues = lint.errors.map((error) => ({
    type: error.entityType,
    key: error.entityKey,
    path: error.path,
    message: error.message,
    code: error.code,
  }));
  return { mutations, results, issues };
}

function hasChanged(before: unknown, after: unknown) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export async function renameEntity(
  projectConfig: ProjectConfig,
  datasource: Datasource,
  type: EntityType,
  from: string,
  to: string,
  options: RenameEntityOptions = {},
): Promise<RenameEntityResult> {
  if (from === to)
    throw new MessagevisorCLIError("Source and destination entity keys must be different.", {
      code: "conflicting_options",
      details: { from, to },
    });
  if (await datasource.entityExists(type, to)) {
    throw new MessagevisorCLIError(`${type} "${to}" already exists.`, {
      code: "entity_already_exists",
      details: { type, key: to },
    });
  }

  const source = await datasource.readEntityDocument(type, from);
  const documents: EntityDocument<unknown>[] = [];
  for (const candidateType of entityTypes) {
    for (const key of await datasource.listEntities(candidateType)) {
      if (candidateType === type && key === from) continue;
      documents.push(await datasource.readEntityDocument(candidateType, key));
    }
  }

  const mutations: EntityMutation[] = [
    { operation: "delete", type, key: from, expectedVersion: source.version },
    {
      operation: "write",
      type,
      key: to,
      expectedVersion: null,
      entity: renameReferences(type, type, source.entity, from, to),
    },
  ];
  for (const document of documents) {
    const renamed = renameReferences(type, document.type, document.entity, from, to);
    if (!hasChanged(document.entity, renamed)) continue;
    mutations.push({
      operation: "write",
      type: document.type,
      key: document.key,
      entity: renamed,
      expectedVersion: document.version,
    });
  }

  const preview = await previewProjection(
    projectConfig,
    datasource,
    mutations,
    options.validation || {},
    [source, ...documents],
  );
  if (!options.dryRun && (options.allowInvalid || preview.issues.length === 0)) {
    const results = await datasource.applyEntityMutations(mutations);
    return { ...preview, results, applied: true };
  }
  return { ...preview, applied: false };
}
