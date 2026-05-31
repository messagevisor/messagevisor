import { Navigate, Route, Routes } from "react-router-dom";

import { CatalogProvider } from "./context/CatalogContext";
import type { CatalogManifest } from "./types";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ListPage } from "./pages/ListPage";
import { HistoryPage } from "./pages/HistoryPage";
import {
  EntityExamplesTab,
  EntityDetailPage,
  EntityHistoryTab,
  EntityOverviewTab,
  FormatsTab,
  LocaleDuplicatesTab,
  MessageOverridesTab,
  MessageTranslationsTab,
  SegmentConditionsTab,
  TargetMessagesTab,
  UsageTab,
} from "./pages/EntityDetailPage";

function EntityRoutes(props: { prefix?: string } = {}) {
  const prefix = props.prefix || "";

  return (
    <Route path={`${prefix}:entityPath/:entityKey`} element={<EntityDetailPage />}>
      <Route index element={<EntityOverviewTab />} />
      <Route path="formats" element={<FormatsTab />} />
      <Route path="examples" element={<EntityExamplesTab />} />
      <Route path="duplicates" element={<LocaleDuplicatesTab />} />
      <Route path="translations" element={<MessageTranslationsTab />} />
      <Route path="overrides" element={<MessageOverridesTab />} />
      <Route path="conditions" element={<SegmentConditionsTab />} />
      <Route path="usage" element={<UsageTab />} />
      <Route path="messages" element={<TargetMessagesTab />} />
      <Route path="history" element={<EntityHistoryTab />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Route>
  );
}

export function App(props: { manifest?: CatalogManifest }) {
  return (
    <CatalogProvider initialManifest={props.manifest}>
      <AppShell>
        <Routes>
          <Route index element={<HomePage />} />

          <Route path="sets/:setKey" element={<Navigate to="messages" replace />} />
          <Route path="sets/:setKey/:entityPath" element={<ListPage />} />
          <Route
            path="sets/:setKey/:entityPath/:entityKey/formats/:localeKey"
            element={<EntityDetailPage />}
          >
            <Route index element={<FormatsTab />} />
          </Route>
          {EntityRoutes({ prefix: "sets/:setKey/" })}
          <Route path="sets/:setKey/history" element={<HistoryPage />} />

          <Route path="history" element={<HistoryPage />} />
          <Route path=":entityPath" element={<ListPage />} />
          <Route path=":entityPath/:entityKey/formats/:localeKey" element={<EntityDetailPage />}>
            <Route index element={<FormatsTab />} />
          </Route>
          {EntityRoutes()}

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </CatalogProvider>
  );
}
