const fs = require('fs');
const { scrapeFuelPrices } = require('./scraper');
const { generateFuelCard } = require('./imageGenerator');

async function test() {
  try {
    console.log('Pobieram dane z e-petrol.pl...');
    const data = await scrapeFuelPrices();
    
    if (!data.success) {
      console.error('Nie udało się pobrać danych:', data.error);
      return;
    }
    
    console.log('Generuję testową grafikę cen maksymalnych z symulacją zmian (+, -, bez zmian)...');
    if (data.maxPrices) {
      // Symulujemy dane, aby zobaczyć wszystkie trzy stany na raz:
      const testData = {
        ...data.maxPrices,
        // Pb95: spadek z 5,99 na 5,95 (minus, kolor zielony)
        pb95: ["5,99", "5,95"], 
        // Pb98: wzrost z 6,50 na 6,54 (plus, kolor czerwony)
        pb98: ["6,50", "6,54"], 
        // ON: bez zmian na poziomie 6,40 (kolor szary)
        on: ["6,40", "6,40"]
      };

      const pngBuffer = await generateFuelCard('maxPrices', testData, '@MaksymalneCenyPaliw');
      fs.writeFileSync('./test_max_prices.png', pngBuffer);
      console.log('✅ Zapisano grafikę testową do test_max_prices.png!');
    }
    
    console.log('Generuję grafikę prognoz tygodniowych...');
    if (data.forecasts) {
      const pngBuffer = await generateFuelCard('forecasts', data.forecasts, '@MaksymalneCenyPaliw');
      fs.writeFileSync('./test_forecasts.png', pngBuffer);
      console.log('✅ Zapisano grafikę prognoz do test_forecasts.png!');
    }
  } catch (error) {
    console.error('Błąd podczas testu generowania grafiki:', error);
  }
}

test();
