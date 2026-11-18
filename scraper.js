const cheerio = require('cheerio');
const { extractPdfText } = require('./pdfText');
// undici (instalowany razem z cheerio) pozwala wydłużyć czas nawiązywania połączenia:
// wbudowany fetch w Node poddaje się po 10 s, a serwery rządowe bywają z chmury bardzo wolne.
const { Agent, fetch: undiciFetch } = require('undici');
const slowServerAgent = new Agent({ connect: { timeout: 30000 } });

const MP_BASE = 'https://monitorpolski.gov.pl';
const SEJM_API = 'https://api.sejm.gov.pl/eli/acts';
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
};

// Opcjonalny pośrednik na Cloudflare Workers (kod w cloudflare/worker.js).
// Ustawiany przez sekrety GitHub: MP_PROXY_URL i MP_PROXY_KEY. Bez nich bot łączy się bezpośrednio.
const PROXY_URL = (process.env.MP_PROXY_URL || '').replace(/\/+$/, '');
const PROXY_KEY = process.env.MP_PROXY_KEY || '';

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// fetch z ponowieniami: serwery rządowe bywają nieosiągalne z chmury (timeouty).
async function fetchWithRetry(url, options = {}, tries = 3) {
  let lastError;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await undiciFetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', dispatcher: slowServerAgent, signal: AbortSignal.timeout(60000), ...options });
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err.cause ? new Error(`${err.message} (${err.cause.code || err.cause.message})`) : err;
    }
    if (i < tries) await new Promise(r => setTimeout(r, 3000 * i));
  }
  throw lastError;
}

// To samo co fetchWithRetry, ale przez Workera na Cloudflare.
async function proxyFetch(url, options = {}) {
  if (!PROXY_URL) throw new Error('pośrednik nie jest skonfigurowany (brak MP_PROXY_URL)');
  const res = await fetchWithRetry(`${PROXY_URL}/?url=${encodeURIComponent(url)}`, {
    ...options,
    headers: { ...BROWSER_HEADERS, ...(options.headers || {}), 'X-Proxy-Key': PROXY_KEY }
  }, 2);
  if (res.status === 401) throw new Error('pośrednik odrzucił klucz (sprawdź MP_PROXY_KEY)');
  return res;
}

// Pobiera PDF obwieszczenia i zwraca jego tekst (z pojedynczymi spacjami).
async function fetchNoticeText(pdfUrl, get = fetchWithRetry) {
  const res = await get(pdfUrl);
  if (!res.ok) throw new Error(`PDF obwieszczenia: HTTP ${res.status}`);
  return extractPdfText(Buffer.from(await res.arrayBuffer())).replace(/\s+/g, ' ');
}

// Parsuje zwykłe obwieszczenie o cenie maksymalnej (ceny brutto, z VAT).
async function fetchGovNotice(pdfUrl, get = fetchWithRetry) {
  const text = await fetchNoticeText(pdfUrl, get);
  const grab = (re, label) => {
    const m = text.match(re);
    if (!m) throw new Error(`Nie znaleziono ceny ${label} w obwieszczeniu ${pdfUrl}`);
    return m[1];
  };
  return {
    pb95: grab(/bezołowiowej 95[\s\S]*?usług wynosi (\d+,\d{2})/, 'Pb95'),
    pb98: grab(/bezołowiowej 98[\s\S]*?usług wynosi (\d+,\d{2})/, 'Pb98'),
    on: grab(/oleju napędowego[\s\S]*?usług wynosi (\d+,\d{2})/, 'ON')
  };
}

// Obwieszczenie "zmieniające" poprawia ceny we wcześniejszym obwieszczeniu, np.:
//   "W obwieszczeniu ... (M.P. poz. 1150) w pkt 3 wprowadza się następujące zmiany:
//    1) w lit. a wyrazy „6,76 zł” zastępuje się wyrazami „6,96 zł”;
//    2) w lit. b wyrazy „7,30 zł” zastępuje się wyrazami „7,51 zł”."
// pkt 1 = Pb95, pkt 2 = Pb98, pkt 3 = ON; lit. b = cena z VAT (tę publikujemy).
const FUEL_BY_POINT = { 1: 'pb95', 2: 'pb98', 3: 'on' };

