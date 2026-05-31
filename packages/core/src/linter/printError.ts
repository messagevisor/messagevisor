import { ZodError, ZodIssue } from "zod";

export interface LintIssueFromZod {
  message: string;
  path: (string | number)[];
  code?: string;
  value?: unknown;
}

function normalizePath(path: PropertyKey[]): (string | number)[] {
  return path.map((segment) => (typeof segment === "symbol" ? String(segment) : segment));
}

function getInvalidUnionIssue(issue: ZodIssue): ZodIssue | undefined {
  if (issue.code !== "invalid_union" || issue.path.length > 0) {
    return undefined;
  }

  const unionErrors = (issue as any).unionErrors as ZodError[] | undefined;
  if (Array.isArray(unionErrors) && unionErrors.length > 0) {
    return unionErrors[unionErrors.length - 1].issues[0];
  }

  const errors = (issue as any).errors as ZodIssue[][] | undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors[errors.length - 1][0];
  }
}

export function getLintIssuesFromZodError(error: ZodError): LintIssueFromZod[] {
  return error.issues
    .map((issue) => {
      const nestedIssue = getInvalidUnionIssue(issue);

      if (nestedIssue) {
        return {
          message: nestedIssue.message,
          path: normalizePath(nestedIssue.path),
          code: nestedIssue.code,
          value: (nestedIssue as any).received,
        };
      }

      return {
        message: issue.message,
        path: normalizePath(issue.path),
        code: issue.code,
        value: (issue as any).received,
      };
    })
    .filter(Boolean);
}
