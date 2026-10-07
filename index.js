const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const ITUNES_API = "https://itunes.apple.com/search";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search";
const LYRICS_API = "https://api.lyrics.ovh/v1";

const PAGE_SIZE = 8;

const userState = new Map();

// ==========================================
// USER STATE
// ==========================================

function getState(chatId) {
  if (!userState.has(chatId)) {
    userState.set(chatId, {
      query: "",
      tracks: [],
      page: 0
    });
  }

  return userState.get(chatId);
}

// ==========================================
// START
// ==========================================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  userState.set(chatId, {
    query: "",
    tracks: [],
    page: 0
  });

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
});

// ==========================================
// CALLBACKS
// ==========================================

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  await bot.answerCallbackQuery(query.id);

  // ========================================
  // ENGLISH
  // ========================================

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

  // ========================================
  // OTHER LANGUAGES
  // ========================================

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

  // ========================================
  // MORE TRACKS
  // ========================================

  if (data === "more_tracks") {
    const state = getState(chatId);

    state.page++;

    await showResults(chatId);

    return;
  }

  // ========================================
  // PREVIOUS
  // ========================================

  if (data === "previous_tracks") {
    const state = getState(chatId);

    if (state.page > 0) {
      state.page--;
    }

    await showResults(chatId);

    return;
  }

  // ========================================
  // NEW SEARCH
  // ========================================

  if (data === "new_search") {
    const state = getState(chatId);

    state.query = "";
    state.tracks = [];
    state.page = 0;

    await bot.sendMessage(
      chatId,
      "🔎 *Send me a song name, artist or album.*",
      {
        parse_mode: "Markdown"
      }
    );

    return;
  }

  // ========================================
  // ITUNES TRACK
  // ========================================

  if (data.startsWith("itunes_")) {
    const index = Number(
      data.replace("itunes_", "")
    );

    const state = getState(chatId);
    const track = state.tracks[index];

    if (!track) {
      await bot.sendMessage(
        chatId,
        "❌ Track not found."
      );

      return;
    }

    await sendTrack(chatId, track);

    return;
  }

  // ========================================
  // YOUTUBE TRACK
  // ========================================

  if (data.startsWith("youtube_")) {
    const index = Number(
      data.replace("youtube_", "")
    );

    const state = getState(chatId);
    const track = state.tracks[index];

    if (!track) {
      await bot.sendMessage(
        chatId,
        "❌ YouTube result not found."
      );

      return;
    }

    await bot.sendMessage(
      chatId,
      `🎬 *${escapeMarkdown(track.title)}*

👤 ${escapeMarkdown(track.artist)}

Tap below to open this result on YouTube.`,
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

  // ========================================
  // LYRICS
  // ========================================

  if (data.startsWith("lyrics_")) {
    const index = Number(
      data.replace("lyrics_", "")
    );

    const state = getState(chatId);
    const track = state.tracks[index];

    if (!track) {
      await bot.sendMessage(
        chatId,
        "❌ Track not found."
      );

      return;
    }

    await sendLyrics(chatId, track);

    return;
  }

  // ========================================
  // BACK TO RESULTS
  // ========================================

  if (data === "back_results") {
    await showResults(chatId);

    return;
  }
});

// ==========================================
// MESSAGE SEARCH
// ==========================================

