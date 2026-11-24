const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');
const { formatEffectiveDate } = require('./imageGenerator');

// Parses polish price strings (e.g., "6,05") to floats.
function parsePrice(str) {
  if (!str) return 0;
  return parseFloat(str.replace(',', '.'));
}

// Zmiana ceny względem poprzedniego obwieszczenia, np. "bez zmian", "+0,01 zł", "−0,07 zł".
function getPriceDiff(tomorrowStr, todayStr) {
  const tomorrow = parsePrice(tomorrowStr);
  const today = parsePrice(todayStr);
  const diff = Math.round((tomorrow - today) * 100) / 100;
  if (!tomorrow || !today || diff === 0) return 'bez zmian';
  const value = Math.abs(diff).toFixed(2).replace('.', ',');
  return diff < 0 ? `−${value} zł` : `+${value} zł`;
}

// Helper to upload image to ImgBB (Free Image Hosting) for Instagram.
async function uploadToImgBB(pngBuffer) {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("Brak klucza IMGBB_API_KEY w pliku .env. Instagram wymaga publicznego adresu URL obrazka. Zarejestruj się na imgbb.com i uzyskaj klucz.");
  }

  const formData = new FormData();
  formData.append('image', new Blob([pngBuffer], { type: 'image/png' }));

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Błąd wysyłania do ImgBB: ${errorText}`);
  }

  const json = await res.json();
  return json.data.url;
}

// Opisy postów. Na X krótsza wersja (limit 280 znaków), bez zdania o źródle.
function generateCaption(type, data, platform = 'meta') {
  if (type === 'maxPrices') {
    const { dates, pb95, pb98, on } = data;
    const lines = [
      `Benzyna 95: ${pb95[1]} zł/l (${getPriceDiff(pb95[1], pb95[0])})`,
      `Benzyna 98: ${pb98[1]} zł/l (${getPriceDiff(pb98[1], pb98[0])})`,
      `Olej napędowy: ${on[1]} zł/l (${getPriceDiff(on[1], on[0])})`
    ].join('\n');
    const header = `Ceny maksymalne paliw od ${formatEffectiveDate(dates[1])}`;

    if (platform === 'twitter') {
      return `${header}\n\n${lines}\n\nStacje nie mogą sprzedawać paliwa drożej.\n\n#cenypaliw #paliwo`;
    }

    // "M.P. 2026 poz. 1150 (zm. poz. 1154)" -> "M.P. 2026 poz. 1150, zm. poz. 1154"
    const source = data.source
      ? `Źródło: obwieszczenie Ministra Energii, ${data.source.replace(/\s*\((zm\. poz\. [^)]+)\)/, ', $1')}.`
      : 'Źródło: obwieszczenie Ministra Energii.';
    return `${header}\n\n${lines}\n\nStacje nie mogą sprzedawać paliwa drożej. ${source}\n\n` +
           `#cenypaliw #paliwo #benzyna #diesel #stacjabenzynowa #kierowcy #polska`;
  }

  if (type === 'custom') {
    const textToUse = data.caption && data.caption.trim() ? data.caption : data.text;
    return `${textToUse}\n\n#cenypaliw #polska`;
  }
  return '';
}

