const { scrapeFuelPrices } = require('./scraper');

async function test() {
  console.log('Rozpoczynam scrapowanie e-petrol.pl...');
  const result = await scrapeFuelPrices();
  console.log('Wynik scrapowania:');
  console.log(JSON.stringify(result, null, 2));
}

test();