bot.on("message", async (msg) => {
  if (!msg.text) return;

  if (msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const query = msg.text.trim();

  if (!query) return;

  const state = getState(chatId);

  state.query = query;
  state.page = 0;

  await bot.sendChatAction(
    chatId,
    "typing"
  );

  try {
    const [
      itunesResults,
      youtubeResults
    ] = await Promise.all([
      searchITunes(query),
      searchYouTube(query)
    ]);

    const combined = [
      ...itunesResults,
      ...youtubeResults
    ];

    state.tracks = combined;

    if (!combined.length) {
      await bot.sendMessage(
        chatId,
        `❌ No results found for *${escapeMarkdown(query)}*.

Try another song or artist.`,
        {
          parse_mode: "Markdown"
        }
      );

      return;
    }

    await showResults(chatId);

  } catch (error) {
    console.error(
      "SEARCH ERROR:",
      error
    );

    await bot.sendMessage(
      chatId,
      "⚠️ Search failed.\nPlease try again."
    );
  }
});

// ==========================================
// ITUNES SEARCH
// ==========================================

async function searchITunes(query) {
  const url =
    `${ITUNES_API}?term=${encodeURIComponent(query)}` +
    `&media=music` +
    `&entity=song` +
    `&limit=50`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      "iTunes Search API failed"
    );
  }

  const data =
    await response.json();

  return data.results
    .filter(
      track =>
        track.trackName &&
        track.artistName
    )
    .map(track => ({
      type: "itunes",

      id: track.trackId,

      title:
        track.trackName,

      artist:
        track.artistName,

      album:
        track.collectionName ||
        "Unknown Album",

      artwork:
        track.artworkUrl100
          ? track.artworkUrl100.replace(
              "100x100bb",
              "600x600bb"
            )
          : null,

      preview:
        track.previewUrl ||
        null
    }));
}

// ==========================================
// YOUTUBE SEARCH
// ==========================================

async function searchYouTube(query) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.log(
      "YOUTUBE_API_KEY is not configured."
    );

    return [];
  }

  const url =
    `${YOUTUBE_API}?part=snippet` +
    `&q=${encodeURIComponent(query)}` +
    `&type=video` +
    `&maxResults=25` +
    `&key=${apiKey}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    const errorText =
      await response.text();

    console.error(
      "YouTube API ERROR:",
      errorText
    );

    return [];
  }

  const data =
    await response.json();

  return (data.items || [])
    .filter(
      item =>
        item.id &&
        item.id.videoId &&
        item.snippet
    )
    .map(item => ({
      type: "youtube",

      id:
        item.id.videoId,

      title:
        item.snippet.title ||
        "Unknown",

      artist:
        item.snippet.channelTitle ||
        "YouTube",

      album:
        "YouTube",

      artwork:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        null,

      youtubeUrl:
        `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
}

// ==========================================
// SHOW RESULTS
// ==========================================

async function showResults(chatId) {
  const state = getState(chatId);

  const start =
    state.page * PAGE_SIZE;

  const end =
    start + PAGE_SIZE;

  const visible =
    state.tracks.slice(
      start,
      end
    );

  if (!visible.length) {
    await bot.sendMessage(
      chatId,
      "🔚 No more tracks available.",
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔎 New Search",
                callback_data:
                  "new_search"
              }
            ]
          ]
        }
      }
    );

    return;
  }

  const keyboard = [];

  visible.forEach(
    (track, position) => {
      const realIndex =
        start + position;

      let icon = "🎵";

      if (
        track.type === "youtube"
      ) {
        icon = "🎬";
      }

      let text =
        `${icon} ${track.title}`;

      if (
        track.artist &&
        track.artist.length < 35
      ) {
        text +=
          ` — ${track.artist}`;
      }

      keyboard.push([
        {
          text:
            truncate(
              text,
              60
            ),

          callback_data:
            track.type === "youtube"
              ? `youtube_${realIndex}`
              : `itunes_${realIndex}`
        }
      ]);
    }
  );

  const navigation = [];

  if (state.page > 0) {
    navigation.push({
      text: "⬅️ Previous",
      callback_data:
        "previous_tracks"
    });
  }

  if (
    end <
    state.tracks.length
  ) {
    navigation.push({
      text: "➡️ More Tracks",
      callback_data:
        "more_tracks"
    });
  }

  if (navigation.length) {
    keyboard.push(
      navigation
    );
  }

  keyboard.push([
    {
      text: "🔎 New Search",
      callback_data:
        "new_search"
    }
  ]);

  await bot.sendMessage(
    chatId,
    `🎧 *Search Results*

🔎 Query: *${escapeMarkdown(state.query)}*

Found *${state.tracks.length}* matching results.

🎵 Music previews
🎬 YouTube results

👇 Select a result:`,
    {
      parse_mode: "Markdown",

      reply_markup: {
        inline_keyboard:
          keyboard
      }
    }
  );
}

