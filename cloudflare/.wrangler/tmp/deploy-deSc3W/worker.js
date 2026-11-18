// worker.js
var ALLOWED_HOSTS = ["monitorpolski.gov.pl", "www.e-petrol.pl", "e-petrol.pl"];
var worker_default = {
  async fetch(request, env) {
    if (!env.PROXY_KEY || request.headers.get("X-Proxy-Key") !== env.PROXY_KEY) {
      return new Response("Brak dost\u0119pu", { status: 401 });
    }
    const target = new URL(request.url).searchParams.get("url");
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Nieprawid\u0142owy parametr url", { status: 400 });
    }
    if (!["http:", "https:"].includes(targetUrl.protocol) || !ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response("Domena niedozwolona", { status: 403 });
    }
    const upstream = await fetch(targetUrl.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": request.headers.get("Accept") || "*/*",
        "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
        "X-Proxied-From": targetUrl.hostname
      }
    });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
