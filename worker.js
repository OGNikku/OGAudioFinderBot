export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("OGAudioFinderBot is running!", {
        status: 200
      });
    }

    try {
      const update = await request.json();

      if (!update.message) {
        return new Response("OK", { status: 200 });
      }

      const chatId = update.message.chat.id;
      const text = update.message.text || "";

      if (text === "/start") {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "👋 Welcome to OG Audio Finder Bot!\n\n🎵 Song का नाम भेजो और हम उसे खोजने की कोशिश करेंगे."
        );
      } else {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          "🔎 तुम्हारा message मिला:\n\n" + text
        );
      }

      return new Response("OK", { status: 200 });

    } catch (error) {
      return new Response("Error", { status: 500 });
    }
  }
};

async function sendMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

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