function isAmendment(notice) {
  return /zmieniaj/i.test(notice.title || '');
}

function amendedPositions(text) {
  return [...text.matchAll(/M\.\s*P\.\s*p\s*oz\.\s*(\d+)/g)].map(m => parseInt(m[1], 10));
}

function applyAmendment(prices, text, amendmentPos) {
  const parts = text.split(/w pkt (\d)\b/);
  let applied = 0;
  for (let i = 1; i < parts.length; i += 2) {
    const fuel = FUEL_BY_POINT[parts[i]];
    const segment = parts[i + 1];
    if (!fuel) continue;
    const m = segment.match(/lit\.\s*b\s+wyrazy\s+.?(\d+,\d{2})\s*zł.?\s+zastępuje się wyrazami\s+.?(\d+,\d{2})\s*zł/);
    if (!m) {
      // Zmiana dotyczy tylko ceny netto (lit. a) - cena z VAT bez zmian.
      if (/lit\.\s*a\s+wyrazy/.test(segment) && !/lit\.\s*b/.test(segment)) { applied++; continue; }
      throw new Error(`Nie rozpoznano formatu zmiany ceny w obwieszczeniu poz. ${amendmentPos}`);
    }
    const [, oldPrice, newPrice] = m;
    if (prices[fuel] !== oldPrice) {
      throw new Error(`Obwieszczenie poz. ${amendmentPos} zmienia ${fuel} z ${oldPrice}, a w oryginale jest ${prices[fuel]}`);
    }
    prices[fuel] = newPrice;
    applied++;
  }
  if (!applied) throw new Error(`Nie znaleziono żadnej zmiany ceny w obwieszczeniu poz. ${amendmentPos}`);
}

// Pobiera obwieszczenie i nakłada na nie wszystkie późniejsze obwieszczenia zmieniające.
async function fetchNoticeWithAmendments(base, allNotices, get) {
  const prices = await fetchGovNotice(base.pdfUrl, get);
  const amendments = allNotices.filter(n => isAmendment(n) && n.pos > base.pos).sort((a, b) => a.pos - b.pos);
  const appliedPositions = [];
  for (const am of amendments) {
    const text = await fetchNoticeText(am.pdfUrl, get);
    if (!amendedPositions(text).includes(base.pos)) continue;
    applyAmendment(prices, text, am.pos);
    appliedPositions.push(am.pos);
  }
  return { prices, appliedPositions };
}

// Lista obwieszczeń ze strony Monitora Polskiego (publikacja tego samego dnia).
// Lista jest stronicowana po 50 pozycji i domyślnie pokazuje ostatnią stronę, na której
// może nie być żadnego obwieszczenia o paliwach - wtedy cofamy się o kolejne strony.
async function listNoticesMonitorPolski(year, get = fetchWithRetry, maxPages = 4) {
  const notices = [];
  let pageUrl = `${MP_BASE}/MP/rok/${year}`;

  for (let page = 0; page < maxPages && pageUrl && notices.filter(n => !isAmendment(n)).length < 2; page++) {
    const res = await get(pageUrl);
    if (!res.ok) throw new Error(`lista: HTTP ${res.status}`);
    const $ = cheerio.load(await res.text());

    $('tr').each((i, row) => {
      const rowText = $(row).text().replace(/\s+/g, ' ');
      if (!/Obwieszczenie Ministra Energii.*maksymalnej ceny paliw/i.test(rowText)) return;
      const pdf = $(row).find('a[href$=".pdf"]').attr('href');
      const dates = rowText.match(/\d{4}-\d{2}-\d{2}/g);
      const pos = parseInt(rowText.trim(), 10);
      if (pdf && dates) notices.push({ pos, pdfUrl: MP_BASE + pdf, announced: dates[dates.length - 1], title: rowText.trim() });
    });

    // Link do poprzedniej strony wygląda jak "< Pozycje 1101 - 1150"
    const prev = $(`a[href^="/MP/rok/${year}/"]`).filter((i, a) => $(a).text().trim().startsWith('<')).first().attr('href');
    pageUrl = prev ? MP_BASE + prev : null;
  }
  return notices;
}

