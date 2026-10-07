const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const ITUNES_API = "https://itunes.apple.com/search";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search";
const LYRICS_API = "https://api.lyrics.ovh/v1";

const PAGE_SIZE = 8;

const userState = new Map();


// ======================================================
// HELPERS
// ======================================================

function getState(chatId) {
  if (!userState.has(chatId)) {
    userState.set(chatId, {
      query: "",
      tracks: [],
      page: 0,
      resultsMessageId: null
    });
  }

  return userState.get(chatId);
}


function resetState(chatId) {
  userState.set(chatId, {
    query: "",
    tracks: [],
    page: 0,
    resultsMessageId: null
  });
}


function escapeMarkdown(text = "") {
  return String(text).replace(/([_*[\]`])/g, "\\$1");
}


function truncate(text = "", max = 58) {
  text = String(text);

  if (text.length <= max) {
    return text;
  }

  return text.slice(0, max - 1) + "…";
}


function cleanFileName(text = "track") {
  return String(text)
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100) || "track";
}


function cleanYouTubeTitle(text = "Unknown") {
  return String(text)
    .replace(
      /\s*\((official|audio|video|lyric|lyrics|hd|4k)[^)]*\)/gi,
      ""
    )
    .replace(
      /\s*\[[^\]]*(official|audio|video|lyric|lyrics|hd|4k)[^\]]*\]/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}


// ======================================================
// START
// ======================================================

bot.onText(/\/start(?:\s+.*)?$/, async (msg) => {
  const chatId = msg.chat.id;

  resetState(chatId);

  try {
    await bot.sendMessage(
      chatId,
      "🌍 *Choose your language*",
      {
        parse_mode: "Markdown",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🇬🇧 English",
                callback_data: "lang_en"
              }
            ],

            [
              {
                text: "🇪🇸 Español",
                callback_data: "lang_es"
              },
              {
                text: "🇫🇷 Français",
                callback_data: "lang_fr"
              }
            ],

            [
              {
                text: "🇩🇪 Deutsch",
                callback_data: "lang_de"
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error("START ERROR:", error);
  }
});


// ======================================================
// CALLBACKS
// ======================================================

bot.on("callback_query", async (query) => {

  const chatId =
    query.message?.chat?.id;

  const messageId =
    query.message?.message_id;

  const data =
    query.data || "";

  if (!chatId) {
    return;
  }

  try {
    await bot.answerCallbackQuery(
      query.id
    );
  } catch (_) {}


  try {

    // ----------------------------------------------------
    // ENGLISH
    // ----------------------------------------------------

    if (data === "lang_en") {

      await bot.sendMessage(
        chatId,

        `🎵 *Welcome to Audio Finder!*

Your personal music discovery assistant is here.

🔎 Search for any song by entering its name, artist, album, or a few words you remember.

🎧 Find matching tracks
🎶 Listen to available previews
📝 View available lyrics
🔄 Explore more matching tracks
✨ Discover different versions and artists

Just type the name of the song you are looking for and Audio Finder will search through thousands of available tracks for you.

👇 *Simply send me a song name to get started!*

👑 *Owner Contact*
👤 @OGNikku`,

        {
          parse_mode: "Markdown"
        }
      );

      return;
    }


    // ----------------------------------------------------
    // OTHER LANGUAGES
    // ----------------------------------------------------

    if (
      data === "lang_es" ||
      data === "lang_fr" ||
      data === "lang_de"
    ) {

      await bot.sendMessage(
        chatId,
        "🌍 This language is coming soon.\n\nPlease select 🇬🇧 English."
      );

      return;
    }


    // ----------------------------------------------------
    // MORE TRACKS
    // ----------------------------------------------------

    if (data === "more_tracks") {

      const state =
        getState(chatId);

      if (!state.tracks.length) {
        return;
      }

      state.page++;

      await updateResultsMessage(
        chatId,
        state.resultsMessageId || messageId
      );

      return;
    }


    // ----------------------------------------------------
    // PREVIOUS
    // ----------------------------------------------------

    if (data === "previous_tracks") {

      const state =
        getState(chatId);

      if (!state.tracks.length) {
        return;
      }

      state.page =
        Math.max(
          0,
          state.page - 1
        );

      await updateResultsMessage(
        chatId,
        state.resultsMessageId || messageId
      );

      return;
    }


    // ----------------------------------------------------
    // NEW SEARCH
    // ----------------------------------------------------

    if (data === "new_search") {

      const state =
        getState(chatId);

      state.query = "";
      state.tracks = [];
      state.page = 0;
      state.resultsMessageId = null;

      await bot.sendMessage(
        chatId,
        "🔎 *Send me a song name, artist or album.*",
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }


    // ----------------------------------------------------
    // BACK TO RESULTS
    // ----------------------------------------------------

    if (data === "back_results") {

      const state =
        getState(chatId);

      if (state.resultsMessageId) {

        await updateResultsMessage(
          chatId,
          state.resultsMessageId
        );
      }

      return;
    }


    // ----------------------------------------------------
    // ITUNES SONG
    // ----------------------------------------------------

    if (data.startsWith("itunes_")) {

      const index =
        Number(
          data.slice(
            "itunes_".length
          )
        );

      const state =
        getState(chatId);

      const track =
        state.tracks[index];

      if (
        !track ||
        track.type !== "itunes"
      ) {

        await bot.sendMessage(
          chatId,
          "❌ Track not found."
        );

        return;
      }

      await sendTrack(
        chatId,
        track,
        index
      );

      return;
    }


    // ----------------------------------------------------
    // YOUTUBE RESULT
    // ----------------------------------------------------

    if (data.startsWith("youtube_")) {

      const index =
        Number(
          data.slice(
            "youtube_".length
          )
        );

      const state =
        getState(chatId);

      const track =
        state.tracks[index];

      if (
        !track ||
        track.type !== "youtube"
      ) {

        await bot.sendMessage(
          chatId,
          "❌ YouTube result not found."
        );

        return;
      }

      await bot.sendMessage(
        chatId,

        `🎬 *${escapeMarkdown(
          track.title
        )}*

👤 ${escapeMarkdown(
          track.artist
        )}

Tap below to open the original YouTube result.`,

        {
          parse_mode: "Markdown",

          reply_markup: {
            inline_keyboard: [

              [
                {
                  text: "▶️ Open on YouTube",
                  url: track.youtubeUrl
                }
              ],

              [
                {
                  text: "🔙 Back to Results",
                  callback_data: "back_results"
                }
              ],

              [
                {
                  text: "🔎 New Search",
                  callback_data: "new_search"
                }
              ]

            ]
          }
        }
      );

      return;
    }


    // ----------------------------------------------------
    // LYRICS
    // ----------------------------------------------------

    if (data.startsWith("lyrics_")) {

      const index =
        Number(
          data.slice(
            "lyrics_".length
          )
        );

      const state =
        getState(chatId);

      const track =
        state.tracks[index];

      if (!track) {

        await bot.sendMessage(
          chatId,
          "❌ Track not found."
        );

        return;
      }

      await sendLyrics(
        chatId,
        track
      );

      return;
    }

  } catch (error) {

    console.error(
      "CALLBACK ERROR:",
      error
    );

    try {

      await bot.sendMessage(
        chatId,
        "⚠️ Something went wrong. Please try again."
      );

    } catch (_) {}
  }
});


// ======================================================
// SONG SEARCH
// ======================================================

bot.on("message", async (msg) => {

  if (
    !msg.text ||
    msg.text.startsWith("/")
  ) {
    return;
  }

  const chatId =
    msg.chat.id;

  const query =
    msg.text.trim();

  if (!query) {
    return;
  }

  const state =
    getState(chatId);

  state.query =
    query;

  state.page =
    0;

  state.tracks =
    [];

  state.resultsMessageId =
    null;


  try {

    await bot.sendChatAction(
      chatId,
      "typing"
    );


    const [
      itunesResult,
      youtubeResult
    ] = await Promise.allSettled([

      searchITunes(
        query
      ),

      searchYouTube(
        query
      )

    ]);


    let itunesResults =
      [];

    let youtubeResults =
      [];


    if (
      itunesResult.status ===
      "fulfilled"
    ) {

      itunesResults =
        itunesResult.value || [];

    } else {

      console.error(
        "iTunes search error:",
        itunesResult.reason
      );
    }


    if (
      youtubeResult.status ===
      "fulfilled"
    ) {

      youtubeResults =
        youtubeResult.value || [];

    } else {

      console.error(
        "YouTube search error:",
        youtubeResult.reason
      );
    }


    // Music first.
    // YouTube after music.

    state.tracks = [

      ...itunesResults,

      ...youtubeResults

    ];


    // ----------------------------------------------------
    // NO RESULT
    // ----------------------------------------------------

    if (
      !state.tracks.length
    ) {

      await bot.sendMessage(
        chatId,

        `❌ No results found for *${escapeMarkdown(
          query
        )}*.

Try another song, artist or album.`,

        {
          parse_mode: "Markdown"
        }
      );

      return;
    }


    // ----------------------------------------------------
    // SHOW RESULTS
    // ----------------------------------------------------

    await sendResultsMessage(
      chatId
    );

  } catch (error) {

    console.error(
      "MAIN SEARCH ERROR:",
      error
    );

    await bot.sendMessage(
      chatId,
      "⚠️ Search failed.\nPlease try again."
    );
  }
});


// ======================================================
// ITUNES SEARCH
// ======================================================

async function searchITunes(
  query
) {

  const url =
    `${ITUNES_API}` +
    `?term=${encodeURIComponent(
      query
    )}` +
    `&media=music` +
    `&entity=song` +
    `&limit=50`;


  const response =
    await fetch(
      url
    );


  if (!response.ok) {

    throw new Error(
      `iTunes HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  return (
    data.results || []
  )
    .filter(
      (track) =>
        track.trackName &&
        track.artistName
    )
    .map(
      (track) => ({

        type: "itunes",

        id:
          track.trackId,

        title:
          track.trackName,

        artist:
          track.artistName,

        album:
          track.collectionName ||
          "Unknown Album",

        artwork:
          track.artworkUrl100 ||
          null,

        preview:
          track.previewUrl ||
          null,

        duration:
          track.trackTimeMillis
            ? Math.floor(
                track.trackTimeMillis /
                1000
              )
            : null

      })
    );
}


// ======================================================
// YOUTUBE SEARCH
// ======================================================

async function searchYouTube(
  query
) {

  const apiKey =
    process.env.YOUTUBE_API_KEY;


  if (!apiKey) {

    throw new Error(
      "YOUTUBE_API_KEY is missing"
    );
  }


  const url =
    `${YOUTUBE_API}` +
    `?part=snippet` +
    `&q=${encodeURIComponent(
      query
    )}` +
    `&type=video` +
    `&maxResults=25` +
    `&key=${encodeURIComponent(
      apiKey
    )}`;


  const response =
    await fetch(
      url
    );


  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `YouTube HTTP ${response.status}: ${errorText}`
    );
  }


  const data =
    await response.json();


  return (
    data.items || []
  )
    .filter(
      (item) =>
        item.id?.videoId &&
        item.snippet
    )
    .map(
      (item) => ({

        type: "youtube",

        id:
          item.id.videoId,

        title:
          cleanYouTubeTitle(
            item.snippet.title ||
            "Unknown"
          ),

        artist:
          item.snippet.channelTitle ||
          "YouTube",

        album:
          "YouTube",

        artwork:
          item.snippet.thumbnails
            ?.medium?.url ||
          item.snippet.thumbnails
            ?.default?.url ||
          null,

        youtubeUrl:
          `https://www.youtube.com/watch?v=${item.id.videoId}`

      })
    );
}


// ======================================================
// FIRST RESULTS MESSAGE
// ======================================================

async function sendResultsMessage(
  chatId
) {

  const state =
    getState(chatId);


  const message =
    await bot.sendMessage(
      chatId,

      buildResultsText(
        state
      ),

      {
        parse_mode:
          "Markdown",

        reply_markup: {
          inline_keyboard:
            buildResultsKeyboard(
              state
            )
        }
      }
    );


  state.resultsMessageId =
    message.message_id;
}


// ======================================================
// UPDATE SAME RESULTS MESSAGE
// ======================================================

async function updateResultsMessage(
  chatId,
  messageId
) {

  const state =
    getState(chatId);


  if (
    !messageId ||
    !state.tracks.length
  ) {
    return;
  }


  const totalPages =
    Math.ceil(
      state.tracks.length /
      PAGE_SIZE
    );


  state.page =
    Math.max(
      0,
      Math.min(
        state.page,
        totalPages - 1
      )
    );


  try {

    await bot.editMessageText(

      buildResultsText(
        state
      ),

      {
        chat_id:
          chatId,

        message_id:
          messageId,

        parse_mode:
          "Markdown",

        reply_markup: {
          inline_keyboard:
            buildResultsKeyboard(
              state
            )
        }
      }
    );

  } catch (error) {

    const message =
      String(
        error.message || ""
      );


    if (
      !message
        .toLowerCase()
        .includes(
          "message is not modified"
        )
    ) {

      console.error(
        "RESULT MESSAGE EDIT ERROR:",
        message
      );
    }
  }
}


// ======================================================
// RESULTS TEXT
// ======================================================

function buildResultsText(
  state
) {

  const total =
    state.tracks.length;


  const totalPages =
    Math.ceil(
      total /
      PAGE_SIZE
    );


  const currentPage =
    state.page + 1;


  return (

    `🎧 *Search Results*\n\n` +

    `🔎 Query: *${escapeMarkdown(
      state.query
    )}*\n\n` +

    `🎵 Music previews\n` +

    `🎬 YouTube results\n\n` +

    `📄 Page ${currentPage} of ${totalPages}\n` +

    `🎶 ${total} matching results\n\n` +

    `👇 *Select a result:*`

  );
}


// ======================================================
// RESULTS KEYBOARD
// ======================================================

function buildResultsKeyboard(
  state
) {

  const start =
    state.page *
    PAGE_SIZE;


  const visible =
    state.tracks.slice(
      start,
      start + PAGE_SIZE
    );


  const keyboard =
    [];


  visible.forEach(
    (
      track,
      position
    ) => {

      const realIndex =
        start +
        position;


      const icon =
        track.type ===
        "youtube"
          ? "🎬"
          : "🎵";


      let label =
        `${icon} ${track.title}`;


      if (
        track.artist &&
        track.artist !==
          "YouTube"
      ) {

        label +=
          ` — ${track.artist}`;
      }


      keyboard.push([
        {
          text:
            truncate(
              label,
              58
            ),

          callback_data:
            track.type ===
            "youtube"

              ? `youtube_${realIndex}`

              : `itunes_${realIndex}`
        }
      ]);
    }
  );


  // ----------------------------------------------------
  // NAVIGATION
  // ----------------------------------------------------

  const navigation =
    [];


  if (
    state.page > 0
  ) {

    navigation.push({
      text:
        "⬅️ Previous",

      callback_data:
        "previous_tracks"
    });
  }


  if (
    start +
      PAGE_SIZE <
    state.tracks.length
  ) {

    navigation.push({
      text:
        "➡️ More Tracks",

      callback_data:
        "more_tracks"
    });
  }


  if (
    navigation.length
  ) {

    keyboard.push(
      navigation
    );
  }


  // ----------------------------------------------------
  // NEW SEARCH
  // ----------------------------------------------------

  keyboard.push([
    {
      text:
        "🔎 New Search",

      callback_data:
        "new_search"
    }
  ]);


  return keyboard;
}


// ======================================================
// SEND AUDIO PREVIEW
// ======================================================

async function sendTrack(
  chatId,
  track,
  index
) {

  if (!track.preview) {

    await bot.sendMessage(
      chatId,
      "⚠️ Audio preview is not available for this track."
    );

    return;
  }


  try {

    await bot.sendChatAction(
      chatId,
      "upload_audio"
    );


    // --------------------------------------------------
    // GET AUDIO
    // --------------------------------------------------

    const audioResponse =
      await fetch(
        track.preview
      );


    if (!audioResponse.ok) {

      throw new Error(
        `Audio HTTP ${audioResponse.status}`
      );
    }


    const audioBuffer =
      Buffer.from(
        await audioResponse.arrayBuffer()
      );


    // --------------------------------------------------
    // GET ARTWORK
    // --------------------------------------------------

    let artworkBuffer =
      null;


    if (
      track.artwork
    ) {

      try {

        const artworkResponse =
          await fetch(
            track.artwork
          );


        if (
          artworkResponse.ok
        ) {

          artworkBuffer =
            Buffer.from(
              await artworkResponse.arrayBuffer()
            );
        }

      } catch (_) {

        console.log(
          "Artwork unavailable."
        );
      }
    }


    // --------------------------------------------------
    // TELEGRAM AUDI
