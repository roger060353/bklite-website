const UMAMI_URL = "https://bklite.canway.net/umami/api/send";
const WEBSITE_ID = "00046c9f-e7dd-4b6f-8dd2-ab38174792c6";

const TRACK_PATHS = ["/install.dev", "/install.run", "/uninstall.sh"];

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);

  if (TRACK_PATHS.includes(url.pathname)) {
    const name = url.pathname.replace("/", ""); // e.g. "install.dev"

    context.waitUntil(
      fetch(UMAMI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            hostname: url.hostname,
            language: "en",
            referrer: context.request.headers.get("Referer") || "",
            screen: "0x0",
            title: name,
            url: url.pathname,
            website: WEBSITE_ID,
            name: `download-${name}`,
          },
          type: "event",
        }),
      })
    );
  }

  return response;
}