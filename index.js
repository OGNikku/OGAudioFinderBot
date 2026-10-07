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
console.log("Polling is active");
console.log("=================================");


// ==================================================
// SETTINGS
// ==================================================

const PAGE_SIZE = 8;

// Store active searches for users
const sessions = new Map();

// Store selected language
const languages = new Map();


// ==================================================
// HELPER FUNCTIONS
// ==================================================

function cleanText(text) {
  return String(text || "").trim();
}


function shorten(text, maxLength = 55) {
  text = cleanText(text);

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + "...";
}


function getSongTitle(song) {
  return song.trackName || "Unknown Track";
}


function getArtist(song) {
  return song.artistName || "Unknown Artist";
}


function getAlbum(song) {
  return song.collectionName || "Unknown Album";
}


// ==================================================
// LANGUAGE SELECTION
// ==================================================

async function showLanguageSelection(chatId) {

  await bot.sendMessage(
    chatId,

    `🌍 Choose Your Language

Please select your preferred language to continue using Audio Finder.

Choose one of the languages below:`,

    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🇬🇧 English",
              callback_data: "lang:en"
            }
          ],
          [
            {
              text: "🇪🇸 Español",
              callback_data: "lang:es"
            }
          ],
          [
            {
              text: "🇫🇷 Français",
              callback_data: "lang:fr"
            }
          ],
          [
            {
              text: "🇩🇪 Deutsch",
              callback_data: "lang:de"
            }
          ]
        ]
      }
    }
  );
}


// ==================================================
// ENGLISH WELCOME
// ==================================================

async function sendEnglishWelcome(chatId) {

  await bot.sendMessage(
    chatId,

`🎵 Welcome to Audio Finder!

Your personal music discovery assistant is here.

🔎 Search for any song by entering its name, artist, album, or a few words you remember.

🎧 Find matching tracks
🎶 Listen to available previews
📝 View available lyrics
🔄 Explore more matching tracks
✨ Discover different versions and artists

Just type the name of the song you are looking for and Audio Finder will search through thousands of available tracks for you.

👇 Simply send me a song name to get started!`
  );
}


// ==================================================
// START COMMAND
// ==================================================

bot.onText(/^\/start$/, async (msg) => {

  const chatId = msg.chat.id;

  console.log("START:", chatId);

  try {

    await showLanguageSelection(chatId);

  } catch (error) {

    console.error(
      "START ERROR:",
      error
    );

  }

});


// ==================================================
// SEARCH FUNCTION
// ==================================================

async function searchSongs(chatId, query) {

  console.log(
    "SEARCH:",
    chatId,
    query
  );

  await bot.sendChatAction(
    chatId,
    "typing"
  );

  const url =
    "https://itunes.apple.com/search" +
    "?term=" +
    encodeURIComponent(query) +
    "&media=music" +
    "&entity=song" +
    "&limit=50";

  const response =
    await fetch(url);

  console.log(
    "iTunes status:",
    response.status
  );

  if (!response.ok) {

    throw new Error(
      "iTunes search failed: " +
      response.status
    );

  }

  const data =
    await response.json();

  let results =
    data.results || [];

  // Remove duplicate tracks
  const uniqueTracks = [];
  const seen = new Set();

  for (const song of results) {

    if (!song.trackId) {
      continue;
    }

    if (seen.has(song.trackId)) {
      continue;
    }

    seen.add(song.trackId);

    uniqueTracks.push(song);
  }

  results = uniqueTracks;

  console.log(
    "RESULTS:",
    results.length
  );

  sessions.set(
    chatId,
    {
      query: query,
      results: results,
      page: 0
    }
  );

  return results;
}


// ==================================================
// RESULT KEYBOARD
// ==================================================

function createResultKeyboard(
  results,
  page
) {

  const keyboard = [];

  const start =
    page * PAGE_SIZE;

  const end =
    Math.min(
      start + PAGE_SIZE,
      results.length
    );


  for (
    let i = start;
    i < end;
    i++
  ) {

    const song =
      results[i];

    const title =
      getSongTitle(song);

    const artist =
      getArtist(song);

    keyboard.push([
      {
        text:
          `🎵 ${shorten(title, 32)} — ${shorten(artist, 25)}`,

        callback_data:
          `song:${song.trackId}`
      }
    ]);

  }


  const navigation = [];

  if (page > 0) {

    navigation.push({
      text: "⬅️ Previous",
      callback_data:
        `page:${page - 1}`
    });

  }


  if (end < results.length) {

    navigation.push({
      text: "➕ More Tracks",
      callback_data:
        `page:${page + 1}`
    });

  }


  if (navigation.length > 0) {

    keyboard.push(
      navigation
    );

  }


  return keyboard;
}


// ==================================================
// SEND SEARCH RESULTS
// ==================================================

