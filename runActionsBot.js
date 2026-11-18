const dotenv = require('dotenv');
const { checkAndPublish, logActivity, loadDatabase } = require('./scheduler');

// Load environment variables (.env in local environment, or injected from GitHub Secrets)
dotenv.config();

// Data YYYY-MM-DD w strefie czasowej Polski (runner GitHub Actions działa w UTC).
function warsawDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

// Ostatni przebieg dnia wg harmonogramu z bot.yml ('*/15 8-15 * * *' UTC).
// GitHub potrafi opóźniać crony, więc liczymy wszystko od 15:45 UTC w górę.
function isLastRunOfDay() {
  const now = new Date();
  const h = now.getUTCHours(), m = now.getUTCMinutes();
  return h > 15 || (h === 15 && m >= 45);
}

// Obwieszczenia ukazują się w dni robocze (pn-pt), w weekend brak nowych cen to norma.
function isWeekdayInWarsaw() {
  const day = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Warsaw', weekday: 'short' });
  return !['Sat', 'Sun'].includes(day);
}

async function run() {
  const isManual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
  const tomorrow = warsawDate(1);

  // Punkt 2: jeśli ceny na jutro są już opublikowane, nie ma czego sprawdzać.
  const db = loadDatabase();
  if (!isManual && db.lastPublishedMaxPriceDate >= tomorrow) {
    console.log(`[GITHUB ACTIONS] Ceny na ${db.lastPublishedMaxPriceDate} już opublikowane - pomijam sprawdzanie.`);
    process.exit(0);
  }

  logActivity('[GITHUB ACTIONS] Rozpoczęcie automatycznego przebiegu bota...');

  let result;
  try {
    result = await checkAndPublish();
  } catch (error) {
    result = { success: false, error: error.message };
    console.error(error);
  }

  logActivity(`[GITHUB ACTIONS] Zakończenie przebiegu. Sukces: ${result.success}`);
  if (result.postedMaxPrices) logActivity('[GITHUB ACTIONS] Opublikowano nowe ceny maksymalne.');

  // Punkt 1: zgłaszamy awarię kodem wyjścia, żeby GitHub wysłał maila o nieudanym workflow.
  // Żeby nie dostawać maila co 15 minut, przy cronie robimy to tylko w ostatnim przebiegu dnia.
  const problems = [];
  if (!result.success) problems.push(`błąd przebiegu: ${result.error}`);
  if (result.publishFailed) problems.push('publikacja nie powiodła się na żadnej platformie');

  const publishedTomorrow = loadDatabase().lastPublishedMaxPriceDate >= tomorrow;
  if (isManual && problems.length) {
    logActivity(`[GITHUB ACTIONS BŁĄD] ${problems.join('; ')}`);
    process.exit(1);
  }
  if (!isManual && isLastRunOfDay() && isWeekdayInWarsaw() && !publishedTomorrow) {
    problems.push(`do końca dnia nie opublikowano cen maksymalnych na ${tomorrow}`);
    logActivity(`[GITHUB ACTIONS BŁĄD] ${problems.join('; ')}`);
    process.exit(1);
  }
  if (problems.length) {
    logActivity(`[GITHUB ACTIONS] Problemy (ponowna próba w kolejnym przebiegu): ${problems.join('; ')}`);
  }
  process.exit(0);
}

run();
