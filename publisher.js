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
  if (diff === 0) return 'bez zmian';
  
  const diffFormatted = Math.abs(diff).toFixed(2).replace('.', ',');
  if (diff < 0) {
    return `-${diffFormatted} zł/l`;
  } else {
    return `+${diffFormatted} zł/l`;
  }
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

// Generates captions for the social media posts.
function generateCaption(type, data, platform = 'meta') {
  if (type === 'combined') {
    const { maxPrices, forecasts } = data;
    const tomorrowDate = maxPrices.dates[1];
    const diff95 = getPriceDiff(maxPrices.pb95[1], maxPrices.pb95[0]);
    const diff98 = getPriceDiff(maxPrices.pb98[1], maxPrices.pb98[0]);
    const diffON = getPriceDiff(maxPrices.on[1], maxPrices.on[0]);

    if (platform === 'twitter') {
      return `PIĄTKOWE PODSUMOWANIE\n\n` +
             `MAX NA JUTRO:\n` +
             `🟢 Pb95: ${maxPrices.pb95[1]} (${diff95})\n` +
             `🟢 Pb98: ${maxPrices.pb98[1]} (${diff98})\n` +
             `⚫️ ON: ${maxPrices.on[1]} (${diffON})\n\n` +
             `PROGNOZA (${forecasts.period}):\n` +
             `🟢 Pb95: ${forecasts.pb95}\n` +
             `🟢 Pb98: ${forecasts.pb98}\n` +
             `⚫️ ON: ${forecasts.on}\n` +
             `🟠 LPG: ${forecasts.lpg}\n\n` +
             `#cenypaliw`;
    }

    return `PIĄTKOWE PODSUMOWANIE\n\n` +
           `URZĘDOWE CENY MAKSYMALNE NA JUTRO (${tomorrowDate})\n` +
           `🟢 Pb95: ${maxPrices.pb95[1]} zł/l (${diff95})\n` +
           `🟢 Pb98: ${maxPrices.pb98[1]} zł/l (${diff98})\n` +
           `⚫️ ON: ${maxPrices.on[1]} zł/l (${diffON})\n\n` +
           `PROGNOZA DETALICZNYCH CEN NA TYDZIEŃ (${forecasts.period})\n` +
           `🟢 Pb95: ${forecasts.pb95} zł/l\n` +
           `🟢 Pb98: ${forecasts.pb98} zł/l\n` +
           `⚫️ ON: ${forecasts.on} zł/l\n` +
           `🟠 LPG: ${forecasts.lpg} zł/l\n\n` +
           `#cenypaliw #paliwo #benzyna #diesel #lpg #autogaz #polska #epetrol`;
  }

  if (platform === 'twitter') {
    if (type === 'maxPrices') {
      const { dates, pb95, pb98, on } = data;
      const tomorrowDate = dates[1];
      
      const diff95 = getPriceDiff(pb95[1], pb95[0]);
      const diff98 = getPriceDiff(pb98[1], pb98[0]);
      const diffON = getPriceDiff(on[1], on[0]);

      return `URZĘDOWE CENY MAKSYMALNE NA JUTRO (${tomorrowDate})\n\n` +
             `🟢 Pb95: ${pb95[1]} zł/l (${diff95})\n` +
             `🟢 Pb98: ${pb98[1]} zł/l (${diff98})\n` +
             `⚫️ ON: ${on[1]} zł/l (${diffON})\n\n` +
             `Żadna stacja nie może sprzedawać drożej! ⚠️\n\n` +
             `#cenypaliw #polska #epetrol`;
    } else if (type === 'forecasts') {
      const { period, pb95, pb98, on, lpg } = data;

      return `PROGNOZA CEN PALIW (${period})n\n` +
             `🟢 Pb95: ${pb95} zł/l\n` +
             `🟢 Pb98: ${pb98} zł/l\n` +
             `⚫️ ON: ${on} zł/l\n` +
             `🟠 LPG: ${lpg} zł/l\n\n` +
             `#cenypaliw #polska #epetrol`;
    }
  }

  if (type === 'maxPrices') {
    const { dates, pb95, pb98, on } = data;
    const tomorrowDate = dates[1];
    
    const diff95 = getPriceDiff(pb95[1], pb95[0]);
    const diff98 = getPriceDiff(pb98[1], pb98[0]);
    const diffON = getPriceDiff(on[1], on[0]);

    return `URZĘDOWE CENY MAKSYMALNE PALIW NA JUTRO (${tomorrowDate})\n\n` +
           `Od jutra na polskich stacjach benzynowych obowiązują nowe maksymalne ceny detaliczne paliw:\n\n` +
           `🟢 Pb95: ${pb95[1]} zł/l (${diff95})\n` +
           `🟢 Pb98: ${pb98[1]} zł/l (${diff98})\n` +
           `⚫️ Diesel (ON): ${on[1]} zł/l (${diffON})\n\n` +
           `⚠️ Są to ceny maksymalne ogłoszone na podstawie obwieszczenia Ministra Energii. Żadna stacja w Polsce nie może sprzedawać paliw powyżej tych stawek!\n\n` +
           `Śledź nas po codzienne aktualizacje cen!\n\n` +
           `#cenypaliw #paliwo #benzyna #diesel #stacjabenzynowa #kierowcy #samochody #polska #epetrol`;
  } else if (type === 'forecasts') {
    const { period, pb95, pb98, on, lpg } = data;

    return `PROGNOZA DETALICZNYCH CEN PALIW (${period})\n\n` +
           `Analitycy e-petrol.pl zaprezentowali prognozowane przedziały cen paliw na nadchodzący tydzień:\n\n` +
           `🟢 Pb95: ${pb95} zł/l\n` +
           `🟢 Pb98: ${pb98} zł/l\n` +
           `⚫️ Diesel (ON): ${on} zł/l\n` +
           `🟠 Autogaz (LPG): ${lpg} zł/l\n\n` +
           `#prognoza #cenypaliw #paliwo #benzyna #diesel #lpg #autogaz #kierowcy #samochody #polska #epetrol`;
  } else if (type === 'custom') {
    const textToUse = data.caption && data.caption.trim() ? data.caption : data.text;
    return `${textToUse}\n\n#cenypaliw #polska`;
  }
  return '';
}