// ==========================================
// SEND ITUNES AUDIO
// ==========================================

async function sendTrack(
  chatId,
  track
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

    const response =
      await fetch(
        track.preview
      );

    if (!response.ok) {
      throw new Error(
        "Preview download failed"
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    const state =
      getState(chatId);

    const index =
      state.tracks.findIndex(
        t =>
          t.id === track.id
      );

    await bot.sendAudio(
      chatId,
      buffer,
      {
        caption:
          `🎵 ${track.title}\n` +
          `👤 ${track.artist}\n` +
          `💿 ${track.album}`,

        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📝 Lyrics",
                callback_data:
                  `lyrics_${index}`
              }
            ],
            [
              {
                text:
                  "🔎 Search Another Song",

                callback_data:
                  "new_search"
              }
            ]
          ]
        }
      },
      {
        filename:
          `${cleanFileName(
            track.title
          )}.m4a`,

        contentType:
          "audio/mp4"
      }
    );

  } catch (error) {
    console.error(
      "AUDIO ERROR:",
      error
    );

    await bot.sendMessage(
      chatId,
      "❌ Unable to play this preview right now."
    );
  }
}

// ==========================================
// LYRICS
// ==========================================

async function sendLyrics(
  chatId,
  track
) {
  try {
    await bot.sendChatAction(
      chatId,
      "typing"
    );

    const artist =
      encodeURIComponent(
        track.artist
      );

    const title =
      encodeURIComponent(
        track.title
      );

    const url =
      `${LYRICS_API}/${artist}/${title}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      await bot.sendMessage(
        chatId,
        "📝 Lyrics are not available for this track."
      );

      return;
    }

    const data =
      await response.json();

    if (!data.lyrics) {
      await bot.sendMessage(
        chatId,
        "📝 Lyrics are not available for this track."
      );

      return;
    }

    let lyrics =
      data.lyrics.trim();

    if (lyrics.length > 3900) {
      lyrics =
        lyrics.substring(
          0,
          3900
        ) +
        "\n\n...";
    }

    await bot.sendMessage(
      chatId,
      `📝 *${escapeMarkdown(track.title)}*

👤 ${escapeMarkdown(track.artist)}

${escapeMarkdown(lyrics)}`,
      {
        parse_mode: "Markdown",

        reply_markup: {
          inline_keyboard: [
            [
              {
                text:
                  "🔙 Back to Results",

                callback_data:
                  "back_results"
              }
            ],
            [
              {
                text:
                  "🔎 New Search",

                callback_data:
                  "new_search"
              }
            ]
          ]
        }
      }
    );

  } catch (error) {
    console.error(
      "LYRICS ERROR:",
      error
    );

    await bot.sendMessage(
      chatId,
      "📝 Lyrics could not be loaded."
    );
  }
}

// ==========================================
// HELPERS
// ==========================================

function cleanFileName(name) {
  return name
    .replace(
      /[<>:"/\\|?*]/g,
      ""
    )
    .substring(
      0,
      80
    );
}

function truncate(
  text,
  max
) {
  if (
    text.length <= max
  ) {
    return text;
  }

  return (
    text.substring(
      0,
      max - 3
    ) +
    "..."
  );
}

function escapeMarkdown(
  text
) {
  return String(text)
    .replace(
      /([_*[\]()~`>#+\-=|{}.!])/g,
      "\\$1"
    );
}

// ==========================================
// BOT STARTED
// ==========================================

console.log(
  "🎵 OG Audio Finder Bot is running..."
);
