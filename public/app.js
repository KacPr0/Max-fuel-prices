// ==============================================================================
// CLIENT FRONTEND CONTROLLER - DYNAMIC BOT DASHBOARD
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // DOM Elements - Navigation & Core
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabs = document.querySelectorAll('.tab-content');
  const tabTitle = document.getElementById('current-tab-title');
  const tabDesc = document.getElementById('current-tab-desc');
  const sidebarStatus = document.getElementById('sidebar-status');

  // DOM Elements - Stat widgets
  const statMode = document.getElementById('stat-mode');
  const statModeSub = document.getElementById('stat-mode-sub');
  const statLastMax = document.getElementById('stat-last-max');
  const statLastForecast = document.getElementById('stat-last-forecast');
  const scrapedTime = document.getElementById('scraped-time');

  // DOM Elements - Price listings
  const priceMax95 = document.getElementById('price-max-95');
  const priceMax98 = document.getElementById('price-max-98');
  const priceMaxOn = document.getElementById('price-max-on');
  const priceFore95 = document.getElementById('price-fore-95');
  const priceFore98 = document.getElementById('price-fore-98');
  const priceForeOn = document.getElementById('price-fore-on');
  const priceForeLpg = document.getElementById('price-fore-lpg');

  // DOM Elements - Live Card Preview
  const imageCardPreview = document.getElementById('image-card-preview');
  const previewLoader = document.getElementById('preview-loader');
  const btnRefreshPreview = document.getElementById('btn-refresh-preview');
  const miniTabs = document.querySelectorAll('.mini-tab');
  let activePreviewType = 'maxPrices';

  // DOM Elements - Card Customizer
  const inputBranding = document.getElementById('input-branding');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const colorBg1 = document.getElementById('color-bg1');
  const colorBg2 = document.getElementById('color-bg2');
  const btnSaveBranding = document.getElementById('btn-save-branding');
  const imageCustomPreview = document.getElementById('image-custom-preview');
  const miniTabsCust = document.querySelectorAll('.mini-tab-cust');
  let activeCustType = 'maxPrices';

  // DOM Elements - API Settings Form
  const apiForm = document.getElementById('api-settings-form');
  const checkMockMode = document.getElementById('check-mock-mode');
  const inputXKey = document.getElementById('input-x-key');
  const inputXSecret = document.getElementById('input-x-secret');
  const inputXToken = document.getElementById('input-x-token');
  const inputXTokenSecret = document.getElementById('input-x-token-secret');
  const inputMetaToken = document.getElementById('input-meta-token');
  const inputMetaPageId = document.getElementById('input-meta-page-id');
  const inputMetaIgId = document.getElementById('input-meta-ig-id');
  const inputImgbbKey = document.getElementById('input-imgbb-key');
  const settingsSaveStatus = document.getElementById('settings-save-status');

  // DOM Elements - Logs Panel
  const consoleOutput = document.getElementById('console-output');
  const btnClearConsole = document.getElementById('btn-clear-console');

  // DOM Elements - Manual triggers
  const btnManualTrigger = document.getElementById('btn-manual-trigger');
  const btnTriggerForecast = document.getElementById('btn-trigger-forecast');

  // Global variables
  let currentBranding = '@MaksymalneCenyPaliw';
  let currentBg1 = '#060517';
  let currentBg2 = '#170514';

  // Tab Titles & Descriptions mapping
  const tabInfo = {
    dashboard: {
      title: 'Pulpit sterowniczy',
      desc: 'Podgląd aktualnych cen, harmonogramu i statusu bota.'
    },
    customizer: {
      title: 'Personalizacja grafiki',
      desc: 'Dostosuj wygląd karty cenowej (tło, kolorystykę, branding) publikowanej przez bota.'
    },
    settings: {
      title: 'Ustawienia połączeń API',
      desc: 'Zarządzaj kluczami i tokenami dla portali społecznościowych Facebook, Instagram i Twitter.'
    },
    console: {
      title: 'Konsola operacyjna',
      desc: 'Podgląd szczegółowych logów z działania bota w czasie rzeczywistym.'
    }
  };

  // ==============================================================================
  // TAB NAVIGATION LOGIC
  // ==============================================================================
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedTab = btn.getAttribute('data-tab');
      
      // Update sidebar active state
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update actual visible tab content
      tabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.id === `tab-${selectedTab}`) {
          tab.classList.add('active');
        }
      });

      // Update header titles
      tabTitle.textContent = tabInfo[selectedTab].title;
      tabDesc.textContent = tabInfo[selectedTab].desc;

      // Handle dynamic tab-specific updates
      if (selectedTab === 'console') {
        fetchLogs();
      } else if (selectedTab === 'customizer') {
        updateCustomizerPreview();
      } else if (selectedTab === 'dashboard') {
        fetchStatus();
        updateMainPreview();
      }
    });
  });

  // ==============================================================================
  // API INTEGRATIONS & DATA FETCHES
  // ==============================================================================

   // Fetches status of the server bot, update stats, sidebar indicators, and form states.
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      // Update sidebar status capsule
      sidebarStatus.className = 'bot-status-capsule';
      if (data.config.mockMode) {
        sidebarStatus.classList.add('mock');
        sidebarStatus.querySelector('.status-txt').textContent = 'Tryb Symulacji';
        
        statMode.textContent = 'Symulacja';
        statMode.style.color = 'var(--accent-warning)';
        statModeSub.textContent = 'Posty zapisywane lokalnie';
      } else {
        sidebarStatus.classList.add('online');
        sidebarStatus.querySelector('.status-txt').textContent = 'Bot Aktywny';
        
        statMode.textContent = 'Produkcyjny';
        statMode.style.color = 'var(--accent-success)';
        statModeSub.textContent = 'Wysyłanie na FB / IG / X';
      }

      // Update date stats
      statLastMax.textContent = data.db.lastPublishedMaxPriceDate || 'Brak publikacji';
      statLastForecast.textContent = data.db.lastPublishedForecastPeriod || 'Brak danych';

      // Update settings form input values (from existing .env loaded in backend)
      checkMockMode.checked = data.config.mockMode;
      currentBranding = data.config.brandingText;
      inputBranding.value = currentBranding;

    } catch (error) {
      console.error('Błąd pobierania statusu bota:', error);
      sidebarStatus.className = 'bot-status-capsule offline';
      sidebarStatus.querySelector('.status-txt').textContent = 'Rozłączono';
      
      statMode.textContent = 'Błąd połączenia';
      statMode.style.color = 'var(--accent-danger)';
    }
  }

   // Fetches current scraped fuel prices from backend and injects into UI.
  async function fetchPrices() {
    try {
      const res = await fetch('/api/prices');
      const data = await res.json();
      
      if (!data.success) {
        console.error('Błąd scrapowania:', data.error);
        scrapedTime.textContent = 'Błąd pobierania';
        scrapedTime.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        scrapedTime.style.color = 'var(--accent-danger)';
        return;
      }

      // Format scrape time
      const date = new Date(data.scrapedAt);
      scrapedTime.textContent = `Aktualizacja: ${date.toLocaleTimeString('pl-PL')} ${date.toLocaleDateString('pl-PL')}`;

      // Ingest Maximum Prices
      if (data.maxPrices) {
        priceMax95.textContent = `${data.maxPrices.pb95[1]} zł/l`;
        priceMax98.textContent = `${data.maxPrices.pb98[1]} zł/l`;
        priceMaxOn.textContent = `${data.maxPrices.on[1]} zł/l`;
      }

      // Ingest Forecasts
      if (data.forecasts) {
        priceFore95.textContent = `${data.forecasts.pb95} zł/l`;
        priceFore98.textContent = `${data.forecasts.pb98} zł/l`;
        priceForeOn.textContent = `${data.forecasts.on} zł/l`;
        priceForeLpg.textContent = `${data.forecasts.lpg} zł/l`;
      }

    } catch (error) {
      console.error('Błąd wstrzykiwania cen:', error);
    }
  }

   // Refreshes the main dashboard visual preview.
  function updateMainPreview() {
    previewLoader.classList.add('active');
    // Set src with parameters to trigger backend Sharp PNG rendering
    const url = `/api/preview/${activePreviewType}?branding=${encodeURIComponent(currentBranding)}&bg1=${encodeURIComponent(currentBg1)}&bg2=${encodeURIComponent(currentBg2)}&t=${Date.now()}`;
    
    imageCardPreview.onload = () => {
      previewLoader.classList.remove('active');
    };
    
    imageCardPreview.onerror = () => {
      previewLoader.classList.remove('active');
      console.error('Nie udało się wyrenderować podglądu.');
    };
    
    imageCardPreview.src = url;
  }

  // Dashboard Preview mini-tab selectors
  miniTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      miniTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activePreviewType = tab.getAttribute('data-preview-type');
      updateMainPreview();
    });
  });

  btnRefreshPreview.addEventListener('click', updateMainPreview);

  // ==============================================================================
  // CARD CUSTOMIZER ENGINE
  // ==============================================================================

   // Updates the Customizer dynamic preview card image.
  function updateCustomizerPreview() {
    const branding = inputBranding.value;
    const bg1 = colorBg1.value;
    const bg2 = colorBg2.value;

    const url = `/api/preview/${activeCustType}?branding=${encodeURIComponent(branding)}&bg1=${encodeURIComponent(bg1)}&bg2=${encodeURIComponent(bg2)}&t=${Date.now()}`;
    imageCustomPreview.src = url;
  }

  // Handle color pickers changes
  colorBg1.addEventListener('input', updateCustomizerPreview);
  colorBg2.addEventListener('input', updateCustomizerPreview);
  inputBranding.addEventListener('input', updateCustomizerPreview);

  // Mini-tab customizer selectors
  miniTabsCust.forEach(tab => {
    tab.addEventListener('click', () => {
      miniTabsCust.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCustType = tab.getAttribute('data-preview-type');
      updateCustomizerPreview();
    });
  });

  // Gradient preset selectors
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const bg1 = btn.getAttribute('data-bg1');
      const bg2 = btn.getAttribute('data-bg2');
      
      colorBg1.value = bg1;
      colorBg2.value = bg2;
      
      updateCustomizerPreview();
    });
  });

  // Saving branding changes to .env (via express endpoint)
  btnSaveBranding.addEventListener('click', async () => {
    try {
      btnSaveBranding.disabled = true;
      btnSaveBranding.textContent = 'Zapisywanie...';
      
      currentBranding = inputBranding.value;
      currentBg1 = colorBg1.value;
      currentBg2 = colorBg2.value;

      // Update settings on backend (.env file update)
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BRANDING_TEXT: currentBranding,
          PORT: 3000,
          MOCK_MODE: checkMockMode.checked ? 'true' : 'false',
          X_API_KEY: inputXKey.value,
          X_API_KEY_SECRET: inputXSecret.value,
          X_API_ACCESS_TOKEN: inputXToken.value,
          X_API_ACCESS_TOKEN_SECRET: inputXTokenSecret.value,
          META_PAGE_ACCESS_TOKEN: inputMetaToken.value,
          META_PAGE_ID: inputMetaPageId.value,
          META_INSTAGRAM_BUSINESS_ID: inputMetaIgId.value,
          IMGBB_API_KEY: inputImgbbKey.value
        })
      });

      if (!res.ok) throw new Error('Nie udało się zapisać konfiguracji.');

      btnSaveBranding.textContent = 'Zapisano!';
      btnSaveBranding.style.backgroundColor = 'var(--accent-success)';
      
      setTimeout(() => {
        btnSaveBranding.disabled = false;
        btnSaveBranding.textContent = 'Zastosuj zmiany';
        btnSaveBranding.style.backgroundColor = '';
      }, 2000);

      fetchStatus();
    } catch (err) {
      console.error(err);
      btnSaveBranding.disabled = false;
      btnSaveBranding.textContent = 'Błąd zapisu!';
    }
  });

  // ==============================================================================
  // API CONFIGURATION FORMS
  // ==============================================================================

   // Load existing credentials from server config status
  async function loadExistingAPICredentials() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      
      // Since it's a demo panel, passwords will remain masked on backend,
      // but we show placeholder or empty fields.
      // If we want the user to enter them, we provide empty inputs.
      
    } catch (err) {
      console.error(err);
    }
  }

  // Submit API Settings form
  apiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    settingsSaveStatus.className = 'status-msg';
    settingsSaveStatus.textContent = 'Zapisywanie kluczy API...';

    const payload = {
      MOCK_MODE: checkMockMode.checked ? 'true' : 'false',
      BRANDING_TEXT: currentBranding,
      PORT: 3000,
      X_API_KEY: inputXKey.value,
      X_API_KEY_SECRET: inputXSecret.value,
      X_API_ACCESS_TOKEN: inputXToken.value,
      X_API_ACCESS_TOKEN_SECRET: inputXTokenSecret.value,
      META_PAGE_ACCESS_TOKEN: inputMetaToken.value,
      META_PAGE_ID: inputMetaPageId.value,
      META_INSTAGRAM_BUSINESS_ID: inputMetaIgId.value,
      IMGBB_API_KEY: inputImgbbKey.value
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Nie udało się zapisać pliku .env.');

      settingsSaveStatus.classList.add('success');
      settingsSaveStatus.textContent = 'Sukces! Klucze zostały pomyślnie zapisane w pliku .env bota.';
      fetchStatus();
    } catch (err) {
      settingsSaveStatus.classList.add('error');
      settingsSaveStatus.textContent = `Błąd zapisu: ${err.message}`;
    }
  });

  // ==============================================================================
  // REAL-TIME CONSOLE LOGGING
  // ==============================================================================

   // Fetches latest bot log outputs from backend.
  async function fetchLogs() {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      
      consoleOutput.innerHTML = '';
      
      if (!data.logs || data.logs.length === 0) {
        consoleOutput.innerHTML = '<div class="console-line system">[SYSTEM] Konsola logów jest pusta.</div>';
        return;
      }

      data.logs.forEach(line => {
        if (!line.trim()) return;
        const lineEl = document.createElement('div');
        lineEl.className = 'console-line';
        
        // Color lines dynamically based on logs categories
        if (line.includes('[SYSTEM]')) {
          lineEl.classList.add('system');
        } else if (line.includes('[BŁĄD]') || line.includes('[WYJĄTEK]')) {
          lineEl.classList.add('error');
        } else if (line.includes('[MOCK]')) {
          lineEl.classList.add('mock');
        } else if (line.includes('[SUKCES]') || line.includes('[NOWE DANE]')) {
          lineEl.classList.add('success');
        }
        
        lineEl.textContent = line;
        consoleOutput.appendChild(lineEl);
      });
    } catch (err) {
      console.error('Błąd pobierania logów:', err);
    }
  }

  btnClearConsole.addEventListener('click', () => {
    consoleOutput.innerHTML = '<div class="console-line system">[SYSTEM] Widok konsoli wyczyszczony.</div>';
  });

  // Periodic polling for status, prices, and logs to ensure live dashboard experience
  setInterval(fetchStatus, 10000); // Poll status every 10 seconds
  setInterval(() => {
    if (document.getElementById('tab-console').classList.contains('active')) {
      fetchLogs();
    }
  }, 3000); // Poll logs every 3 seconds ONLY if active tab is Console

  // ==============================================================================
  // MANUAL POST TRIGGERS
  // ==============================================================================

   // Helper to trigger a manual post scrape-and-publish action on server.
  async function triggerManualPost(type = 'maxPrices') {
    const btn = type === 'forecasts' ? btnTriggerForecast : btnManualTrigger;
    const initialText = btn.innerHTML;
    
    try {
      btn.disabled = true;
      btn.innerHTML = `<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; display: inline-block; vertical-align: middle; margin-right: 8px;"></div> Publikowanie...`;

      const res = await fetch('/api/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, forceForecast: type === 'forecasts', type })
      });

      if (!res.ok) throw new Error('Nie udało się wyzwolić publikacji.');
      const data = await res.json();

      btn.innerHTML = `<i data-lucide="check-circle" style="vertical-align: middle;"></i> Gotowe!`;
      btn.style.backgroundColor = 'var(--accent-success)';
      lucide.createIcons();

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = initialText;
        btn.style.backgroundColor = '';
        lucide.createIcons();
      }, 3000);

      // Refresh data
      fetchStatus();
      fetchPrices();
      fetchLogs();
    } catch (err) {
      console.error(err);
      btn.innerHTML = `<i data-lucide="alert-triangle"></i> Błąd!`;
      btn.style.backgroundColor = 'var(--accent-danger)';
      lucide.createIcons();

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = initialText;
        btn.style.backgroundColor = '';
        lucide.createIcons();
      }, 3000);
    }
  }

  btnManualTrigger.addEventListener('click', () => triggerManualPost('maxPrices'));
  btnTriggerForecast.addEventListener('click', () => triggerManualPost('forecasts'));

  // ==============================================================================
  // INITIAL RUN
  // ==============================================================================
  fetchStatus();
  fetchPrices();
  setTimeout(updateMainPreview, 500); // Delay slightly to ensure server is ready
});