// Public posts publisher.
// Supports mock mode and single-image posts.
async function publishPost(type, data, pngBuffer, addLogCallback = console.log, platforms = ['facebook', 'instagram', 'twitter']) {
  const isMock = process.env.MOCK_MODE !== 'false';
  
  const caption = generateCaption(type, data);
  const twitterCaption = generateCaption(type, data, 'twitter');
  
  // Create history folder if it doesn't exist
  const historyDir = path.join(__dirname, 'history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filenamePrefix = `${type}_${timestamp}`;
  
  // Save locally in history folder for record keeping
  fs.writeFileSync(path.join(historyDir, `${filenamePrefix}.png`), pngBuffer);
  fs.writeFileSync(path.join(historyDir, `${filenamePrefix}.txt`), caption);
  addLogCallback(`[SYSTEM] Zapisano kopię posta lokalnie w history/${filenamePrefix}.png`);
  

  if (isMock) {
    addLogCallback(`[MOCK] Pominięto rzeczywistą publikację (Włączony MOCK_MODE).`);
    return {
      success: true,
      mode: 'mock',
      savedFiles: {
        image: `history/${filenamePrefix}.png`,
        text: `history/${filenamePrefix}.txt`
      },
      caption
    };
  }

  const results = {
    twitter: { success: false, error: null },
    facebook: { success: false, error: null },
    instagram: { success: false, error: null }
  };

  // 1. Twitter (X) Publishing
  if (platforms.includes('twitter') && process.env.X_API_KEY && process.env.X_API_ACCESS_TOKEN) {
    try {
      addLogCallback(`[X/Twitter] Rozpoczynam publikację na Twitter/X...`);
      const client = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_KEY_SECRET,
        accessToken: process.env.X_API_ACCESS_TOKEN,
        accessSecret: process.env.X_API_ACCESS_TOKEN_SECRET,
      });

      try {
        addLogCallback(`[X/Twitter] Próba przesłania obrazu na Twitter/X...`);
        const mediaId = await client.v1.uploadMedia(pngBuffer, { mimeType: 'image/png' });
        await client.v2.tweet({
          text: twitterCaption,
          media: { media_ids: [mediaId] }
        });
        
        addLogCallback(`[X/Twitter] Sukces! Post został opublikowany na Twitter/X.`);
        results.twitter.success = true;
      } catch (mediaErr) {
        addLogCallback(`[X/Twitter] Wykryto brak pakietu płatnego (błąd 402/403) lub inny problem z mediami. Uruchamiam darmowy fallback tekstowy...`);
        await client.v2.tweet({
          text: twitterCaption
        });
        addLogCallback(`[X/Twitter] Sukces! Darmowy post tekstowy został opublikowany na Twitter/X.`);
        results.twitter.success = true;
      }
    } catch (err) {
      addLogCallback(`[X/Twitter] Krytyczny błąd: ${err.message}`);
      results.twitter.error = err.message;
    }
  } else {
    addLogCallback(`[X/Twitter] Pominięto (Brak skonfigurowanych kluczy API dla Twitter/X lub platforma niezaznaczona).`);
  }

  // 2. Facebook Publishing
  if (platforms.includes('facebook') && process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID) {
    try {
      addLogCallback(`[Facebook] Rozpoczynam publikację na Facebook Page...`);
      const pageId = process.env.META_PAGE_ID;
      const accessToken = process.env.META_PAGE_ACCESS_TOKEN;

      const formData = new FormData();
      formData.append('source', new Blob([pngBuffer], { type: 'image/png' }), 'card.png');
      formData.append('message', caption);
      formData.append('access_token', accessToken);

      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const json = await res.json();
      addLogCallback(`[Facebook] Sukces! Post opublikowany. ID postu: ${json.post_id || json.id}`);
      
      results.facebook.success = true;
    } catch (err) {
      addLogCallback(`[Facebook] Błąd: ${err.message}`);
      results.facebook.error = err.message;
    }
  } else {
    addLogCallback(`[Facebook] Pominięto (Brak skonfigurowanych kluczy API dla Facebooka lub platforma niezaznaczona).`);
  }

  // 3. Instagram Publishing
  if (platforms.includes('instagram') && process.env.META_PAGE_ACCESS_TOKEN && process.env.META_INSTAGRAM_BUSINESS_ID) {
    try {
      addLogCallback(`[Instagram] Rozpoczynam publikację na Instagramie...`);
      const igId = process.env.META_INSTAGRAM_BUSINESS_ID;
      const accessToken = process.env.META_PAGE_ACCESS_TOKEN;

      addLogCallback(`[Instagram] Krok 1/3: Przesyłanie wygenerowanego obrazu do chmury (wymagane publiczne URL)...`);
      const imageUrl = await uploadToImgBB(pngBuffer);
      addLogCallback(`[Instagram] Krok 1/3: Sukces! Obraz dostępny pod adresem: ${imageUrl}`);

      addLogCallback(`[Instagram] Krok 2/3: Tworzenie kontenera mediów w API Meta...`);
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${igId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${accessToken}`,
        { method: 'POST' }
      );

      if (!containerRes.ok) {
        const errText = await containerRes.text();
        throw new Error(`Błąd tworzenia kontenera: ${errText}`);
      }

      const containerJson = await containerRes.json();
      const creationId = containerJson.id;
      addLogCallback(`[Instagram] Krok 2/3: Sukces! ID kontenera: ${creationId}`);

      addLogCallback(`[Instagram] Oczekiwanie na przetworzenie kontenera przez Meta (30 sek)...`);
      await new Promise(resolve => setTimeout(resolve, 30000));

      addLogCallback(`[Instagram] Krok 3/3: Publikowanie kontenera na profilu...`);
      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${igId}/media_publish?creation_id=${creationId}&access_token=${accessToken}`,
        { method: 'POST' }
      );

      if (!publishRes.ok) {
        const errText = await publishRes.text();
        throw new Error(`Błąd publikacji kontenera: ${errText}`);
      }

      const publishJson = await publishRes.json();
      addLogCallback(`[Instagram] Sukces! Post opublikowany na Instagramie. ID: ${publishJson.id}`);
      
      results.instagram.success = true;
    } catch (err) {
      addLogCallback(`[Instagram] Błąd: ${err.message}`);
      results.instagram.error = err.message;
    }
  } else {
    addLogCallback(`[Instagram] Pominięto (Brak skonfigurowanych kluczy API / ID dla Instagrama lub platforma niezaznaczona).`);
  }

  return {
    success: results.twitter.success || results.facebook.success || results.instagram.success,
    mode: 'production',
    results
  };
}

module.exports = {
  publishPost,
  generateCaption
};
