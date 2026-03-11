const UMAMI_URL = "https://bklite.canway.net/umami/api/send";
const WEBSITE_ID = "00046c9f-e7dd-4b6f-8dd2-ab38174792c6";

const TRACK_PATHS = ["/install.dev", "/install.run", "/uninstall.sh"];

function getClientIP(request) {
  // 优先用 CF-Connecting-IP（最可靠的真实客户端 IP）
  const cfIP = request.headers.get("CF-Connecting-IP");
  if (cfIP) return cfIP.trim();

  // 降级：取 X-Forwarded-For 的第一个 IP
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();

  return "";
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);

  if (TRACK_PATHS.includes(url.pathname)) {
    const clientIP = getClientIP(context.request);

    context.waitUntil(
      fetch(UMAMI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Compatible; BKLite Tracker/1.0)",
          "X-Forwarded-For": clientIP,
          "X-Real-IP": clientIP,
          "X-Client-IP": clientIP,
        },
        body: JSON.stringify({
          payload: {
            hostname: url.hostname,
            language: "en",
            referrer: context.request.headers.get("Referer") || "",
            screen: "0x0",
            title: url.pathname.replace("/", ""),
            url: url.pathname,
            website: WEBSITE_ID,
          },
          type: "event",
        }),
      })
    );
  }

  return response;
}