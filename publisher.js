const fs = require('fs');
const path = require('path');
const { TwitterApi } = require('twitter-api-v2');

 // Parses polish price strings (e.g., "6,05") to floats.
function parsePrice(str) {
  if (!str) return 0;
  return parseFloat(str.replace(',', '.'));
}

 // Formats difference between tomorrow's and today's price.
function getPriceDiff(tomorrowStr, todayStr) {
  const tomorrow = parsePrice(tomorrowStr);
  const today = parsePrice(todayStr);
  if (!tomorrow || !today) return 'bez zmian';
  
  const diff = tomorrow - today;
  if (diff === 0) return 'bez zmian ▬';
  
  const diffFormatted = Math.abs(diff).toFixed(2).replace('.', ',');
  if (diff < 0) {
    return `spadek o -${diffFormatted} zł/l ↓`;
  } else {
    return `wzrost o +${diffFormatted} zł/l ↑`;
  }
}

 // Helper to upload image to ImgBB (Free Image Hosting) for Instagram.
 // Users can configure their own ImgBB API key or we can try a fallback.
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

 // Generates captions for the social media posts.
function generateCaption(type, data) {
  if (type === 'maxPrices') {
    const { dates, pb95, pb98, on } = data;
    const tomorrowDate = dates[1];
    
    const diff95 = getPriceDiff(pb95[1], pb95[0]);
    const diff98 = getPriceDiff(pb98[1], pb98[0]);
    const diffON = getPriceDiff(on[1], on[0]);

    return `⛽️ URZĘDOWE CENY MAKSYMALNE PALIW NA JUTRO (${tomorrowDate}) 🇵🇱\n\n` +
           `Od jutra na polskich stacjach benzynowych obowiązują nowe maksymalne ceny detaliczne paliw:\n\n` +
           `🟢 Pb95: ${pb95[1]} zł/l (${diff95})\n` +
           `🟢 Pb98: ${pb98[1]} zł/l (${diff98})\n` +
           `⚫️ Diesel (ON): ${on[1]} zł/l (${diffON})\n\n` +
           `⚠️ Są to ceny maksymalne ogłoszone na podstawie obwieszczenia Ministra Energii. Żadna stacja w Polsce nie może sprzedawać paliw powyżej tych stawek!\n\n` +
           `Śledź nas po codzienne aktualizacje cen! 🔔\n\n` +
           `#cenypaliw #paliwo #benzyna #diesel #stacjabenzynowa #kierowcy #samochody #polska #epetrol`;
  } else if (type === 'forecasts') {
    const { period, pb95, pb98, on, lpg } = data;

    return `⛽️ PROGNOZA DETALICZNYCH CEN PALIW (${period}) 🇵🇱\n\n` +
           `Analitycy e-petrol.pl zaprezentowali prognozowane przedziały cen paliw na nadchodzący tydzień:\n\n` +
           `🟢 Pb95: ${pb95} zł/l\n` +
           `🟢 Pb98: ${pb98} zł/l\n` +
           `⚫️ Diesel (ON): ${on} zł/l\n` +
           `🟠 Autogaz (LPG): ${lpg} zł/l\n\n` +
           `Jak oceniacie te prognozy? Spodziewacie się dalszych spadków czy wzrostów? Dajcie znać w komentarzach! 💬👇\n\n` +
           `#prognoza #cenypaliw #paliwo #benzyna #diesel #lpg #autogaz #kierowcy #samochody #polska #epetrol`;
  }
  return '';
}

 // Public posts publisher.
 // Supports mock mode and real APIs (Facebook, Instagram, Twitter/X).
async function publishPost(type, data, pngBuffer, addLogCallback = console.log) {
  const isMock = process.env.MOCK_MODE !== 'false';
  const caption = generateCaption(type, data);
  
  // Create history folder if it doesn't exist
  const historyDir = path.join(__dirname, 'history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filenamePrefix = `${type}_${timestamp}`;
  
  // Always save locally in history folder for record keeping
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
  if (process.env.X_API_KEY && process.env.X_API_ACCESS_TOKEN) {
    try {
      addLogCallback(`[X/Twitter] Rozpoczynam publikację na Twitter/X...`);
      const client = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_KEY_SECRET,
        accessToken: process.env.X_API_ACCESS_TOKEN,
        accessSecret: process.env.X_API_ACCESS_TOKEN_SECRET,
      });

      // Upload media
      const mediaId = await client.v1.uploadMedia(pngBuffer, { mimeType: 'image/png' });
      // Post tweet
      await client.v2.tweet({
        text: caption,
        media: { media_ids: [mediaId] }
      });
      addLogCallback(`[X/Twitter] Sukces! Post został opublikowany na Twitter/X.`);
      results.twitter.success = true;
    } catch (err) {
      addLogCallback(`[X/Twitter] Błąd: ${err.message}`);
      results.twitter.error = err.message;
    }
  } else {
    addLogCallback(`[X/Twitter] Pominięto (Brak skonfigurowanych kluczy API dla Twitter/X).`);
  }

  // 2. Facebook Publishing
  if (process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID) {
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
    addLogCallback(`[Facebook] Pominięto (Brak skonfigurowanych kluczy API dla Facebooka).`);
  }

  // 3. Instagram Publishing
  if (process.env.META_PAGE_ACCESS_TOKEN && process.env.META_INSTAGRAM_BUSINESS_ID) {
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
    addLogCallback(`[Instagram] Pominięto (Brak skonfigurowanych kluczy API / ID dla Instagrama).`);
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
