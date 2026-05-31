import { useParams } from "react-router-dom";

import { HistoryTimeline } from "../components/history/HistoryTimeline";
import { encodeRouteSegment } from "../entityTypes";
import { PageHeader } from "../components/layout/PageHeader";
import { useCatalog } from "../context/CatalogContext";

export function HistoryPage() {
  const { manifest } = useCatalog();
  const { setKey } = useParams();
  const path = setKey
    ? `/data/sets/${encodeRouteSegment(setKey)}/history`
    : "/data/project/history";

  return (
    <div>
      <PageHeader
        title={setKey ? `History for ${setKey}` : "Project History"}
        description="Recent Git changes for authored definitions."
      />
      <div className="px-6 pb-6">
        <HistoryTimeline path={path} setKey={setKey} commitUrl={manifest.links?.commit} />
      </div>
    </div>
  );
}
