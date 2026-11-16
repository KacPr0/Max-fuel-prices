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

// Pobiera i parsuje jedno obwieszczenie Ministra Energii (PDF).
async function fetchGovNotice(pdfUrl) {
  const res = await fetchWithRetry(pdfUrl);
  if (!res.ok) throw new Error(`PDF obwieszczenia: HTTP ${res.status}`);
  const text = extractPdfText(Buffer.from(await res.arrayBuffer())).replace(/\s+/g, ' ');

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

// Lista obwieszczeń ze strony Monitora Polskiego (publikacja tego samego dnia).
async function listNoticesMonitorPolski(year) {
  const res = await fetchWithRetry(`${MP_BASE}/MP/rok/${year}`);
  if (!res.ok) throw new Error(`lista: HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());
  const notices = [];
  $('tr').each((i, row) => {
    const rowText = $(row).text().replace(/\s+/g, ' ');
    if (!/Obwieszczenie Ministra Energii.*maksymalnej ceny paliw/i.test(rowText)) return;
    const pdf = $(row).find('a[href$=".pdf"]').attr('href');
    const dates = rowText.match(/\d{4}-\d{2}-\d{2}/g);
    const pos = parseInt(rowText.trim(), 10);
    if (pdf && dates) notices.push({ pos, pdfUrl: MP_BASE + pdf, announced: dates[dates.length - 1] });
  });
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
    .map(a => ({ pos: a.pos, pdfUrl: `${SEJM_API}/MP/${year}/${a.pos}/text.pdf`, announced: a.promulgation }));
}

// Ceny maksymalne z oficjalnego źródła: obwieszczenia Ministra Energii w Monitorze Polskim.
// Obwieszczenie ogłoszone danego dnia obowiązuje od dnia następnego.
// Zwraca ten sam format co scraper e-petrol: dates/pb98/pb95/on = [poprzednie, najnowsze].
async function scrapeGovMaxPrices() {
  const year = new Date().getFullYear();
  const sources = [
    ['Monitor Polski', listNoticesMonitorPolski],
    ['API Sejmu', listNoticesSejmApi]
  ];
  const errors = [];

  for (const [name, list] of sources) {
    try {
      const notices = (await list(year)).sort((a, b) => b.pos - a.pos);
      if (notices.length < 2) throw new Error('za mało obwieszczeń na liście');
      const [latest, previous] = notices;
      const [cur, prev] = await Promise.all([fetchGovNotice(latest.pdfUrl), fetchGovNotice(previous.pdfUrl)]);
      if (errors.length) console.warn(`Ceny maksymalne pobrane awaryjnie z: ${name}. Wcześniejsze błędy: ${errors.join('; ')}`);
      return {
        dates: [addDays(previous.announced, 1), addDays(latest.announced, 1)],
        pb98: [prev.pb98, cur.pb98],
        pb95: [prev.pb95, cur.pb95],
        on: [prev.on, cur.on],
        source: `M.P. ${year} poz. ${latest.pos}`,
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
    // Uwaga: e-petrol stoi za Cloudflare i może blokować IP GitHub Actions.
    const response = await fetch('https://www.e-petrol.pl/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

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
  scrapeEPetrol
};