// Lista obwieszczeń z API Sejmu (ELI) - te same akty, ale zwykle z ok. 1-dniowym opóźnieniem.
async function listNoticesSejmApi(year) {
  const url = `${SEJM_API}/search?publisher=MP&year=${year}&title=${encodeURIComponent('maksymalnej ceny paliw')}&limit=500`;
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .filter(a => /Ministra Energii/i.test(a.title) && a.textPDF)
    .map(a => ({ pos: a.pos, pdfUrl: `${SEJM_API}/MP/${year}/${a.pos}/text.pdf`, announced: a.promulgation, title: a.title }));
}

// Ceny maksymalne z oficjalnego źródła: obwieszczenia Ministra Energii w Monitorze Polskim.
// Obwieszczenie ogłoszone danego dnia obowiązuje od dnia następnego.
// Zwraca ten sam format co scraper e-petrol: dates/pb98/pb95/on = [poprzednie, najnowsze].
async function scrapeGovMaxPrices() {
  const year = new Date().getFullYear();
  // Kolejność: Monitor Polski bezpośrednio, potem przez Cloudflare (jeśli skonfigurowany),
  // a na końcu API Sejmu (te same akty, ale z opóźnieniem).
  // Gdy pośrednik jest ustawiony, bezpośrednio próbujemy tylko raz, żeby nie tracić minut na timeouty.
  const directFetch = (url, options) => fetchWithRetry(url, options, PROXY_URL ? 1 : 3);
  const sources = [
    ['Monitor Polski', y => listNoticesMonitorPolski(y, directFetch), directFetch],
    ...(PROXY_URL ? [['Monitor Polski przez Cloudflare', y => listNoticesMonitorPolski(y, proxyFetch), proxyFetch]] : []),
    ['API Sejmu', listNoticesSejmApi, fetchWithRetry]
  ];
  const errors = [];

  for (const [name, list, get] of sources) {
    try {
      const all = (await list(year)).sort((a, b) => b.pos - a.pos);
      const bases = all.filter(n => !isAmendment(n));
      if (bases.length < 2) throw new Error('za mało obwieszczeń na liście');
      const [latest, previous] = bases;
      const [curN, prevN] = await Promise.all([
        fetchNoticeWithAmendments(latest, all, get),
        fetchNoticeWithAmendments(previous, all, get)
      ]);
      const cur = curN.prices, prev = prevN.prices;
      const amendNote = curN.appliedPositions.length ? ` (zm. poz. ${curN.appliedPositions.join(', ')})` : '';
      if (errors.length) console.warn(`Ceny maksymalne pobrane awaryjnie z: ${name}. Wcześniejsze błędy: ${errors.join('; ')}`);
      return {
        dates: [addDays(previous.announced, 1), addDays(latest.announced, 1)],
        pb98: [prev.pb98, cur.pb98],
        pb95: [prev.pb95, cur.pb95],
        on: [prev.on, cur.on],
        source: `M.P. ${year} poz. ${latest.pos}${amendNote}`,
        via: name
      };
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

// Główna funkcja: ceny maksymalne z Monitora Polskiego (państwowe źródło),
// prognozy tygodniowe z e-petrol.pl (nie ma państwowego odpowiednika).
// Jeśli Monitor Polski zawiedzie, ceny maksymalne biorą się awaryjnie z e-petrol.
async function scrapeFuelPrices() {
  const [gov, epetrol] = await Promise.allSettled([scrapeGovMaxPrices(), scrapeEPetrol()]);

  if (gov.status === 'rejected') console.error('Błąd źródeł państwowych:', gov.reason.message);
  const ep = epetrol.status === 'fulfilled' ? epetrol.value : { success: false, error: epetrol.reason?.message };
  if (!ep.success) console.error('Błąd e-petrol.pl (prognozy):', ep.error);

  const maxPrices = gov.status === 'fulfilled' ? gov.value : (ep.maxPrices || null);
  const forecasts = ep.forecasts || null;

  if (!maxPrices && !forecasts) {
    return {
      success: false,
      error: `${gov.reason?.message}; e-petrol: ${ep.error}`
    };
  }
  return { success: true, maxPrices, forecasts, scrapedAt: new Date().toISOString() };
}

// Scrapes e-petrol.pl homepage for maximum fuel prices and weekly forecasts.
// @returns {Promise<{success: boolean, maxPrices?: any, forecasts?: any, error?: string}>}
async function scrapeEPetrol() {
  try {
    // Uwaga: e-petrol stoi za Cloudflare i blokuje IP GitHub Actions (HTTP 403),
    // więc przy błędzie próbujemy jeszcze przez pośrednika, jeśli jest skonfigurowany.
    const epetrolOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    };
    let response = await fetch('https://www.e-petrol.pl/', epetrolOptions);
    if (!response.ok && PROXY_URL) {
      console.warn(`e-petrol.pl: HTTP ${response.status}, próbuję przez Cloudflare...`);
      response = await proxyFetch('https://www.e-petrol.pl/', epetrolOptions);
    }

    if (!response.ok) {
      throw new Error(`Błąd pobierania strony: HTTP ${response.status}`);
    }

    const htmlText = await response.text();
    const $ = cheerio.load(htmlText);

    let maxPrices = {
      dates: [], // [today, tomorrow]
      pb98: [],  // [todayPrice, tomorrowPrice]
      pb95: [],  // [todayPrice, tomorrowPrice]
      on: []     // [todayPrice, tomorrowPrice]
    };

    // 1. Scrape Maximum Fuel Prices
    $('.przestawna').each((i, el) => {
      const title = $(el).find('.card-header.title h6').text().trim();
      if (title.toLowerCase().includes('maksymalne ceny paliw')) {
        $(el).find('.row.tab-divs').each((rowIdx, rowEl) => {
          const cols = $(rowEl).find('.col').map((colIdx, colEl) => $(colEl).text().trim()).get();
          if (cols.length >= 3) {
            const label = cols[0].replace(/\s+/g, ' ');
            if (label.includes('Obowiązuje od')) {
              maxPrices.dates = [cols[1], cols[2]];
            } else if (label.includes('98')) {
              maxPrices.pb98 = [cols[1], cols[2]];
            } else if (label.includes('95')) {
              maxPrices.pb95 = [cols[1], cols[2]];
            } else if (label.includes('ON')) {
              maxPrices.on = [cols[1], cols[2]];
            }
          }
        });
      }
    });

    // 2. Scrape Weekly Forecasts
    let forecasts = {
      period: '',
      published: '',
      pb98: '',
      pb95: '',
      on: '',
      lpg: ''
    };

    $('.card').each((i, el) => {
      const catName = $(el).find('.categoryname').text().trim();
      if (catName.toLowerCase().includes('prognozy detalicznych cen paliw')) {
        const boxes = $(el).find('.text-fuel').map((idx, boxEl) => {
          return $(boxEl).text().trim().replace(/\s+/g, '');
        }).get();

        if (boxes.length >= 4) {
          forecasts.pb98 = boxes[0].replace(/.*?}/g, '');
          forecasts.pb95 = boxes[1].replace(/.*?}/g, '');
          forecasts.on = boxes[2].replace(/.*?}/g, '');
          forecasts.lpg = boxes[3].replace(/.*?}/g, '');
        }

        // Search for metadata paragraph e.g. "Na okres:  1-7 czerwca 2026.  Opublikowano: 2026-05-29."
        $(el).find('.post-small').each((pIdx, pEl) => {
          const text = $(pEl).text().trim();
          if (text.toLowerCase().includes('na okres:')) {
            const periodMatch = text.match(/na okres:\s*([^.]+)/i);
            const pubMatch = text.match(/opublikowano:\s*([^.]+)/i);

            if (periodMatch) forecasts.period = periodMatch[1].trim();
            if (pubMatch) forecasts.published = pubMatch[1].trim();
          }
        });
      }
    });

    // Validating scraped data
    const hasMaxPrices = maxPrices.dates.length > 0 && maxPrices.pb95.length > 0;
    const hasForecasts = forecasts.pb95 !== '';

    if (!hasMaxPrices && !hasForecasts) {
      throw new Error("Nie udało się sparsować żadnych danych cenowych ze strony.");
    }

    return {
      success: true,
      maxPrices: hasMaxPrices ? maxPrices : null,
      forecasts: hasForecasts ? forecasts : null,
      scrapedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Błąd podczas scrapowania e-petrol.pl:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  scrapeFuelPrices,
  scrapeGovMaxPrices,
  scrapeEPetrol,
  applyAmendment
};
