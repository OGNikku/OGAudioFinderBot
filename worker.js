export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OGAudioFinderBot is running!", {
        status: 200
      });
    }

    try {
      const update = await request.json();

      console.log("TELEGRAM UPDATE RECEIVED");

      // =========================
      // NORMAL MESSAGE
      // =========================
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = (update.message.text || "").trim();

        console.log("CHAT ID:", chatId);
        console.log("MESSAGE TEXT:", text);

        if (text === "/start") {
          await sendTelegram(
            env.BOT_TOKEN,
            "sendMessage",
            {
              chat_id: chatId,
              text:
                "👋 Welcome to OG Audio Finder Bot!\n\n" +
                "🎵 Song ka naam bhejo aur main uske matching tracks search karunga."
            }
          );

          return new Response("OK");
        }

        if (!text) {
          await sendTelegram(
            env.BOT_TOKEN,
            "sendMessage",
            {
              chat_id: chatId,
              text: "🎵 Song ka naam type karke bhejo."
            }
          );

          return new Response("OK");
        }

        await searchSongs(
          env.BOT_TOKEN,
          chatId,
          text
        );

        return new Response("OK");
      }

      // =========================
      // BUTTON CLICK
      // =========================
      if (update.callback_query) {
        const callback = update.callback_query;
        const data = callback.data || "";

        console.log("BUTTON CLICK:", data);

        await sendTelegram(
          env.BOT_TOKEN,
          "answerCallbackQuery",
          {
            callback_query_id: callback.id
          }
        );

        if (data.startsWith("song:")) {
          const trackId = data.substring(5);

          await sendTrack(
            env.BOT_TOKEN,
            callback.message.chat.id,
            trackId
          );
        }

        return new Response("OK");
      }

      return new Response("OK");

    } catch (error) {

      console.error(
        "========== OG BOT ERROR =========="
      );

      console.error(
        error?.stack || String(error)
      );

      console.error(
        "=================================="
      );

      return new Response("OK");
    }
  }
};


// ==================================================
// SEARCH SONGS
// ==================================================

async function searchSongs(token, chatId, query) {

  console.log("SEARCH START:", query);

  const url =
    "https://itunes.apple.com/search?term=" +
    encodeURIComponent(query) +
    "&media=music&entity=song&limit=8";

  console.log("ITUNES URL:", url);

  const response = await fetch(url);

  console.log(
    "ITUNES STATUS:",
    response.status
  );

  const raw = await response.text();

  console.log(
    "ITUNES RESPONSE:",
    raw.substring(0, 1500)
  );

  if (!response.ok) {
    throw new Error(
      "iTunes API HTTP ERROR: " +
      response.status
    );
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "iTunes JSON parse error: " +
      String(error)
    );
  }

  console.log(
    "ITUNES RESULT COUNT:",
    data.results?.length || 0
  );

  if (
    !data.results ||
    data.results.length === 0
  ) {

    await sendTelegram(
      token,
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "❌ Song nahi mila.\n\n" +
          "Kisi aur song ka naam try karo."
      }
    );

    return;
  }

  const buttons = [];

  for (const song of data.results) {

    const title =
      song.trackName || "Unknown";

    const artist =
      song.artistName || "Unknown";

    const trackId =
      song.trackId;

    console.log(
      "TRACK:",
      title,
      "|",
      artist,
      "|",
      trackId
    );

    buttons.push([
      {
        text:
          `🎵 ${title} — ${artist}`,
        callback_data:
          `song:${trackId}`
      }
    ]);
  }

  await sendTelegram(
    token,
    "sendMessage",
    {
      chat_id: chatId,
      text:
        `🔎 Search results for: ${query}\n\n` +
        `👇 Song select karo:`,
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  );

  console.log(
    "SEARCH RESULTS SENT SUCCESSFULLY"
  );
}


// ==================================================
// SEND SELECTED TRACK
// ==================================================

async function sendTrack(
  token,
  chatId,
  trackId
) {

  console.log(
    "TRACK LOOKUP:",
    trackId
  );

  const url =
    "https://itunes.apple.com/lookup?id=" +
    encodeURIComponent(trackId);

  const response =
    await fetch(url);

  console.log(
    "LOOKUP STATUS:",
    response.status
  );

  const raw =
    await response.text();

  console.log(
    "LOOKUP RESPONSE:",
    raw.substring(0, 1500)
  );

  if (!response.ok) {
    throw new Error(
      "iTunes lookup HTTP ERROR: " +
      response.status
    );
  }

  const data =
    JSON.parse(raw);

  if (
    !data.results ||
    !data.results[0]
  ) {

    await sendTelegram(
      token,
      "sendMessage",
      {
        chat_id: chatId,
        text:
          "❌ Track details nahi mil paayi."
      }
    );

    return;
  }

  const song =
    data.results[0];

  const title =
    song.trackName || "Unknown";

  const artist =
    song.artistName || "Unknown";

  const album =
    song.collectionName || "Unknown";

  const preview =
    song.previewUrl;

  let message =
    `🎵 ${title}\n` +
    `👤 Artist: ${artist}\n` +
    `💿 Album: ${album}\n\n`;

  if (preview) {
    message +=
      "▶️ Neeche music preview diya hai.";
  } else {
    message +=
      "⚠️ Is track ka preview available nahi hai.";
  }

  await sendTelegram(
    token,
    "sendMessage",
    {
      chat_id: chatId,
      text: message
    }
  );

  if (preview) {

    await sendTelegram(
      token,
      "sendAudio",
      {
        chat_id: chatId,
        audio: preview,
        title: title,
        performer: artist
      }
    );
  }
}


// ==================================================
// TELEGRAM API
// ==================================================

async function sendTelegram(
  token,
  method,
  payload
) {

  const url =
    `https://api.telegram.org/bot${token}/${method}`;

  console.log(
    "TELEGRAM CALL:",
    method
  );

  const response =
    await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(payload)
    });

  const body =
    await response.text();

  console.log(
    `TELEGRAM ${method} STATUS:`,
    response.status
  );

  console.log(
    `TELEGRAM ${method} RESPONSE:`,
    body.substring(0, 1500)
  );

  if (!response.ok) {
    throw new Error(
      `Telegram ${method} failed: ` +
      `${response.status} ` +
      body
    );
  }

  return body;
}
