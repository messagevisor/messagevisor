import { Link } from "react-router-dom";

import type { EntityType } from "../../types";
import { getEntityRoute } from "../../entityTypes";
import { EntityKey } from "../ui/EntityKey";

export function UsageLinks(props: { type: EntityType; keys?: string[]; setKey?: string }) {
  if (!props.keys || props.keys.length === 0) {
    return <p className="text-sm text-muted">No usage found.</p>;
  }

  return (
    <ul className="list-inside list-disc space-y-1 text-sm">
      {props.keys.map((key) => (
        <li key={key} className="[overflow-wrap:anywhere]">
          <Link
            className="text-primary hover:underline"
            to={getEntityRoute(
              props.type,
              props.type === "attribute" ? key.split(".")[0] : key,
              props.setKey,
            )}
          >
            <EntityKey value={key} className="font-medium" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
