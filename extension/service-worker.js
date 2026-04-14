function sanitizeUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported.");
  }
  return url.toString();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "proxy-fetch") {
    return false;
  }

  const { payload } = message;

  (async () => {
    try {
      const url = sanitizeUrl(payload.url);
      const response = await fetch(url, {
        method: payload.method ?? "GET",
        headers: payload.headers ?? {},
        body: payload.body ?? undefined,
        redirect: "follow",
      });

      const bodyText = await response.text();
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      sendResponse({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        bodyText,
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Extension bridge request failed.",
      });
    }
  })();

  return true;
});
