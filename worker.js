export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OGAudioFinderBot is running!", {
        status: 200
      });
    }

    try {
      const update = await request.json();

      // Normal Telegram message
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = (update.message.text || "").trim();

        if (text === "/start") {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            "👋 Welcome to OG Audio Finder Bot!\n\n🎵 Song ka naam bhejo aur main uske matching tracks search karunga."
          );
          return new Response("OK");
        }

        if (!text) {
          await sendMessage(
            env.BOT_TOKEN,
            chatId,
            "🎵 Song ka naam type karke bhejo."
          );
          return new Response("OK");
        }

        await searchSongs(env.BOT_TOKEN, chatId, text);
        return new Response("OK");
      }

      // Button click
      if (update.callback_query) {
        const callback = update.callback_query;
        const data = callback.data || "";

        await answerCallback(env.BOT_TOKEN, callback.id);

        if (data.startsWith("song:")) {
          const trackId = data.substring(5);
          await sendTrack(env.BOT_TOKEN, callback.message.chat.id, trackId);
        }

        return new Response("OK");
      }

      return new Response("OK");

    } catch (error) {
      return new Response("OK");
    }
  }
};


// =========================
// SEARCH SONGS
// =========================

async function searchSongs(token, chatId, query) {
  const url =
    "https://itunes.apple.com/search?term=" +
    encodeURIComponent(query) +
    "&media=music&entity=song&limit=8";

  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    await sendMessage(
      token,
      chatId,
      "❌ Song nahi mila.\n\nKisi aur song ka naam try karo."
    );
    return;
  }

  const buttons = [];

  for (const song of data.results) {
    const title = song.trackName || "Unknown";
    const artist = song.artistName || "Unknown";

    buttons.push([
      {
        text: `🎵 ${title} — ${artist}`,
        callback_data: `song:${song.trackId}`
      }
    ]);
  }

  await sendMessageWithKeyboard(
    token,
    chatId,
    `🔎 Search results for: ${query}\n\n👇 Song select karo:`,
    buttons
  );
}


// =========================
// SEND SELECTED TRACK
// =========================

async function sendTrack(token, chatId, trackId) {
  const url =
    "https://itunes.apple.com/lookup?id=" +
    encodeURIComponent(trackId);

  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || !data.results[0]) {
    await sendMessage(
      token,
      chatId,
      "❌ Track details nahi mil paayi."
    );
    return;
  }

  const song = data.results[0];

  const title = song.trackName || "Unknown";
  const artist = song.artistName || "Unknown";
  const album = song.collectionName || "Unknown";
  const preview = song.previewUrl;

  let message =
    `🎵 ${title}\n` +
    `👤 Artist: ${artist}\n` +
    `💿 Album: ${album}\n\n`;

  if (preview) {
    message += "▶️ Neeche music preview diya hai.";
  } else {
    message += "⚠️ Is track ka preview available nahi hai.";
  }

  await sendMessage(token, chatId, message);

  if (preview) {
    await sendAudio(token, chatId, preview, title, artist);
  }
}


// =========================
// TELEGRAM SEND MESSAGE
// =========================

async function sendMessage(token, chatId, text) {
  const url =
    `https://api.telegram.org/bot${token}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}


// =========================
// TELEGRAM INLINE BUTTONS
// =========================

async function sendMessageWithKeyboard(
  token,
  chatId,
  text,
  buttons
) {
  const url =
    `https://api.telegram.org/bot${token}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      reply_markup: {
        inline_keyboard: buttons
      }
    })
  });
}


// =========================
// SEND AUDIO PREVIEW
// =========================

async function sendAudio(
  token,
  chatId,
  audioUrl,
  title,
  artist
) {
  const url =
    `https://api.telegram.org/bot${token}/sendAudio`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      audio: audioUrl,
      title: title,
      performer: artist
    })
  });
}


// =========================
// BUTTON LOADING OFF
// =========================

async function answerCallback(token, callbackId) {
  const url =
    `https://api.telegram.org/bot${token}/answerCallbackQuery`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      callback_query_id: callbackId
    })
  });
}
