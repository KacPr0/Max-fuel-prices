const fs = require('fs');

async function testFetch() {
  try {
    const res = await fetch('https://www.e-petrol.pl/');
    const text = await res.text();
    fs.writeFileSync('/Users/kacper/.gemini/antigravity/scratch/epetrol.html', text);
    console.log('Successfully fetched e-petrol.pl and saved to epetrol.html. Length:', text.length);
  } catch (err) {
    console.error('Error fetching e-petrol:', err);
  }
}

testFetch();
