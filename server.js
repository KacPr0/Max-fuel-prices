const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { scrapeFuelPrices } = require('./scraper');
const { generateFuelCard } = require('./imageGenerator');
const { checkAndPublish, initScheduler, loadDatabase, logActivity } = require('./scheduler');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure logs exist
const logPath = path.join(__dirname, 'bot_activity.log');
if (!fs.existsSync(logPath)) {
  fs.writeFileSync(logPath, `[SYSTEM] Bot uruchomiony po raz pierwszy.\n`);
}

// Ensure db exists
loadDatabase();

// Initalize scheduler
let schedulerTask = initScheduler();

// ==============================================================================
// API ENDPOINTS
// ==============================================================================

 // GET /api/status
 // Returns current status of the bot, database, and configurations.
app.get('/api/status', (req, res) => {
  const db = loadDatabase();
  const config = {
    mockMode: process.env.MOCK_MODE !== 'false',
    brandingText: process.env.BRANDING_TEXT || '@MaksymalneCenyPaliw',
    port: PORT,
    hasTwitterKeys: !!(process.env.X_API_KEY && process.env.X_API_ACCESS_TOKEN),
    hasMetaKeys: !!(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID),
    hasIgKeys: !!(process.env.META_PAGE_ACCESS_TOKEN && process.env.META_INSTAGRAM_BUSINESS_ID),
    hasImgbbKey: !!process.env.IMGBB_API_KEY
  };

  res.json({
    status: 'online',
    config,
    db,
    serverTime: new Date().toISOString()
  });
});

 // GET /api/prices
 // Scrapes current prices from e-petrol.pl and returns them.
app.get('/api/prices', async (req, res) => {
  const data = await scrapeFuelPrices();
  res.json(data);
});

 // GET /api/preview/:type
 // Renders the SVG card and returns a live PNG image file.
 // Supports custom query params: bg1 (color), bg2 (color), branding (text).
app.get('/api/preview/:type', async (req, res) => {
  try {
    const type = req.params.type;
    const data = await scrapeFuelPrices();
    
    if (!data.success) {
      return res.status(500).json({ error: 'Nie udało się pobrać danych ze strony.' });
    }

    const branding = req.query.branding || process.env.BRANDING_TEXT || '@MaksymalneCenyPaliw';
    const bg1 = req.query.bg1;
    const bg2 = req.query.bg2;
    const customOptions = {};
    if (bg1) customOptions.bgGrad1 = bg1;
    if (bg2) customOptions.bgGrad2 = bg2;

    let pngBuffer;
    if (type === 'maxPrices') {
      if (!data.maxPrices) return res.status(404).json({ error: 'Brak danych o cenach maksymalnych.' });
      pngBuffer = await generateFuelCard('maxPrices', data.maxPrices, branding, customOptions);
    } else if (type === 'forecasts') {
      if (!data.forecasts) return res.status(404).json({ error: 'Brak danych o prognozach.' });
      pngBuffer = await generateFuelCard('forecasts', data.forecasts, branding, customOptions);
    } else {
      return res.status(400).json({ error: 'Nieprawidłowy typ podglądu.' });
    }

    res.set('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (error) {
    console.error('Błąd podglądu grafiki:', error);
    res.status(500).json({ error: error.message });
  }
});

 // GET /api/logs
 // Returns the last 100 lines of bot_activity.log
app.get('/api/logs', (req, res) => {
  try {
    if (!fs.existsSync(logPath)) {
      return res.json({ logs: [] });
    }
    const fileContent = fs.readFileSync(logPath, 'utf8');
    const lines = fileContent.trim().split('\n').reverse();
    res.json({ logs: lines.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

 // POST /api/trigger
 // Manually trigger scraping and publishing.
 // Optional body: { force: true, forceForecast: true }
app.post('/api/trigger', async (req, res) => {
  try {
    const { force, forceForecast, type } = req.body;
    logActivity(`[MANUAL] Ręczne wyzwolenie publikacji przez Panel Administracyjny.`);
    
    let result;
    if (type === 'forecasts') {
      result = await checkAndPublish({ forceForecast: true });
    } else {
      result = await checkAndPublish({ force: force !== false });
    }
    
    res.json(result);
  } catch (error) {
    logActivity(`[BŁĄD MANUAL] ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

 // POST /api/settings
 // Updates .env file configuration dynamically and reloads environment.
app.post('/api/settings', (req, res) => {
  try {
    const settings = req.body;
    const envPath = path.join(__dirname, '.env');
    
    // Read current .env
    let currentEnv = '';
    if (fs.existsSync(envPath)) {
      currentEnv = fs.readFileSync(envPath, 'utf8');
    }

    // Build new .env contents
    const lines = [];
    lines.push(`PORT=${settings.PORT || process.env.PORT || 3000}`);
    lines.push(`MOCK_MODE=${settings.MOCK_MODE}`);
    lines.push(`BRANDING_TEXT=${settings.BRANDING_TEXT || '@MaksymalneCenyPaliw'}`);
    lines.push('');
    lines.push(`# API KEYS (Twitter/X)`);
    lines.push(`X_API_KEY=${settings.X_API_KEY || ''}`);
    lines.push(`X_API_KEY_SECRET=${settings.X_API_KEY_SECRET || ''}`);
    lines.push(`X_API_ACCESS_TOKEN=${settings.X_API_ACCESS_TOKEN || ''}`);
    lines.push(`X_API_ACCESS_TOKEN_SECRET=${settings.X_API_ACCESS_TOKEN_SECRET || ''}`);
    lines.push('');
    lines.push(`# API KEYS (Meta FB/IG)`);
    lines.push(`META_PAGE_ACCESS_TOKEN=${settings.META_PAGE_ACCESS_TOKEN || ''}`);
    lines.push(`META_PAGE_ID=${settings.META_PAGE_ID || ''}`);
    lines.push(`META_INSTAGRAM_BUSINESS_ID=${settings.META_INSTAGRAM_BUSINESS_ID || ''}`);
    lines.push('');
    lines.push(`# Cloud Image Host for Instagram (ImgBB)`);
    lines.push(`IMGBB_API_KEY=${settings.IMGBB_API_KEY || ''}`);

    fs.writeFileSync(envPath, lines.join('\n'));
    
    // Reload dotenv
    dotenv.config({ path: envPath, override: true });
    
    logActivity(`[SYSTEM] Zaktualizowano ustawienia i klucze API z poziomu Dashboardu.`);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  logActivity(`[SYSTEM] Serwer bota uruchomiony na porcie ${PORT}`);
  logActivity(`[SYSTEM] Panel Web dostępny pod adresem: http://localhost:${PORT}`);
});