async function sendSearchResults(
  chatId,
  page = 0,
  messageId = null
) {

  const session =
    sessions.get(chatId);

  if (!session) {
    return;
  }

  const results =
    session.results;

  const query =
    session.query;

  const start =
    page * PAGE_SIZE;

  const end =
    Math.min(
      start + PAGE_SIZE,
      results.length
    );


  const total =
    results.length;


  const message =

`🔎 Search Results

Results found for “${query}”

👇 Select a track:

Showing ${start + 1}-${end} of ${total} results`;


  const options = {

    reply_markup: {
      inline_keyboard:
        createResultKeyboard(
          results,
          page
        )
    }

  };


  if (messageId) {

    try {

      await bot.editMessageText(
        message,
        {
          chat_id: chatId,
          message_id: messageId,
          ...options
        }
      );

      return;

    } catch (error) {

      console.log(
        "EDIT MESSAGE FAILED:",
        error.message
      );

    }

  }


  await bot.sendMessage(
    chatId,
    message,
    options
  );
}


// ==================================================
// TRACK LOOKUP
// ==================================================

async function getTrack(trackId) {

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

  const data =
    await response.json();

  if (
    !data.results ||
    !data.results[0]
  ) {

    return null;
  }

  return data.results[0];
}


// ==================================================
// FIND TRACK FROM USER SESSION
// ==================================================

async function findTrack(
  chatId,
  trackId
) {

  const session =
    sessions.get(chatId);

  if (session) {

    const found =
      session.results.find(
        song =>
          String(song.trackId) ===
          String(trackId)
      );

    if (found) {
      return found;
    }

  }

  return await getTrack(trackId);
}


// ==================================================
// SONG DETAILS
// ==================================================

async function sendSongDetails(
  chatId,
  song
) {

  const title =
    getSongTitle(song);

  const artist =
    getArtist(song);

  const album =
    getAlbum(song);


  const message =

`🎵 ${title}

👤 Artist: ${artist}
💿 Album: ${album}

🎧 Available music preview is shown below.`;


  await bot.sendMessage(
    chatId,
    message,

    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📝 Lyrics",
              callback_data:
                `lyrics:${song.trackId}`
            }
          ],
          [
            {
              text: "🔙 Back to Results",
              callback_data:
                "back"
            }
          ]
        ]
      }
    }
  );
}


// ==================================================
// SEND AUDIO PROPERLY
// ==================================================

async function sendAudioPreview(
  chatId,
  song
) {

  const preview =
    song.previewUrl;

  if (!preview) {

    await bot.sendMessage(
      chatId,

`⚠️ Audio preview is not available for this track.

Please try another track.`
    );

    return;
  }


  await bot.sendChatAction(
    chatId,
    "upload_audio"
  );


  console.log(
    "Downloading preview:",
    preview
  );


  const response =
    await fetch(preview);


  if (!response.ok) {

    throw new Error(
      "Preview download failed: " +
      response.status
    );

  }


  const arrayBuffer =
    await response.arrayBuffer();


  const buffer =
    Buffer.from(arrayBuffer);


  const title =
    getSongTitle(song);

  const artist =
    getArtist(song);


  let fileName =
    `${title} - ${artist}`;

  fileName =
    fileName.replace(
      /[\\/:*?"<>|]/g,
      ""
    );

  fileName =
    fileName.substring(
      0,
      80
    );


  fileName += ".m4a";


  console.log(
    "Uploading audio:",
    fileName
  );


  await bot.sendAudio(

    chatId,

    buffer,

    {
      title: title,

      performer: artist,

      caption:
        `🎵 ${title}\n👤 ${artist}`,

      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📝 Lyrics",
              callback_data:
                `lyrics:${song.trackId}`
            }
          ],
          [
            {
              text: "🔙 Back to Results",
              callback_data:
                "back"
            }
          ]
        ]
      }
    },

    {
      filename: fileName,
      contentType: "audio/mp4"
    }

  );

}


// ==================================================
// LYRICS
// ==================================================

async function sendLyrics(
  chatId,
  song
) {

  const title =
    getSongTitle(song);

  const artist =
    getArtist(song);


  await bot.sendChatAction(
    chatId,
    "typing"
  );


  try {

    const url =
      "https://api.lyrics.ovh/v1/" +
      encodeURIComponent(artist) +
      "/" +
      encodeURIComponent(title);


    const response =
      await fetch(url);


    if (!response.ok) {

      await bot.sendMessage(
        chatId,

`📝 Lyrics

Sorry, lyrics are not available for:

🎵 ${title}
👤 ${artist}`
      );

      return;
    }


    const data =
      await response.json();


    if (!data.lyrics) {

      throw new Error(
        "Lyrics not found"
      );

    }


    let lyrics =
      data.lyrics.trim();


    // Telegram message limit protection
    if (lyrics.length > 3900) {

      lyrics =
        lyrics.substring(
          0,
          3900
        ) +
        "\n\n…";
    }


    await bot.sendMessage(

      chatId,

`📝 ${title}

👤 ${artist}

━━━━━━━━━━━━━━

${lyrics}`

    );

  } catch (error) {

    console.error(
      "LYRICS ERROR:",
      error
    );


    await bot.sendMessage(
      chatId,

`📝 Lyrics

Sorry, lyrics could not be found for this track.`
    );

  }

}


