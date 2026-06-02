const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

 // Loads the logo image and returns it as a Base64 data URL.
function getLogoBase64() {
  try {
    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Błąd wczytywania logo do SVG:', err);
  }
  return '';
}


 // Parses polish price strings (e.g., "6,05") to floats.
function parsePrice(str) {
  if (!str) return 0;
  return parseFloat(str.replace(',', '.'));
}

 // Formats difference between tomorrow's and today's price.
function getPriceDiff(tomorrowStr, todayStr) {
  const tomorrow = parsePrice(tomorrowStr);
  const today = parsePrice(todayStr);
  if (!tomorrow || !today) return { sign: '', value: 'bez zmian', color: '#94a3b8' };
  
  const diff = tomorrow - today;
  if (diff === 0) {
    return { sign: '', value: 'bez zmian', color: '#94a3b8' };
  }
  
  const diffFormatted = Math.abs(diff).toFixed(2).replace('.', ',');
  if (diff < 0) {
    return { sign: '-', value: `${diffFormatted} zł`, color: '#10b981' };
  } else {
    return { sign: '+', value: `${diffFormatted} zł`, color: '#ef4444' };
  }
}

 // Generates a beautiful SVG string for Maximum Fuel Prices.
function generateMaxPricesSVG(data, brandingText, customOptions = {}) {
  const {
    dates,
    pb95,
    pb98,
    on
  } = data;

  const todayDate = dates[0];
  const tomorrowDate = dates[1];

  const diff95 = getPriceDiff(pb95[1], pb95[0]);
  const diff98 = getPriceDiff(pb98[1], pb98[0]);
  const diffON = getPriceDiff(on[1], on[0]);

  // Options for custom styling (e.g. gradient colors)
  const bgGrad1 = customOptions.bgGrad1 || '#060517'; // Very dark indigo/blue
  const bgGrad2 = customOptions.bgGrad2 || '#170514'; // Very dark magenta/black

  const logoBase64 = getLogoBase64();
  const footerBranding = logoBase64 
    ? `<text class="footer-branding" x="818" y="0" text-anchor="end">${brandingText}</text>
       <image href="${logoBase64}" x="834" y="-32" width="48" height="48" />`
    : `<text class="footer-branding" x="880" y="0" text-anchor="end">${brandingText}</text>`;


  return `
    <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Background Gradient -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bgGrad1}" />
          <stop offset="100%" stop-color="${bgGrad2}" />
        </linearGradient>
        
        <!-- Glassmorphism Filter -->
        <filter id="blurFilter">
          <feGaussianBlur stdDeviation="20" />
        </filter>
        
        <!-- Glowing Orbs Gradients -->
        <radialGradient id="orbGreen" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </radialGradient>
        
        <radialGradient id="orbViolet" cx="80%" cy="70%" r="60%">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
        </radialGradient>

        <!-- Fuel Badge Gradients -->
        <linearGradient id="badge95" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>

        <linearGradient id="badge98" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#047857" />
          <stop offset="100%" stop-color="#064e3b" />
        </linearGradient>

        <linearGradient id="badgeON" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#475569" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>

      <!-- Fonts Import (Styled directly in SVG) -->
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&amp;family=Inter:wght@400;600;700&amp;display=swap');
        .title-main { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 56px; fill: #ffffff; letter-spacing: 2px; }
        .title-sub { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 26px; fill: #a5b4fc; letter-spacing: 3px; }
        .date-label { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 24px; fill: #94a3b8; }
        .date-val { font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 38px; fill: #f8fafc; }
        
        .fuel-badge-txt { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 46px; fill: #ffffff; text-anchor: middle; }
        .fuel-name { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 22px; fill: #94a3b8; }
        .price-val { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 68px; fill: #ffffff; }
        .price-unit { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 28px; fill: #64748b; }
        
        .diff-val { font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 30px; }
        .diff-arrow { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 36px; }
        .comparison-label { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 18px; fill: #64748b; }

        .footer-txt { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 24px; fill: #475569; letter-spacing: 1px; }
        .footer-branding { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 28px; fill: #a5b4fc; letter-spacing: 1.5px; }
      </style>

      <!-- 1. Background -->
      <rect width="1080" height="1350" fill="url(#bgGrad)" />
      
      <!-- Ambient Glowing Orbs -->
      <circle cx="200" cy="350" r="500" fill="url(#orbGreen)" />
      <circle cx="900" cy="1000" r="500" fill="url(#orbViolet)" />

      <!-- 2. Header Section -->
      <g transform="translate(100, 140)">
        <text class="title-sub" x="0" y="0">MAKSYMALNE CENY PALIW</text>
        <text class="title-main" x="0" y="65">NA POLSKICH STACJACH</text>
      </g>

      <!-- 3. Date Panel (Glassmorphism Capsule) -->
      <g transform="translate(100, 300)">
        <!-- Capsule Card background -->
        <rect width="880" height="110" rx="24" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1.5" />
        
        <!-- Left Side: Today -->
        <text class="date-label" x="40" y="45">Obowiązuje od:</text>
        <text class="date-val" x="40" y="85">${tomorrowDate}</text>

        <!-- Dynamic note -->
        <rect x="520" y="30" width="320" height="50" rx="12" fill="#ef4444" fill-opacity="0.1" stroke="#ef4444" stroke-opacity="0.2" stroke-width="1" />
        <text font-family="'Inter', sans-serif" font-weight="700" font-size="18" fill="#ef4444" x="680" y="61" text-anchor="middle">URZĘDOWA CENA MAX</text>
      </g>

      <!-- 4. Fuel Cards Container -->
      <!-- We have 3 items: Pb95, Pb98, ON -->
      
      <!-- CARD 1: Pb95 -->
      <g transform="translate(100, 460)">
        <!-- Card glass background -->
        <rect width="880" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <!-- Fuel Badge -->
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badge95)" />
        <text class="fuel-badge-txt" x="80" y="94">95</text>
        
        <text class="fuel-name" x="160" y="66">Pb95</text>

        <!-- Price -->
        <text x="160" y="124" text-anchor="start">
          <tspan class="price-val">${pb95[1]}</tspan>
          <tspan class="price-unit" dx="8">zł/l</tspan>
        </text>

        <!-- Comparison panel -->
        <line x1="480" y1="40" x2="480" y2="120" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5" />
        
        <g transform="translate(520, 0)">
          <text class="comparison-label" x="0" y="55">poprzednio: ${pb95[0]} zł</text>
          <text class="diff-val" fill="${diff95.color}" x="0" y="105">
            ${diff95.sign ? `<tspan class="diff-sign" dy="-2">${diff95.sign}</tspan><tspan dy="2">${diff95.value}</tspan>` : `${diff95.value}`}
          </text>
        </g>
      </g>

      <!-- CARD 2: Pb98 -->
      <g transform="translate(100, 650)">
        <rect width="880" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badge98)" />
        <text class="fuel-badge-txt" x="80" y="94">98</text>
        
        <text class="fuel-name" x="160" y="66">Pb98</text>

        <text x="160" y="124" text-anchor="start">
          <tspan class="price-val">${pb98[1]}</tspan>
          <tspan class="price-unit" dx="8">zł/l</tspan>
        </text>

        <line x1="480" y1="40" x2="480" y2="120" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5" />
        
        <g transform="translate(520, 0)">
          <text class="comparison-label" x="0" y="55">poprzednio: ${pb98[0]} zł</text>
          <text class="diff-val" fill="${diff98.color}" x="0" y="105">
            ${diff98.sign ? `<tspan class="diff-sign" dy="-2">${diff98.sign}</tspan><tspan dy="2">${diff98.value}</tspan>` : `${diff98.value}`}
          </text>
        </g>
      </g>

      <!-- CARD 3: ON (Diesel) -->
      <g transform="translate(100, 840)">
        <rect width="880" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badgeON)" />
        <text class="fuel-badge-txt" x="80" y="94">ON</text>
        
        <text class="fuel-name" x="160" y="66">ON (Diesel)</text>

        <text x="160" y="124" text-anchor="start">
          <tspan class="price-val">${on[1]}</tspan>
          <tspan class="price-unit" dx="8">zł/l</tspan>
        </text>

        <line x1="480" y1="40" x2="480" y2="120" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5" />
        
        <g transform="translate(520, 0)">
          <text class="comparison-label" x="0" y="55">poprzednio: ${on[0]} zł</text>
          <text class="diff-val" fill="${diffON.color}" x="0" y="105">
            ${diffON.sign ? `<tspan class="diff-sign" dy="-2">${diffON.sign}</tspan><tspan dy="2">${diffON.value}</tspan>` : `${diffON.value}`}
          </text>
        </g>
      </g>

      <!-- 5. Footer Section -->
      <g transform="translate(100, 1220)">
        <text class="footer-txt" x="0" y="0">Źródło: e-petrol.pl</text>
        ${footerBranding}
      </g>
    </svg>
  `;
}

 // Generates a beautiful SVG string for Weekly Fuel Forecasts.
