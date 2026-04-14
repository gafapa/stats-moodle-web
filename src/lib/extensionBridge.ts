const APP_SOURCE = "moodle-analyzer-web";
const EXTENSION_SOURCE = "moodle-analyzer-extension";

type BridgeRequestPayload = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type BridgeResponseMessage = {
  source: typeof EXTENSION_SOURCE;
  type: "bridge-response";
  requestId: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  bodyText?: string;
  error?: string;
};

type AvailabilityMessage = {
  source: typeof EXTENSION_SOURCE;
  type: "bridge-available";
};

type PendingRequest = {
  resolve: (value: BridgeHttpResponse) => void;
  reject: (reason?: unknown) => void;
  timeoutId: number;
};

export type BridgeHttpResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyText: string;
};

const listeners = new Set<(available: boolean) => void>();
const pendingRequests = new Map<string, PendingRequest>();
let initialized = false;
let bridgeAvailable = false;

function notifyAvailability(): void {
  listeners.forEach((listener) => listener(bridgeAvailable));
}

function setBridgeAvailable(nextValue: boolean): void {
  if (bridgeAvailable === nextValue) {
    return;
  }
  bridgeAvailable = nextValue;
  notifyAvailability();
}

function handleWindowMessage(event: MessageEvent<BridgeResponseMessage | AvailabilityMessage>): void {
  if (event.source !== window || !event.data || event.data.source !== EXTENSION_SOURCE) {
    return;
  }

  if (event.data.type === "bridge-available") {
    setBridgeAvailable(true);
    return;
  }

  if (event.data.type !== "bridge-response") {
    return;
  }

  const pending = pendingRequests.get(event.data.requestId);
  if (!pending) {
    return;
  }

  window.clearTimeout(pending.timeoutId);
  pendingRequests.delete(event.data.requestId);

  if (!event.data.ok) {
    pending.reject(new Error(event.data.error || "Extension bridge request failed."));
    return;
  }

  pending.resolve({
    ok: event.data.ok,
    status: event.data.status ?? 0,
    statusText: event.data.statusText ?? "",
    headers: event.data.headers ?? {},
    bodyText: event.data.bodyText ?? "",
  });
}

export function initializeExtensionBridge(): void {
  if (initialized || typeof window === "undefined") {
    return;
  }

  initialized = true;
  window.addEventListener("message", handleWindowMessage);
  window.postMessage(
    {
      source: APP_SOURCE,
      type: "bridge-ping",
    },
    window.location.origin,
  );
}

export function isExtensionBridgeAvailable(): boolean {
  return bridgeAvailable;
}

export function subscribeExtensionBridgeAvailability(
  listener: (available: boolean) => void,
): () => void {
  listeners.add(listener);
  listener(bridgeAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export function requestThroughExtension(
  payload: BridgeRequestPayload,
  timeoutMs = 15000,
): Promise<BridgeHttpResponse> {
  initializeExtensionBridge();

  if (!bridgeAvailable) {
    return Promise.reject(new Error("Chrome extension bridge is not available."));
  }

  const requestId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Timed out waiting for the Chrome extension bridge."));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timeoutId });

    window.postMessage(
      {
        source: APP_SOURCE,
        type: "bridge-request",
        requestId,
        payload,
      },
      window.location.origin,
    );
  });
}