// ==================================================
// CALLBACK BUTTONS
// ==================================================

bot.on(
  "callback_query",
  async (query) => {

    const data =
      query.data || "";

    const chatId =
      query.message?.chat?.id;

    const messageId =
      query.message?.message_id;


    console.log(
      "BUTTON:",
      data
    );


    try {

      await bot.answerCallbackQuery(
        query.id
      );


      // ------------------------------------------
      // LANGUAGE
      // ------------------------------------------

      if (
        data === "lang:en"
      ) {

        languages.set(
          chatId,
          "en"
        );


        try {

          await bot.editMessageText(

`🇬🇧 English selected.

Welcome to Audio Finder!`,

            {
              chat_id: chatId,
              message_id: messageId
            }

          );

        } catch (error) {

          console.log(
            "Language edit error:",
            error.message
          );

        }


        await sendEnglishWelcome(
          chatId
        );

        return;
      }


      // Other languages are intentionally
      // not activated yet.

      if (
        data.startsWith("lang:")
      ) {

        await bot.sendMessage(
          chatId,

`🌐 This language is coming soon.

Please select English to continue using Audio Finder.`,

          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🇬🇧 English",
                    callback_data:
                      "lang:en"
                  }
                ]
              ]
            }
          }
        );

        return;
      }


      // ------------------------------------------
      // MORE / PREVIOUS
      // ------------------------------------------

      if (
        data.startsWith("page:")
      ) {

        const page =
          parseInt(
            data.substring(5),
            10
          );


        const session =
          sessions.get(chatId);


        if (!session) {

          await bot.sendMessage(
            chatId,

`⚠️ This search session has expired.

Please search for the song again.`
          );

          return;
        }


        session.page =
          page;


        await sendSearchResults(
          chatId,
          page,
          messageId
        );


        return;
      }


      // ------------------------------------------
      // SONG
      // ------------------------------------------

      if (
        data.startsWith("song:")
      ) {

        const trackId =
          data.substring(5);


        const song =
          await findTrack(
            chatId,
            trackId
          );


        if (!song) {

          await bot.sendMessage(
            chatId,

`❌ Track information could not be found.

Please search for the song again.`
          );

          return;
        }


        await sendSongDetails(
          chatId,
          song
        );


        try {

          await sendAudioPreview(
            chatId,
            song
          );

        } catch (error) {

          console.error(
            "AUDIO ERROR:",
            error
          );


          await bot.sendMessage(
            chatId,

`⚠️ The audio preview could not be loaded.

Please try another track.`
          );

        }


        return;
      }


      // ------------------------------------------
      // LYRICS
      // ------------------------------------------

      if (
        data.startsWith("lyrics:")
      ) {

        const trackId =
          data.substring(7);


        const song =
          await findTrack(
            chatId,
            trackId
          );


        if (!song) {

          await bot.sendMessage(
            chatId,

`❌ Track information could not be found.`
          );

          return;
        }


        await sendLyrics(
          chatId,
          song
        );


        return;
      }


      // ------------------------------------------
      // BACK
      // ------------------------------------------

      if (
        data === "back"
      ) {

        const session =
          sessions.get(chatId);


        if (!session) {

          await bot.sendMessage(
            chatId,

`🔎 Please search for a song to see the results.`
          );

          return;
        }


        await sendSearchResults(
          chatId,
          session.page || 0
        );


        return;
      }

    } catch (error) {

      console.error(
        "CALLBACK ERROR:",
        error
      );


      if (chatId) {

        await bot.sendMessage(
          chatId,

`⚠️ Something went wrong.

Please try again.`
        );

      }

    }

  }
);


// ==================================================
// NORMAL TEXT SEARCH
// ==================================================

bot.on(
  "message",
  async (msg) => {

    const chatId =
      msg.chat.id;

    const text =
      cleanText(msg.text);


    // Ignore commands
    if (
      !text ||
      text.startsWith("/")
    ) {

      return;
    }


    console.log(
      "USER SEARCH:",
      chatId,
      text
    );


    try {

      const results =
        await searchSongs(
          chatId,
          text
        );


      if (
        !results ||
        results.length === 0
      ) {

        await bot.sendMessage(
          chatId,

`❌ No matching tracks found.

Try searching with another song name.`
        );

        return;
      }


      await sendSearchResults(
        chatId,
        0
      );


    } catch (error) {

      console.error(
        "SEARCH ERROR:",
        error
      );


      await bot.sendMessage(
        chatId,

`⚠️ Something went wrong while searching.

Please try again in a moment.`
      );

    }

  }
);


// ==================================================
// TELEGRAM ERRORS
// ==================================================

bot.on(
  "polling_error",
  (error) => {

    console.error(
      "POLLING ERROR:",
      error.message
    );

  }
);


process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );

  }
);


process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "UNHANDLED REJECTION:",
      error
    );

  }
);
