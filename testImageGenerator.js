const fs = require('fs');
const { scrapeFuelPrices } = require('./scraper');
const { generateFuelCard } = require('./imageGenerator');

async function test() {
  try {
    console.log('Pobieram dane...');
    const data = await scrapeFuelPrices();
    
    if (!data.success) {
      console.error('Nie udało się pobrać danych:', data.error);
      return;
    }
    
    console.log('Generuję grafikę cen maksymalnych...');
    if (data.maxPrices) {
      const pngBuffer = await generateFuelCard('maxPrices', data.maxPrices, '@MaksymalneCenyPaliw');
      fs.writeFileSync('./test_max_prices.png', pngBuffer);
      console.log('Zapisano grafikę cen maksymalnych do test_max_prices.png!');
    }
    
    console.log('Generuję grafikę prognoz tygodniowych...');
    if (data.forecasts) {
      const pngBuffer = await generateFuelCard('forecasts', data.forecasts, '@MaksymalneCenyPaliw');
      fs.writeFileSync('./test_forecasts.png', pngBuffer);
      console.log('Zapisano grafikę prognoz do test_forecasts.png!');
    }
  } catch (error) {
    console.error('Błąd podczas testu generowania grafiki:', error);
  }
}

test();
