import * as React from "react";

import type { MessagevisorSnapshot } from "@messagevisor/sdk";

import { useSdk } from "./useSdk";

type SyncExternalStore = <Snapshot>(
  subscribe: (callback: () => void) => () => void,
  getSnapshot: () => Snapshot,
  getServerSnapshot?: () => Snapshot,
) => Snapshot;

const useSyncExternalStore =
  (React as typeof React & { useSyncExternalStore?: SyncExternalStore }).useSyncExternalStore ||
  function useSyncExternalStoreFallback<Snapshot>(
    subscribe: (callback: () => void) => () => void,
    getSnapshot: () => Snapshot,
  ) {
    const [snapshot, setSnapshot] = React.useState(getSnapshot);

    React.useEffect(() => {
      const handleChange = () => {
        setSnapshot(getSnapshot());
      };

      const unsubscribe = subscribe(handleChange);
      handleChange();

      return unsubscribe;
    }, [subscribe, getSnapshot]);

    return snapshot;
  };

export function useMessagevisorSnapshot(): MessagevisorSnapshot {
  const sdk = useSdk();
  const store = React.useMemo(() => {
    let snapshot = sdk.getSnapshot();

    const getSnapshot = () => {
      const nextSnapshot = sdk.getSnapshot();

      if (nextSnapshot.version === snapshot.version) {
        return snapshot;
      }

      snapshot = nextSnapshot;

      return snapshot;
    };

    const subscribe = (callback: () => void) =>
      sdk.subscribe(() => {
        snapshot = sdk.getSnapshot();
        callback();
      });

    return {
      getSnapshot,
      subscribe,
    };
  }, [sdk]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
