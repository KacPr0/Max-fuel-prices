const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { scrapeFuelPrices } = require('./scraper');
const { generateFuelCard } = require('./imageGenerator');
const { publishPost } = require('./publisher');

const dbPath = path.join(__dirname, 'db.json');
const logPath = path.join(__dirname, 'bot_activity.log');

// Helper to write a timestamped log to bot_activity.log.
function logActivity(message) {
  const timestamp = new Date().toLocaleString('pl-PL');
  const formattedMsg = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logPath, formattedMsg);
}

// Loads the local database. Creates one if missing.
function loadDatabase() {
  if (!fs.existsSync(dbPath)) {
    const initialDb = {
      lastPublishedMaxPriceDate: '', // e.g. '2026-05-30'
      lastPublishedForecastPeriod: '' // e.g. '1-7 czerwca 2026'
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialDb, null, 2));
    return initialDb;
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

// Saves the local database.
function saveDatabase(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// The main bot execution check.
// Can be run manually or by the cron scheduler.
async function checkAndPublish(options = {}) {
  const db = loadDatabase();
  const brandingText = process.env.BRANDING_TEXT || '@MaksymalneCenyPaliw';
  
  if (options.type === 'custom') {
    logActivity(`[NOWE DANE - WŁASNE] Wykryto ręczny post typu custom.`);
    try {
      logActivity(`[BOT] Generowanie grafiki dla posta customowego...`);
      const customOptions = {
        titleMain: options.titleMain,
        titleSub: options.titleSub,
        footerTxt: options.footerTxt,
        fontSize: options.fontSize
      };
      const pngBuffer = await generateFuelCard('custom', { text: options.customText }, brandingText, customOptions);
      logActivity(`[BOT] Rozpoczynam publikację customowego posta...`);
      const publishResult = await publishPost('custom', { text: options.customText, caption: options.customCaption }, pngBuffer, logActivity, options.platforms);
      
      if (publishResult.success) {
        logActivity(`[SUKCES] Pomyślnie opublikowano własny post.`);
        return { success: true, postedCustom: true };
      } else {
        logActivity(`[BŁĄD] Publikacja własnego posta nie powiodła się.`);
        return { success: false, error: 'Błąd publikacji' };
      }
    } catch (err) {
      logActivity(`[WYJĄTEK] Błąd podczas przetwarzania custom posta: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  logActivity('[BOT] Sprawdzanie strony e-petrol.pl pod kątem nowych danych...');
  const scrapeResult = await scrapeFuelPrices();

  if (!scrapeResult.success) {
    logActivity(`[BŁĄD] Nie udało się pobrać danych: ${scrapeResult.error}`);
    return { success: false, error: scrapeResult.error };
  }

  const { maxPrices, forecasts } = scrapeResult;
  let postedMaxPrices = false;
  let postedForecasts = false;
  let postedCombined = false;

  const today = new Date();
  // 5 represents Friday in JS
  const isFriday = today.getDay() === 5 || options.forceCombined;

  // Friday Special Case: Combined Carousel Post (Max Prices + Forecasts in one post!)
  if (isFriday && maxPrices && forecasts && maxPrices.dates.length >= 2) {
    const tomorrowDate = maxPrices.dates[1];
    const period = forecasts.period;

    const isNewMax = tomorrowDate !== db.lastPublishedMaxPriceDate;
    const isNewFore = period !== db.lastPublishedForecastPeriod;

    if (isNewMax || isNewFore || options.force) {
      logActivity(`[NOWE DANE - PIĄTEK] Wykryto dzień piątkowy. Tworzenie postu karuzelowego (Ceny Max + Prognoza)...`);
      
      try {
        logActivity(`[BOT] Generowanie grafiki 1/2: ceny maksymalne...`);
        const pngMax = await generateFuelCard('maxPrices', maxPrices, brandingText);
        
        logActivity(`[BOT] Generowanie grafiki 2/2: prognozy tygodniowe...`);
        const pngForecast = await generateFuelCard('forecasts', forecasts, brandingText);

        logActivity(`[BOT] Rozpoczynam publikację połączonej karuzeli na wybranych platformach...`);
        const publishResult = await publishPost('combined', { maxPrices, forecasts }, [pngMax, pngForecast], logActivity, options.platforms);

        if (publishResult.success) {
          db.lastPublishedMaxPriceDate = tomorrowDate;
          db.lastPublishedForecastPeriod = period;
          saveDatabase(db);
          logActivity(`[SUKCES] Pomyślnie opublikowano piątkową karuzelę (Ceny Max na dzień ${tomorrowDate} oraz Prognozy na okres ${period}).`);
          postedCombined = true;
          postedMaxPrices = true;
          postedForecasts = true;
        } else {
          logActivity(`[BŁĄD] Publikacja karuzeli piątkowej nie powiodła się.`);
        }
      } catch (err) {
        logActivity(`[WYJĄTEK] Błąd podczas przetwarzania karuzeli piątkowej: ${err.message}`);
      }

      return {
        success: true,
        scrapedAt: scrapeResult.scrapedAt,
        postedMaxPrices,
        postedForecasts,
        postedCombined
      };
    } else {
      logActivity(`[INFO] Piątkowa karuzela (ceny maksymalne na ${tomorrowDate} oraz prognoza ${period}) została już wcześniej opublikowana.`);
      return {
        success: true,
        scrapedAt: scrapeResult.scrapedAt,
        postedMaxPrices: false,
        postedForecasts: false,
        postedCombined: false,
        info: 'Piątkowa karuzela została już opublikowana.'
      };
    }
  }

  // Standard Cases: Monday - Thursday, Saturday - Sunday (Independent posts)
  // 1. Process Daily Maximum Prices
  if (maxPrices && maxPrices.dates.length >= 2) {
    const tomorrowDate = maxPrices.dates[1];
    
    if (tomorrowDate !== db.lastPublishedMaxPriceDate || options.force) {
      logActivity(`[NOWE DANE] Wykryto nowe ceny maksymalne na dzień: ${tomorrowDate}!`);
      
      try {
        logActivity(`[BOT] Generowanie grafiki cen maksymalnych...`);
        const pngBuffer = await generateFuelCard('maxPrices', maxPrices, brandingText);
        
        logActivity(`[BOT] Rozpoczynam publikację cen maksymalnych...`);
        const publishResult = await publishPost('maxPrices', maxPrices, pngBuffer, logActivity, options.platforms);
        
        if (publishResult.success) {
          db.lastPublishedMaxPriceDate = tomorrowDate;
          saveDatabase(db);
          logActivity(`[SUKCES] Pomyślnie opublikowano ceny maksymalne na dzień ${tomorrowDate}.`);
          postedMaxPrices = true;
        } else {
          logActivity(`[BŁĄD] Publikacja cen maksymalnych nie powiodła się.`);
        }
      } catch (err) {
        logActivity(`[WYJĄTEK] Błąd podczas przetwarzania cen maksymalnych: ${err.message}`);
      }
    } else {
      logActivity(`[INFO] Ceny maksymalne na dzień ${tomorrowDate} zostały już wcześniej opublikowane.`);
    }
  }

  // 2. Process Weekly Forecasts (Standalone) - Only if explicitly forced and NOT Friday.
  // Standard scheduled flows only publish weekly forecasts in the combined Friday carousel.
  if (options.forceForecast && forecasts && forecasts.period) {
    const period = forecasts.period;
    
    if (period !== db.lastPublishedForecastPeriod || options.force) {
      logActivity(`[NOWE DANE] Wykryto nową prognozę tygodniową na okres: ${period}!`);
      
      try {
        logActivity(`[BOT] Generowanie grafiki prognoz...`);
        const pngBuffer = await generateFuelCard('forecasts', forecasts, brandingText);
        
        logActivity(`[BOT] Rozpoczynam publikację prognoz...`);
        const publishResult = await publishPost('forecasts', forecasts, pngBuffer, logActivity, options.platforms);
        
        if (publishResult.success) {
          db.lastPublishedForecastPeriod = period;
          saveDatabase(db);
          logActivity(`[SUKCES] Pomyślnie opublikowano prognozę tygodniową na okres ${period}.`);
          postedForecasts = true;
        } else {
          logActivity(`[BŁĄD] Publikacja prognozy nie powiodła się.`);
        }
      } catch (err) {
        logActivity(`[WYJĄTEK] Błąd podczas przetwarzania prognozy: ${err.message}`);
      }
    } else {
      logActivity(`[INFO] Prognoza na okres ${period} została już wcześniej opublikowana.`);
    }
  }

  return {
    success: true,
    scrapedAt: scrapeResult.scrapedAt,
    postedMaxPrices,
    postedForecasts,
    postedCombined
  };
}

// Initializes the automated cron schedule.
function initScheduler() {
  logActivity('[SYSTEM] Inicjalizacja harmonogramu bota...');
  
  const task = cron.schedule('*/15 9-15 * * *', async () => {
    logActivity('[SYSTEM] Uruchomienie automatycznego sprawdzania (Cron)...');
    await checkAndPublish();
  });
  
  logActivity('[SYSTEM] Harmonogram aktywny! Sprawdzanie co 15 minut w godzinach 9:00 - 15:59.');
  return task;
}

module.exports = {
  checkAndPublish,
  initScheduler,
  loadDatabase,
  logActivity
};