function generateForecastsSVG(data, brandingText, customOptions = {}) {
  const {
    period,
    pb95,
    pb98,
    on,
    lpg
  } = data;

  const bgGrad1 = customOptions.bgGrad1 || '#060517'; // Very dark indigo/blue
  const bgGrad2 = customOptions.bgGrad2 || '#170514'; // Very dark magenta/black

  const logoBase64 = getLogoBase64();
  const footerBranding = logoBase64 
    ? `<text class="footer-branding" x="818" y="0" text-anchor="end">${brandingText}</text>
       <image href="${logoBase64}" x="834" y="-32" width="48" height="48" />`
    : `<text class="footer-branding" x="880" y="0" text-anchor="end">${brandingText}</text>`;


  return `
    <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bgGrad1}" />
          <stop offset="100%" stop-color="${bgGrad2}" />
        </linearGradient>
        
        <radialGradient id="orbGold" cx="20%" cy="80%" r="70%">
          <stop offset="0%" stop-color="#eab308" stop-opacity="0.2" />
          <stop offset="100%" stop-color="#eab308" stop-opacity="0" />
        </radialGradient>
        
        <radialGradient id="orbViolet" cx="80%" cy="30%" r="60%">
          <stop offset="0%" stop-color="#d946ef" stop-opacity="0.2" />
          <stop offset="100%" stop-color="#d946ef" stop-opacity="0" />
        </radialGradient>

        <linearGradient id="badge95" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="100%" stop-color="#059669" />
        </linearGradient>

        <linearGradient id="badge98" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#047857" />
          <stop offset="100%" stop-color="#064e3b" />
        </linearGradient>

        <linearGradient id="badgeON" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#475569" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>

        <linearGradient id="badgeLPG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#ea580c" />
        </linearGradient>
      </defs>

      <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&amp;family=Inter:wght@400;600;700&amp;display=swap');
        .title-main { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 56px; fill: #ffffff; letter-spacing: 2px; }
        .title-sub { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 26px; fill: #c084fc; letter-spacing: 3px; }
        .date-label { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 24px; fill: #cbd5e1; }
        .date-val { font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 38px; fill: #f8fafc; }
        
        .fuel-badge-txt { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 46px; fill: #ffffff; text-anchor: middle; }
        .fuel-name { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 22px; fill: #94a3b8; }
        .price-val { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 44px; fill: #ffffff; }
        .price-unit { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 20px; fill: #64748b; }
        
        .footer-txt { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 24px; fill: #5b21b6; letter-spacing: 1px; }
        .footer-branding { font-family: 'Outfit', sans-serif; font-weight: 800; font-size: 28px; fill: #c084fc; letter-spacing: 1.5px; }
      </style>

      <!-- 1. Background -->
      <rect width="1080" height="1350" fill="url(#bgGrad)" />
      
      <!-- Glowing Orbs -->
      <circle cx="200" cy="1000" r="500" fill="url(#orbGold)" />
      <circle cx="900" cy="350" r="500" fill="url(#orbViolet)" />

      <!-- 2. Header Section -->
      <g transform="translate(100, 140)">
        <text class="title-sub" x="0" y="0">PROGNOZY CEN PALIW</text>
        <text class="title-main" x="0" y="65">NA NADCHODZĄCY TYDZIEŃ</text>
      </g>

      <!-- 3. Period Panel -->
      <g transform="translate(100, 300)">
        <rect width="880" height="110" rx="24" fill="#ffffff" fill-opacity="0.04" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1.5" />
        <text class="date-label" x="40" y="45">Prognoza na okres:</text>
        <text class="date-val" x="40" y="85">${period}</text>

        <rect x="580" y="30" width="260" height="50" rx="12" fill="#eab308" fill-opacity="0.1" stroke="#eab308" stroke-opacity="0.2" stroke-width="1" />
        <text font-family="'Inter', sans-serif" font-weight="700" font-size="18" fill="#eab308" x="710" y="61" text-anchor="middle">PRZEWIDYWANE CENY</text>
      </g>

      <!-- 4. Fuel Cards - 4 items in a 2x2 Grid (160px Height, matching Max Prices!) -->
      <!-- Row 1: Pb95 & Pb98 -->
      <!-- Pb95 -->
      <g transform="translate(100, 480)">
        <rect width="420" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badge95)" />
        <text class="fuel-badge-txt" x="80" y="94">95</text>
        
        <text class="fuel-name" x="150" y="66">Pb95</text>

        <text x="150" y="124" text-anchor="start">
          <tspan class="price-val">${pb95}</tspan>
          <tspan class="price-unit" dx="5">zł/l</tspan>
        </text>
      </g>

      <!-- Pb98 -->
      <g transform="translate(560, 480)">
        <rect width="420" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badge98)" />
        <text class="fuel-badge-txt" x="80" y="94">98</text>
        
        <text class="fuel-name" x="150" y="66">Pb98</text>

        <text x="150" y="124" text-anchor="start">
          <tspan class="price-val">${pb98}</tspan>
          <tspan class="price-unit" dx="5">zł/l</tspan>
        </text>
      </g>

      <!-- Row 2: ON & LPG -->
      <!-- ON -->
      <g transform="translate(100, 700)">
        <rect width="420" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badgeON)" />
        <text class="fuel-badge-txt" x="80" y="94">ON</text>
        
        <text class="fuel-name" x="150" y="66">Diesel</text>

        <text x="150" y="124" text-anchor="start">
          <tspan class="price-val">${on}</tspan>
          <tspan class="price-unit" dx="5">zł/l</tspan>
        </text>
      </g>

      <!-- LPG -->
      <g transform="translate(560, 700)">
        <rect width="420" height="160" rx="28" fill="#ffffff" fill-opacity="0.03" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1.5" />
        
        <rect x="30" y="30" width="100" height="100" rx="20" fill="url(#badgeLPG)" />
        <text class="fuel-badge-txt" style="font-size: 30px;" x="80" y="90">LPG</text>
        
        <text class="fuel-name" x="150" y="66">Autogaz</text>

        <text x="150" y="124" text-anchor="start">
          <tspan class="price-val">${lpg}</tspan>
          <tspan class="price-unit" dx="5">zł/l</tspan>
        </text>
      </g>

      <!-- 5. Footer Section -->
      <g transform="translate(100, 1220)">
        <text class="footer-txt" x="0" y="0">Źródło: e-petrol.pl</text>
        ${footerBranding}
      </g>
    </svg>
  `;
}

 // Main function to generate the PNG card buffer from scraped data.
 // @param {'maxPrices' | 'forecasts'} type
 // @param {any} data Scraped data object
 // @param {string} brandingText User branding (e.g. "@CenyPaliwBot")
 // @param {any} customOptions Custom styling parameters
 // @returns {Promise<Buffer>} PNG image buffer
async function generateFuelCard(type, data, brandingText = '@MaksymalneCenyPaliw', customOptions = {}) {
  try {
    let svgString = '';
    
    if (type === 'maxPrices') {
      svgString = generateMaxPricesSVG(data, brandingText, customOptions);
    } else if (type === 'forecasts') {
      svgString = generateForecastsSVG(data, brandingText, customOptions);
    } else {
      throw new Error(`Nieznany typ grafiki: ${type}`);
    }

    // Convert SVG string to PNG buffer using sharp
    const pngBuffer = await sharp(Buffer.from(svgString))
      .png()
      .toBuffer();

    return pngBuffer;
  } catch (error) {
    console.error('Błąd podczas generowania grafiki paliwowej:', error);
    throw error;
  }
}

module.exports = {
  generateFuelCard,
  generateMaxPricesSVG,
  generateForecastsSVG
};
