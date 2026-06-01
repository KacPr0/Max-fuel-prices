const cheerio = require('cheerio');

 // Scrapes e-petrol.pl homepage for maximum fuel prices and weekly forecasts.
 // @returns {Promise<{success: boolean, maxPrices?: any, forecasts?: any, error?: string}>}
async function scrapeFuelPrices() {
  try {
    const response = await fetch('https://www.e-petrol.pl/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
  scrapeFuelPrices
};
