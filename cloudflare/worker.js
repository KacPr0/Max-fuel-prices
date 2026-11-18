// Pośrednik (proxy) dla bota cen paliw - kod Workera Cloudflare (wdrażany z folderu cloudflare/ przez wrangler).
// Po co: Monitor Polski nie przyjmuje połączeń z serwerów GitHub Actions w USA. Worker
// (przypięty do Warszawy w wrangler.toml) pobiera stronę z Polski i oddaje ją botowi.
//
// Użycie: GET https://<twoj-worker>.workers.dev/?url=<adres zakodowany encodeURIComponent>
//         z nagłówkiem X-Proxy-Key: <ten sam sekret co PROXY_KEY w ustawieniach Workera>
//
// Bezpieczeństwo: bez poprawnego klucza Worker nic nie zwraca, a pobierać pozwala
// tylko z domen z listy poniżej (żeby nie dało się go użyć jako otwartego proxy).

const ALLOWED_HOSTS = ['monitorpolski.gov.pl', 'www.e-petrol.pl', 'e-petrol.pl'];

export default {
  async fetch(request, env) {
    if (!env.PROXY_KEY || request.headers.get('X-Proxy-Key') !== env.PROXY_KEY) {
      return new Response('Brak dostępu', { status: 401 });
    }

    const target = new URL(request.url).searchParams.get('url');
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response('Nieprawidłowy parametr url', { status: 400 });
    }
    if (!['http:', 'https:'].includes(targetUrl.protocol) || !ALLOWED_HOSTS.includes(targetUrl.hostname)) {
      return new Response('Domena niedozwolona', { status: 403 });
    }

    const upstream = await fetch(targetUrl.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': request.headers.get('Accept') || '*/*',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/octet-stream',
        'X-Proxied-From': targetUrl.hostname
      }
    });
  }
};
