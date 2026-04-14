const APP_SOURCE = "moodle-analyzer-web";
const EXTENSION_SOURCE = "moodle-analyzer-extension";

function sendAvailability() {
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type: "bridge-available",
    },
    window.location.origin,
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.source !== APP_SOURCE || typeof data.type !== "string") {
    return;
  }

  if (data.type === "bridge-ping") {
    sendAvailability();
    return;
  }

  if (data.type !== "bridge-request") {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "proxy-fetch",
      requestId: data.requestId,
      payload: data.payload,
    },
    (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        window.postMessage(
          {
            source: EXTENSION_SOURCE,
            type: "bridge-response",
            requestId: data.requestId,
            ok: false,
            error: runtimeError.message,
          },
          window.location.origin,
        );
        return;
      }

      window.postMessage(
        {
          source: EXTENSION_SOURCE,
          type: "bridge-response",
          requestId: data.requestId,
          ...response,
        },
        window.location.origin,
      );
    },
  );
});

sendAvailability();