// Public posts publisher.
// Supports mock mode, single-image posts, and multi-image carousel posts.
async function publishPost(type, data, pngBuffer, addLogCallback = console.log, platforms = ['facebook', 'instagram', 'twitter']) {
  const isMock = process.env.MOCK_MODE !== 'false';
  const isCarousel = Array.isArray(pngBuffer);
  
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
  if (isCarousel) {
    for (let i = 0; i < pngBuffer.length; i++) {
      fs.writeFileSync(path.join(historyDir, `${filenamePrefix}_${i}.png`), pngBuffer[i]);
    }
    fs.writeFileSync(path.join(historyDir, `${filenamePrefix}.txt`), caption);
    addLogCallback(`[SYSTEM] Zapisano kopie karuzeli w history/${filenamePrefix}_X.png`);
  } else {
    fs.writeFileSync(path.join(historyDir, `${filenamePrefix}.png`), pngBuffer);
    fs.writeFileSync(path.join(historyDir, `${filenamePrefix}.txt`), caption);
    addLogCallback(`[SYSTEM] Zapisano kopię posta lokalnie w history/${filenamePrefix}.png`);
  }

  if (isMock) {
    addLogCallback(`[MOCK] Pominięto rzeczywistą publikację (Włączony MOCK_MODE).`);
    return {
      success: true,
      mode: 'mock',
      savedFiles: isCarousel ? {
        images: pngBuffer.map((_, i) => `history/${filenamePrefix}_${i}.png`),
        text: `history/${filenamePrefix}.txt`
      } : {
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
        if (isCarousel) {
          addLogCallback(`[X/Twitter] Próba przesłania obrazów karuzeli na Twitter/X...`);
          const mediaIds = [];
          for (const buf of pngBuffer) {
            const mediaId = await client.v1.uploadMedia(buf, { mimeType: 'image/png' });
            mediaIds.push(mediaId);
          }
          await client.v2.tweet({
            text: twitterCaption,
            media: { media_ids: mediaIds }
          });
        } else {
          addLogCallback(`[X/Twitter] Próba przesłania obrazu na Twitter/X...`);
          const mediaId = await client.v1.uploadMedia(pngBuffer, { mimeType: 'image/png' });
          await client.v2.tweet({
            text: twitterCaption,
            media: { media_ids: [mediaId] }
          });
        }
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

      if (isCarousel) {
        addLogCallback(`[Facebook] Krok 1/2: Przesyłanie obrazów jako nieopublikowane...`);
        const mediaIds = [];
        for (let i = 0; i < pngBuffer.length; i++) {
          const buffer = pngBuffer[i];
          const formData = new FormData();
          formData.append('source', new Blob([buffer], { type: 'image/png' }), `card_${i}.png`);
          formData.append('published', 'false');
          formData.append('access_token', accessToken);

          const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, {
            method: 'POST',
            body: formData
          });
          if (!uploadRes.ok) {
            throw new Error(`Błąd przesyłania zdjęcia składowego FB: ${await uploadRes.text()}`);
          }
          const uploadJson = await uploadRes.json();
          mediaIds.push(uploadJson.id);
        }

        addLogCallback(`[Facebook] Krok 2/2: Tworzenie połączonego posta karuzelowego...`);
        const feedData = new URLSearchParams();
        feedData.append('message', caption);
        feedData.append('access_token', accessToken);
        for (let i = 0; i < mediaIds.length; i++) {
          feedData.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: mediaIds[i] }));
        }

        const feedRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
          method: 'POST',
          body: feedData
        });
        if (!feedRes.ok) {
          throw new Error(`Błąd tworzenia posta FB z mediami: ${await feedRes.text()}`);
        }
        const feedJson = await feedRes.json();
        addLogCallback(`[Facebook] Sukces! Karuzela opublikowana. ID: ${feedJson.id}`);
      } else {
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
      }
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

      if (isCarousel) {
        addLogCallback(`[Instagram] Krok 1/3: Przesyłanie obrazów do ImgBB i tworzenie kontenerów składowych...`);
        const childIds = [];
        for (let i = 0; i < pngBuffer.length; i++) {
          const buffer = pngBuffer[i];
          addLogCallback(`[Instagram] Obraz ${i+1}/${pngBuffer.length} - Przesyłanie do ImgBB...`);
          const imageUrl = await uploadToImgBB(buffer);
          
          addLogCallback(`[Instagram] Obraz ${i+1}/${pngBuffer.length} - Tworzenie kontenera składowego...`);
          const childRes = await fetch(
            `https://graph.facebook.com/v19.0/${igId}/media?image_url=${encodeURIComponent(imageUrl)}&is_carousel_item=true&access_token=${accessToken}`,
            { method: 'POST' }
          );
          if (!childRes.ok) {
            throw new Error(`Błąd tworzenia kontenera składowego: ${await childRes.text()}`);
          }
          const childJson = await childRes.json();
          childIds.push(childJson.id);
        }

        addLogCallback(`[Instagram] Oczekiwanie na przetworzenie kontenerów przez Meta (5 sek)...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        addLogCallback(`[Instagram] Krok 2/3: Tworzenie głównego kontenera karuzeli...`);
        const parentRes = await fetch(
          `https://graph.facebook.com/v19.0/${igId}/media?media_type=CAROUSEL&caption=${encodeURIComponent(caption)}&children=${childIds.join(',')}&access_token=${accessToken}`,
          { method: 'POST' }
        );
        if (!parentRes.ok) {
          throw new Error(`Błąd tworzenia głównego kontenera karuzeli: ${await parentRes.text()}`);
        }
        const parentJson = await parentRes.json();
        const creationId = parentJson.id;

        await new Promise(resolve => setTimeout(resolve, 3000));

        addLogCallback(`[Instagram] Krok 3/3: Publikowanie karuzeli na profilu...`);
        const publishRes = await fetch(
          `https://graph.facebook.com/v19.0/${igId}/media_publish?creation_id=${creationId}&access_token=${accessToken}`,
          { method: 'POST' }
        );
        if (!publishRes.ok) {
          throw new Error(`Błąd publikacji karuzeli: ${await publishRes.text()}`);
        }
        const publishJson = await publishRes.json();
        addLogCallback(`[Instagram] Sukces! Karuzela opublikowana na Instagramie. ID: ${publishJson.id}`);
      } else {
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
      }
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
