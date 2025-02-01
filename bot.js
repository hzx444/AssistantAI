require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");
const db = require("./database");

// Função para verificar se o usuário tem acesso
function verificarAcesso(userId, callback) {
  const query = `SELECT * FROM usuarios WHERE userId = ? AND validoAte > datetime('now')`;
  db.get(query, [userId], (err, row) => {
    if (err) {
      console.error("Erro ao verificar acesso:", err);
      return callback(false);
    }
    callback(!!row);
  });
}

// Função para salvar os dados do usuário
function salvarUsuario(userId, plano, diasValidade) {
  const dataPagamento = new Date().toISOString();
  const validoAte = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    INSERT INTO usuarios (userId, plano, dataPagamento, validoAte)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      plano = excluded.plano,
      dataPagamento = excluded.dataPagamento,
      validoAte = excluded.validoAte
  `;

  db.run(query, [userId, plano, dataPagamento, validoAte], (err) => {
    if (err) {
      console.error("Erro ao salvar usuário:", err);
    } else {
      console.log(`Usuário ${userId} salvo com sucesso.`);
    }
  });
}

// Criar instância do bot do Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Criar instância da OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Quando o bot receber uma mensagem
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;

  // Verifica se o usuário tem acesso
  verificarAcesso(userId, (temAcesso) => {
    if (!temAcesso) {
      return bot.sendMessage(chatId, "Você não tem acesso ao bot. Use /start para escolher um plano.");
    }

    if (!text) {
      return bot.sendMessage(chatId, "Envie uma mensagem válida.");
    }

    // Resposta padrão usando a OpenAI
    openai.chat.completions
      .create({
        model: "gpt-4-turbo",
        messages: [{ role: "user", content: text }],
      })
      .then((response) => {
        const message = response.choices[0].message.content;
        bot.sendMessage(chatId, message);
      })
      .catch((error) => {
        console.error("Erro ao conectar com a OpenAI:", error);
        bot.sendMessage(chatId, "Erro ao processar a resposta. Tente novamente.");
      });
  });
});

// Menu de planos no comando /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Plano Semanal - R$ 10,00", url: "https://pay.kirvano.com/26702223-4352-4b96-8789-4d66445e8286?src=in" }, // Substitua pelo link real
        ],
        [
          { text: "Plano Mensal - R$ 30,00", url: "https://pay.kirvano.com/26702223-4352-4b96-8789-4d66445e8286?src=in" }, // Substitua pelo link real
        ],
        [
          { text: "Plano Trimestral - R$ 80,00", url: "https://pay.kirvano.com/26702223-4352-4b96-8789-4d66445e8286?src=in" }, // Substitua pelo link real
        ],
      ],
    },
  };

  bot.sendMessage(chatId, "Escolha o melhor plano para você e libere o assistente AI:", options);
});

// Configuração do webhook
const app = express();
app.use(express.json());

// Rota para receber notificações do Kirvano
app.post("/webhook", async (req, res) => {
  const { event, data } = req.body;

  if (event === "payment.completed") {
    const userId = data.metadata.userId; // Adiciona o userId ao metadata
    const plano = data.description;
    const diasValidade = plano === "Plano Semanal" ? 7 : plano === "Plano Mensal" ? 30 : 90;

    // Salva os dados do usuário
    salvarUsuario(userId, plano, diasValidade);

    console.log(`Pagamento aprovado para o usuário ${userId}.`);
    bot.sendMessage(userId, "Pagamento aprovado! Agora você tem acesso ao bot.");
  }

  res.status(200).send("OK");
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
