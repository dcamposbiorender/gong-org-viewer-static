/**
 * External store for refresh state — works across layout/page boundary.
 * Pages set the handler via setRefreshHandler(), Header reads it via useRefreshStore().
 */

import { useSyncExternalStore } from "react";

interface RefreshState {
  onRefresh: (() => void) | null;
  refreshing: boolean;
}

let _state: RefreshState = { onRefresh: null, refreshing: false };
const _listeners = new Set<() => void>();

function emitChange() {
  _listeners.forEach((l) => l());
}

export function setRefreshHandler(
  onRefresh: (() => void) | null,
  refreshing: boolean
) {
  _state = { onRefresh, refreshing };
  emitChange();
}

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getSnapshot(): RefreshState {
  return _state;
}

const _serverState: RefreshState = { onRefresh: null, refreshing: false };

function getServerSnapshot(): RefreshState {
  return _serverState;
}

export function useRefreshStore(): RefreshState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
