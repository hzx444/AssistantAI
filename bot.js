require("dotenv").config();
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true, autoStart: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SENHA = "abacaxi";
const usuariosAutorizados = new Set(); // Armazena usuários autorizados

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) {
    return bot.sendMessage(chatId, "Envie uma mensagem válida.");
  }

  if (text.toLowerCase() === "/start") {
    return bot.sendMessage(chatId, "Você não tem acesso. Informe a Senha de Desbloqueio Para Liberar:");
  }

  if (!usuariosAutorizados.has(chatId)) {
    if (text === SENHA) {
      usuariosAutorizados.add(chatId);
      return bot.sendMessage(chatId, "✅ Acesso liberado! Agora você pode usar o bot.");
    } else {
      return bot.sendMessage(chatId, "❌ Senha incorreta. Tente novamente.");
    }
  }

  // Usuário autorizado, pode usar a OpenAI
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: text }],
    });

    bot.sendMessage(chatId, response.choices[0].message.content);
  } catch (error) {
    console.error("Erro ao conectar com a OpenAI:", error);
    bot.sendMessage(chatId, "Erro ao processar a resposta. Tente novamente.");
  }
});
