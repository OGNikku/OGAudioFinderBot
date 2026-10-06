const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error("ERROR: BOT_TOKEN is missing!");
  process.exit(1);
}

const bot = new TelegramBot(token, {
  polling: true
});

console.log("=================================");
console.log("OG AUDIO FINDER BOT STARTED");
console.log("Telegram polling is active");
console.log("=================================");


// ===============================
// START COMMAND
// ===============================

bot.onText(/^\/start$/, async (msg) => {

  const chatId = msg.chat.id;

  console.log("START COMMAND:", chatId);

  await bot.sendMessage(
    chatId,
    "👋 Welcome to OG Audio Finder Bot!\n\n" +
    "🎵 Song ka naam bhejo aur main uske matching tracks search karunga."
  );
});


// ===============================
// TEXT MESSAGE
// ===============================

bot.on("message", async (msg) => {

  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // /start ko dobara process mat karo
  if (!text || text === "/start") {
    return;
  }

  console.log("SEARCH REQUEST:", text);

  try {

    await bot.sendChatAction(chatId, "typing");

    const url =
      "https://itunes.apple.com/search?term=" +
      encodeURIComponent(text) +
      "&media=music&entity=song&limit=8";

    console.log("Searching iTunes:", text);

    const response = await fetch(url);

    console.log(
      "iTunes status:",
      response.status
    );

    if (!response.ok) {
      throw new Error(
        "iTunes API returned " +
        response.status
      );
    }

    const data = await response.json();

    console.log(
      "Results:",
      data.results?.length || 0
    );

    if (
      !data.results ||
      data.results.length === 0
    ) {

      await bot.sendMessage(
        chatId,
        "❌ Song nahi mila.\n\n" +
        "Kisi aur song ka naam try karo."
      );

      return;
    }


    // ===============================
    // RESULT BUTTONS
    // ===============================

    const buttons = [];

    for (const song of data.results) {

      const title =
        song.trackName || "Unknown";

      const artist =
        song.artistName || "Unknown";

      const trackId =
        song.trackId;

      buttons.push([
        {
          text:
            `🎵 ${title} — ${artist}`,

          callback_data:
            `song:${trackId}`
        }
      ]);
    }


    await bot.sendMessage(
      chatId,

      `🔎 Search results for: ${text}\n\n` +
      `👇 Song select karo:`,

      {
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );

    console.log(
      "Search results sent successfully."
    );

  } catch (error) {

    console.error(
      "SEARCH ERROR:",
      error
    );

    await bot.sendMessage(
      chatId,
      "⚠️ Song search karte waqt problem aa gayi.\n\n" +
      "Thodi der baad dobara try karo."
    );
  }
});


// ===============================
// SONG BUTTON CLICK
// ===============================

bot.on("callback_query", async (query) => {

  const data = query.data || "";
  const chatId = query.message?.chat?.id;

  console.log(
    "BUTTON CLICK:",
    data
  );

  try {

    await bot.answerCallbackQuery(
      query.id
    );

    if (!data.startsWith("song:")) {
      return;
    }

    const trackId =
      data.substring(5);

    const url =
      "https://itunes.apple.com/lookup?id=" +
      encodeURIComponent(trackId);

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        "Track lookup failed: " +
        response.status
      );
    }

    const result =
      await response.json();

    if (
      !result.results ||
      !result.results[0]
    ) {

      await bot.sendMessage(
        chatId,
        "❌ Track details nahi mil paayi."
      );

      return;
    }

    const song =
      result.results[0];

    const title =
      song.trackName || "Unknown";

    const artist =
      song.artistName || "Unknown";

    const album =
      song.collectionName || "Unknown";

    const preview =
      song.previewUrl;


    let message =
      `🎵 ${title}\n\n` +
      `👤 Artist: ${artist}\n` +
      `💿 Album: ${album}\n\n`;

    if (preview) {

      message +=
        "▶️ Music preview neeche diya hai.";

    } else {

      message +=
        "⚠️ Is track ka preview available nahi hai.";
    }


    await bot.sendMessage(
      chatId,
      message
    );


    // ===============================
    // AUDIO PREVIEW
    // ===============================

    if (preview) {

      await bot.sendAudio(
        chatId,
        preview,
        {
          title: title,
          performer: artist
        }
      );

    }

  } catch (error) {

    console.error(
      "TRACK ERROR:",
      error
    );

    if (chatId) {

      await bot.sendMessage(
        chatId,
        "⚠️ Track load karne mein problem aa gayi."
      );
    }
  }
});


// ===============================
// ERROR HANDLING
// ===============================

bot.on("polling_error", (error) => {

  console.error(
    "TELEGRAM POLLING ERROR:",
    error.message
  );

});


process.on("uncaughtException", (error) => {

  console.error(
    "UNCAUGHT EXCEPTION:",
    error
  );

});


process.on("unhandledRejection", (error) => {

  console.error(
    "UNHANDLED REJECTION:",
    error
  );

});
