import { Link } from "react-router-dom";

import type { EntityType } from "../../types";
import { getEntityRoute } from "../../entityTypes";
import { EntityKey } from "../ui/EntityKey";

export function UsageLinks(props: { type: EntityType; keys?: string[]; setKey?: string }) {
  if (!props.keys || props.keys.length === 0) {
    return <p className="text-sm text-muted">None</p>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {props.keys.map((key) => (
        <span key={key} className="flex max-w-full">
          <Link
            className="inline-flex max-w-full items-center rounded-full bg-pill px-2.5 py-0.5 text-xs font-medium text-primary hover:underline"
            to={getEntityRoute(
              props.type,
              props.type === "attribute" ? key.split(".")[0] : key,
              props.setKey,
            )}
          >
            <EntityKey value={key} className="font-medium" />
          </Link>
        </span>
      ))}
    </div>
  );
}
