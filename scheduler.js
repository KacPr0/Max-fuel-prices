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
      lastPublishedForecastPeriod: '', // e.g. '1-7 czerwca 2026'
      lastCheckTime: ''
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
  
  logActivity('[BOT] Sprawdzanie strony e-petrol.pl pod kątem nowych danych...');
  const scrapeResult = await scrapeFuelPrices();
  
  db.lastCheckTime = new Date().toISOString();
  saveDatabase(db);

  if (!scrapeResult.success) {
    logActivity(`[BŁĄD] Nie udało się pobrać danych: ${scrapeResult.error}`);
    return { success: false, error: scrapeResult.error };
  }

  const { maxPrices, forecasts } = scrapeResult;
  let postedMaxPrices = false;
  let postedForecasts = false;

  // 1. Process Daily Maximum Prices
  if (maxPrices && maxPrices.dates.length >= 2) {
    const tomorrowDate = maxPrices.dates[1];
    
    // Check if tomorrow's date is newer than the last published date
    if (tomorrowDate !== db.lastPublishedMaxPriceDate || options.force) {
      logActivity(`[NOWE DANE] Wykryto nowe ceny maksymalne na dzień: ${tomorrowDate}!`);
      
      try {
        logActivity(`[BOT] Generowanie grafiki cen maksymalnych...`);
        const pngBuffer = await generateFuelCard('maxPrices', maxPrices, brandingText);
        
        logActivity(`[BOT] Rozpoczynam publikację cen maksymalnych...`);
        const publishResult = await publishPost('maxPrices', maxPrices, pngBuffer, logActivity);
        
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

  // 2. Process Weekly Forecasts (Usually released on Fridays)
  if (forecasts && forecasts.period) {
    const period = forecasts.period;
    
    if (period !== db.lastPublishedForecastPeriod || options.forceForecast) {
      logActivity(`[NOWE DANE] Wykryto nową prognozę tygodniową na okres: ${period}!`);
      
      try {
        logActivity(`[BOT] Generowanie grafiki prognoz...`);
        const pngBuffer = await generateFuelCard('forecasts', forecasts, brandingText);
        
        logActivity(`[BOT] Rozpoczynam publikację prognoz...`);
        const publishResult = await publishPost('forecasts', forecasts, pngBuffer, logActivity);
        
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
    postedForecasts
  };
}

 // Initializes the automated cron schedule.
 // Polls the website every 15 minutes between 9:00 AM and 3:59 PM (9-15 hours) daily.
function initScheduler() {
  logActivity('[SYSTEM] Inicjalizacja harmonogramu bota...');
  
  // Cron expression: '*/15 9-15 * * *' 
  // Runs every 15 minutes, starting at 9:00 AM and ending at 3:45 PM, every single day.
  // This covers the exact time window when new data is typically published by e-petrol.pl.
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
