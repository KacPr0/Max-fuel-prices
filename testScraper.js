const { scrapeFuelPrices } = require('./scraper');

async function test() {
  console.log('Pobieram ceny maksymalne z Monitora Polskiego...');
  const result = await scrapeFuelPrices();
  console.log('Wynik scrapowania:');
  console.log(JSON.stringify(result, null, 2));
}

test();
