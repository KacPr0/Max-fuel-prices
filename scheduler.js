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
      lastPublishedMaxPriceDate: '' // e.g. '2026-05-30'
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
        return { success: true, postedCustom: true, publishResult };
      } else {
        logActivity(`[BŁĄD] Publikacja własnego posta nie powiodła się.`);
        return { success: false, error: 'Błąd publikacji', publishResult };
      }
    } catch (err) {
      logActivity(`[WYJĄTEK] Błąd podczas przetwarzania custom posta: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  logActivity('[BOT] Sprawdzanie Monitora Polskiego pod kątem nowych cen maksymalnych...');
  const scrapeResult = await scrapeFuelPrices();

  if (!scrapeResult.success) {
    logActivity(`[BŁĄD] Nie udało się pobrać danych: ${scrapeResult.error}`);
    return { success: false, error: scrapeResult.error };
  }

  const { maxPrices } = scrapeResult;
  if (maxPrices && maxPrices.via) logActivity(`[BOT] Ceny maksymalne pobrane z: ${maxPrices.via} (${maxPrices.source}).`);

  // Zabezpieczenie: nie publikujemy jako "na jutro" cen, które już obowiązują
  // (np. gdy awaryjne źródło ma opóźnienie i nie ma jeszcze dzisiejszego obwieszczenia).
  const todayWarsaw = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  if (maxPrices && maxPrices.dates.length >= 2 && maxPrices.dates[1] <= todayWarsaw && !options.force) {
    logActivity(`[INFO] Najnowsze ceny maksymalne (od ${maxPrices.dates[1]}) już obowiązują - czekam na nowe obwieszczenie.`);
    return { success: true, scrapedAt: scrapeResult.scrapedAt, postedMaxPrices: false, publishFailed: false, info: 'Brak nowego obwieszczenia.' };
  }
  let postedMaxPrices = false;
  let publishFailed = false;

  // Publikacja cen maksymalnych na jutro
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
          publishFailed = true;
        }
      } catch (err) {
        logActivity(`[WYJĄTEK] Błąd podczas przetwarzania cen maksymalnych: ${err.message}`);
        publishFailed = true;
      }
    } else {
      logActivity(`[INFO] Ceny maksymalne na dzień ${tomorrowDate} zostały już wcześniej opublikowane.`);
    }
  }

  return {
    success: true,
    scrapedAt: scrapeResult.scrapedAt,
    postedMaxPrices,
    publishFailed
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
