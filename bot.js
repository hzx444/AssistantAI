require("dotenv").config();
const express = require("express"); // Adicionado para o webhook
const TelegramBot = require("node-telegram-bot-api");
const db = require("./database"); // Importa o banco de dados

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
function salvarUsuario(userId, email, plano, diasValidade) {
  const dataPagamento = new Date().toISOString();
  const validoAte = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();

  const query = `
    INSERT INTO usuarios (userId, email, plano, dataPagamento, validoAte)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      email = excluded.email,
      plano = excluded.plano,
      dataPagamento = excluded.dataPagamento,
      validoAte = excluded.validoAte
  `;

  db.run(query, [userId, email, plano, dataPagamento, validoAte], (err) => {
    if (err) {
      console.error("Erro ao salvar usuário:", err);
    } else {
      console.log(`Usuário ${userId} salvo com sucesso.`);
    }
  });
}

// Criar instância do bot do Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Quando o bot receber uma mensagem
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); // Captura o ID do usuário
  const text = msg.text;

  // Verifica se o usuário tem acesso
  verificarAcesso(userId, (temAcesso) => {
    if (!temAcesso) {
      return bot.sendMessage(chatId, "Você não tem acesso ao bot. Envie o seu e-mail de compra para liberar o acesso.");
    }

    if (!text) {
      return bot.sendMessage(chatId, "Envie uma mensagem válida.");
    }

    // Resposta padrão usando a OpenAI
    bot.sendMessage(chatId, "Você tem acesso ao assistente AI. Envie sua pergunta.");
  });
});

// Menu de planos no comando /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Plano Semanal - R$ 1,00", callback_data: "plano_semanal" },
          { text: "Plano Mensal - R$ 30,00", callback_data: "plano_mensal" },
        ],
        [
          { text: "Plano Trimestral - R$ 80,00", callback_data: "plano_trimestral" },
        ],
      ],
    },
  };

  bot.sendMessage(chatId, "Escolha o melhor plano para você e libere o assistente AI:", options);
});

// Tratar a escolha do plano
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id.toString();
  const plano = callbackQuery.data;

  let valor, descricao, diasValidade;
  switch (plano) {
    case "plano_semanal":
      valor = 1.0;
      descricao = "Plano Semanal";
      diasValidade = 7;
      break;
    case "plano_mensal":
      valor = 30.0;
      descricao = "Plano Mensal";
      diasValidade = 30;
      break;
    case "plano_trimestral":
      valor = 80.0;
      descricao = "Plano Trimestral";
      diasValidade = 90;
      break;
  }

  // Solicitar o e-mail para realizar o pagamento
  bot.sendMessage(chatId, "Por favor, envie o seu e-mail para validar o pagamento.");
});

// Recebe logs da Kirvano e processa os pagamentos
const app = express();
app.use(express.json());

// Rota para receber notificações da Kirvano
app.post("/webhook", async (req, res) => {
  const { email, plano, userId, status } = req.body;

  if (status === "paid") {
    // Salva os dados do usuário no banco
    const diasValidade = plano === "Plano Semanal" ? 7 : plano === "Plano Mensal" ? 30 : 90;
    salvarUsuario(userId, email, plano, diasValidade);

    console.log(`Pagamento confirmado para o usuário ${userId}.`);
    // Notificar o usuário via Telegram
    bot.sendMessage(userId, "Pagamento confirmado! Agora você tem acesso ao bot.");
  }

  res.status(200).send("OK");
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
