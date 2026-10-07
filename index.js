const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.BOT_TOKEN, {
  polling: true
});

const ITUNES_API = "https://itunes.apple.com/search";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3/search";
const LYRICS_API = "https://api.lyrics.ovh/v1";

const PAGE_SIZE = 8;
const userState = new Map();

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

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(text = "", max = 60) {
  text = String(text);
  return text.length <= max
    ? text
    : text.slice(0, max - 1) + "…";
}

function cleanFileName(name = "track") {
  return String(name)
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "track";
}

function cleanYouTubeTitle(title = "Unknown") {
  return String(title)
    .replace(
      /\s*\[(?:official|audio|video|lyrics?|hd|4k)[^\]]*\]/gi,
      ""
    )
    .replace(
      /\s*\((?:official|audio|video|lyrics?|hd|4k)[^)]*\)/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function songLinkForTrack(track) {
  if (track.type === "youtube" && track.id) {
    return `https://song.link/y/${encodeURIComponent(track.id)}`;
  }

  if (track.type === "itunes" && track.id) {
    return `https://song.link/i/${encodeURIComponent(track.id)}`;
  }

  return null;
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
      "🌍 <b>Choose your language</b>",
      {
        parse_mode: "HTML",
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
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data || "";

  if (!chatId) return;

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (_) {}

  try {
    // ----------------------------------------------
    // ENGLISH
    // ----------------------------------------------

    if (data === "lang_en") {
      await bot.sendMessage(
        chatId,
        `🎵 <b>Welcome to Music Finder.</b>

Your dedicated music discovery assistant.

Search any song by entering the title, artist, album name, or partial lyrics.

<b>Key Capabilities:</b>
- Accurate track matching across global databases
- Instant audio preview playback
- Track details and available lyrics retrieval
- Multiple versions and artist discovery

Send any song name below to begin.

<b>Developer &amp; Contact:</b> @OGNikku`,
        {
          parse_mode: "HTML"
        }
      );

      return;
    }

    // ----------------------------------------------
    // OTHER LANGUAGES
    // ----------------------------------------------

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

    // ----------------------------------------------
    // MORE TRACKS
    // ----------------------------------------------

    if (data === "more_tracks") {
      const state = getState(chatId);

      const totalPages = Math.ceil(
        state.tracks.length / PAGE_SIZE
      );

      if (state.page < totalPages - 1) {
        state.page++;
      }

      await updateResultsMessage(
        chatId,
        state.resultsMessageId || messageId
      );

      return;
    }

    // ----------------------------------------------
    // PREVIOUS
    // ----------------------------------------------

    if (data === "previous_tracks") {
      const state = getState(chatId);

      if (state.page > 0) {
        state.page--;
      }

      await updateResultsMessage(
        chatId,
        state.resultsMessageId || messageId
      );

      return;
    }

    // ----------------------------------------------
    // NEW SEARCH
    // ----------------------------------------------

    if (data === "new_search") {
      const state = getState(chatId);

      state.query = "";
      state.tracks = [];
      state.page = 0;
      state.resultsMessageId = null;

      await bot.sendMessage(
        chatId,
        "🔎 <b>Send me a song name, artist or album.</b>",
        {
          parse_mode: "HTML"
        }
      );

      return;
    }

    // ----------------------------------------------
    // BACK TO RESULTS
    // ----------------------------------------------

    if (data === "back_results") {
      const state = getState(chatId);

      if (state.resultsMessageId) {
        await updateResultsMessage(
          chatId,
          state.resultsMessageId
        );
      }

      return;
    }

    // ----------------------------------------------
    // ITUNES TRACK
    // ----------------------------------------------

    if (data.startsWith("itunes_")) {
      const index = Number(
        data.slice("itunes_".length)
      );

      const state = getState(chatId);
      const track = state.tracks[index];

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

    // ----------------------------------------------
    // YOUTUBE TRACK
    // ----------------------------------------------

    if (data.startsWith("youtube_")) {
      const index = Number(
        data.slice("youtube_".length)
      );

      const state = getState(chatId);
      const track = state.tracks[index];

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

      const buttons = [
        [
          {
            text: "▶️ Open on YouTube",
            url: track.youtubeUrl
          }
        ]
      ];

      const link =
        songLinkForTrack(track);

      if (link) {
        buttons.push([
          {
            text: "🌐 All Platforms",
            url: link
          }
        ]);
      }

      buttons.push([
        {
          text: "🔙 Back to Results",
          callback_data: "back_results"
        }
      ]);

      buttons.push([
        {
          text: "🔎 New Search",
          callback_data: "new_search"
        }
      ]);

      await bot.sendMessage(
        chatId,
        `🎬 <b>${escapeHtml(
          track.title
        )}</b>

👤 ${escapeHtml(track.artist)}

Tap below to open this result on YouTube or view available platforms.`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: buttons
          }
        }
      );

      return;
    }

    // ----------------------------------------------
    // LYRICS
    // ----------------------------------------------

    if (data.startsWith("lyrics_")) {
      const index = Number(
        data.slice("lyrics_".length)
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

      await sendLyrics(
        chatId,
        track
      );
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
// SEARCH
// ======================================================

bot.on("message", async (msg) => {
  if (
    !msg.text ||
    msg.text.startsWith("/")
  ) {
    return;
  }

  const chatId = msg.chat.id;
  const query = msg.text.trim();

  if (!query) return;

  const state = getState(chatId);

  state.query = query;
  state.page = 0;
  state.tracks = [];
  state.resultsMessageId = null;

  try {
    await bot.sendChatAction(
      chatId,
      "typing"
    );

    const [
      itunesResult,
      youtubeResult
    ] = await Promise.allSettled([
      searchITunes(query),
      searchYouTube(query)
    ]);

    const itunesResults =
      itunesResult.status === "fulfilled"
        ? itunesResult.value
        : [];

    const youtubeResults =
      youtubeResult.status === "fulfilled"
        ? youtubeResult.value
        : [];

    if (
      itunesResult.status ===
      "rejected"
    ) {
      console.error(
        "iTunes SEARCH ERROR:",
        itunesResult.reason
      );
    }

    if (
      youtubeResult.status ===
      "rejected"
    ) {
      console.error(
        "YouTube SEARCH ERROR:",
        youtubeResult.reason
      );
    }

    state.tracks = [
      ...itunesResults,
      ...youtubeResults
    ];

    if (!state.tracks.length) {
      await bot.sendMessage(
        chatId,
        `❌ No results found for <b>${escapeHtml(
          query
        )}</b>.

Try another song, artist or album.`,
        {
          parse_mode: "HTML"
        }
      );

      return;
    }

    await sendResultsMessage(
      chatId
    );

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

// ======================================================
// ITUNES SEARCH
// ======================================================

async function searchITunes(query) {
  const url =
    `${ITUNES_API}?term=${encodeURIComponent(
      query
    )}` +
    `&media=music&entity=song&limit=50`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `iTunes HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  return (data.results || [])
    .filter(
      (track) =>
        track.trackName &&
        track.artistName
    )
    .map((track) => ({
      type: "itunes",
      id: track.trackId,
      title: track.trackName,
      artist: track.artistName,
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
        null,

      duration:
        track.trackTimeMillis
          ? Math.floor(
              track.trackTimeMillis / 1000
            )
          : null
    }));
}

// ======================================================
// YOUTUBE SEARCH
// ======================================================

async function searchYouTube(query) {
  const apiKey =
    process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.log(
      "YOUTUBE_API_KEY is not configured; skipping YouTube search."
    );

    return [];
  }

  const url =
    `${YOUTUBE_API}?part=snippet` +
    `&q=${encodeURIComponent(
      query
    )}` +
    `&type=video&maxResults=25` +
    `&key=${encodeURIComponent(
      apiKey
    )}`;

  const response =
    await fetch(url);

  if (!response.ok) {
    const errorText =
      await response.text();

    console.error(
      `YouTube HTTP ${response.status}:`,
      errorText
    );

    return [];
  }

  const data =
    await response.json();

  return (data.items || [])
    .filter(
      (item) =>
        item.id?.videoId &&
        item.snippet
    )
    .map((item) => ({
      type: "youtube",
      id: item.id.videoId,

      title:
        cleanYouTubeTitle(
          item.snippet.title ||
            "Unknown"
        ),

      artist:
        item.snippet.channelTitle ||
        "YouTube",

      album: "YouTube",

      artwork:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        null,

      youtubeUrl:
        `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));
}

// ======================================================
// RESULTS
// ======================================================

function buildResultsText(state) {
  const totalPages =
    Math.max(
      1,
      Math.ceil(
        state.tracks.length /
          PAGE_SIZE
      )
    );

  return (
    `🎧 <b>Search Results</b>\n\n` +
    `🔎 Query: <b>${escapeHtml(
      state.query
    )}</b>\n\n` +
    `🎵 Music previews\n` +
    `🎬 YouTube results\n` +
    `🌐 Official platform links where available\n\n` +
    `📄 Page ${
      state.page + 1
    } of ${totalPages}\n` +
    `🎶 ${
      state.tracks.length
    } matching results\n\n` +
    `👇 <b>Select a result:</b>`
  );
}

function buildResultsKeyboard(
  state
) {
  const start =
    state.page * PAGE_SIZE;

  const visible =
    state.tracks.slice(
      start,
      start + PAGE_SIZE
    );

  const keyboard = [];

  visible.forEach(
    (track, position) => {
      const realIndex =
        start + position;

      const icon =
        track.type === "youtube"
          ? "🎬"
          : "🎵";

      let label =
        `${icon} ${track.title}`;

      if (
        track.artist &&
        track.artist !== "YouTube"
      ) {
        label +=
          ` — ${track.artist}`;
      }

      keyboard.push([
        {
          text: truncate(
            label,
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
    start + PAGE_SIZE <
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

  return keyboard;
}

async function sendResultsMessage(
  chatId
) {
  const state =
    getState(chatId);

  const message =
    await bot.sendMessage(
      chatId,
      buildResultsText(state),
      {
        parse_mode: "HTML",

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
    Math.max(
      1,
      Math.ceil(
        state.tracks.length /
          PAGE_SIZE
      )
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
      buildResultsText(state),
      {
        chat_id: chatId,
        message_id: messageId,

        parse_mode: "HTML",

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
        "RESULT EDIT ERROR:",
        message
      );
    }
  }
}

// ======================================================
// AUDIO PREVIEW - FIXED
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

  const buttons = [
    [
      {
        text: "📝 Lyrics",
        callback_data:
          `lyrics_${index}`
      }
    ]
  ];

  const link =
    songLinkForTrack(track);

  if (link) {
    buttons.push([
      {
        text: "🌐 All Platforms",
        url: link
      }
    ]);
  }

  buttons.push([
    {
      text: "🔎 Search Another Song",
      callback_data:
        "new_search"
    }
  ]);

  const options = {
    title: track.title,

    performer:
      track.artist,

    duration:
      track.duration ||
      undefined,

    caption:
      `🎵 ${track.title}\n` +
      `👤 ${track.artist}\n` +
      `💿 ${track.album}`,

    reply_markup: {
      inline_keyboard:
        buttons
    }
  };

  try {
    await bot.sendChatAction(
      chatId,
      "upload_audio"
    );

    /*
     * IMPORTANT:
     * iTunes preview files are hosted on Apple's CDN.
     * Railway may sometimes get a CDN response that Telegram
     * cannot directly use unless we download it correctly.
     */

    const response =
      await fetch(
        track.preview,
        {
          method: "GET",

          redirect: "follow",

          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",

            "Accept":
              "audio/mp4,audio/*;q=0.9,*/*;q=0.8"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Preview HTTP ${response.status}`
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    if (!buffer.length) {
      throw new Error(
        "Preview returned an empty file"
      );
    }

    /*
     * Send the downloaded audio buffer to Telegram.
     * No thumbnail is used here because a bad thumbnail
     * can cause the entire sendAudio request to fail.
     */

    await bot.sendAudio(
      chatId,
      buffer,
      options,
      {
        filename:
          `${cleanFileName(
            track.title
          )}.m4a`,

        contentType:
          "audio/mp4"
      }
    );

  } catch (bufferError) {
    console.error(
      "AUDIO BUFFER ERROR:",
      bufferError?.stack ||
        bufferError
    );

    /*
     * SECOND METHOD:
     * If Railway cannot download the Apple preview,
     * let Telegram fetch the public preview URL itself.
     */

    try {
      await bot.sendAudio(
        chatId,
        track.preview,
        options
      );

    } catch (directError) {
      console.error(
        "AUDIO DIRECT URL ERROR:",
        directError?.stack ||
          directError
      );

      await bot.sendMessage(
        chatId,
        "❌ Unable to play this preview right now. Please try another result."
      );
    }
  }
}

// ====
