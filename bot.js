// bot.js

require("dotenv").config();
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");

// Criar instância do bot do Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true, autoStart: true });

// Criar instância da OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Chave da API OpenAI
});

// Quando o bot receber uma mensagem
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) {
    return bot.sendMessage(chatId, "Envie uma mensagem válida.");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: text }],
    });

    const message = response.choices[0].message.content;
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error("Erro ao conectar com a OpenAI:", error);
    bot.sendMessage(chatId, "Erro ao processar a resposta. Tente novamente.");
  }
});
