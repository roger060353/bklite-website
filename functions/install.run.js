const UMAMI_URL = "https://bklite.canway.net/umami/api/send";
const WEBSITE_ID = "00046c9f-e7dd-4b6f-8dd2-ab38174792c6";

export async function onRequest(context) {
  const response = await context.next();

  context.waitUntil(
    fetch(UMAMI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          hostname: new URL(context.request.url).hostname,
          language: "en",
          referrer: context.request.headers.get("Referer") || "",
          screen: "0x0",
          title: "install.run",
          url: "/install.run",
          website: WEBSITE_ID,
          name: "download-install-run",
        },
        type: "event",
      }),
    })
  );

  return response;
}