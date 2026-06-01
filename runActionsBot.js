const dotenv = require('dotenv');
const { checkAndPublish, logActivity } = require('./scheduler');

// Load environment variables (.env in local environment, or injected from GitHub Secrets)
dotenv.config();

async function run() {
  logActivity('[GITHUB ACTIONS] Rozpoczęcie automatycznego przebiegu bota...');
  
  try {
    // We run checkAndPublish, which:
    // 1. Scrapes e-petrol.pl
    // 2. Checks db.json to see if these dates were already published
    // 3. If new data -> generates card PNG -> publishes to X, FB, IG
    // 4. Updates db.json and logs
    const result = await checkAndPublish();
    
    logActivity(`[GITHUB ACTIONS] Zakończenie przebiegu. Sukces: ${result.success}`);
    if (result.postedMaxPrices) {
      logActivity(`[GITHUB ACTIONS] Opublikowano nowe ceny maksymalne.`);
    }
    if (result.postedForecasts) {
      logActivity(`[GITHUB ACTIONS] Opublikowano nową prognozę tygodniową.`);
    }
    
    // Explicit exit
    process.exit(0);
  } catch (error) {
    logActivity(`[GITHUB ACTIONS BŁĄD KRYTYCZNY] ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

run();
