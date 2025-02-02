require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");
const mercadopago = require("mercadopago");
const db = require("./database");

// Configura o Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

// Função para gerar link de pagamento
async function gerarLinkPagamento(valor, descricao, emailUsuario, userId) {
  try {
    const paymentData = {
      transaction_amount: valor,
      description: descricao,
      payment_method_id: "pix",
      payer: { email: emailUsuario },
      metadata: { userId: userId },
    };

    const response = await mercadopago.payment.create(paymentData);
    return response.body?.point_of_interaction?.transaction_data?.ticket_url || null;
  } catch (error) {
    console.error("Erro ao gerar link de pagamento:", error);
    return null;
  }
}

// Verifica se o usuário tem acesso
function verificarAcesso(userId, callback) {
  const query = `SELECT * FROM usuarios WHERE userId = ? AND validoAte > datetime('now')`;
  db.get(query, [userId], (err, row) => callback(!err && !!row));
}

// Salva o usuário no banco de dados
function salvarUsuario(userId, plano, diasValidade) {
  const dataPagamento = new Date().toISOString();
  const validoAte = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();
  
  const query = `INSERT INTO usuarios (userId, plano, dataPagamento, validoAte) VALUES (?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET plano = excluded.plano, dataPagamento = excluded.dataPagamento, validoAte = excluded.validoAte`;
  db.run(query, [userId, plano, dataPagamento, validoAte], (err) => {
    if (err) console.error("Erro ao salvar usuário:", err);
  });
}

// Configura o bot do Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;

  verificarAcesso(userId, (temAcesso) => {
    if (!temAcesso) return bot.sendMessage(chatId, "Você não tem acesso. Use /start para assinar.");
    if (!text) return bot.sendMessage(chatId, "Envie uma mensagem válida.");

    openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: text }],
    }).then((response) => {
      bot.sendMessage(chatId, response.choices[0].message.content);
    }).catch(() => bot.sendMessage(chatId, "Erro ao processar a resposta."));
  });
});

// Menu de planos
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Escolha um plano:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Semanal - R$ 1,00", callback_data: "plano_semanal" }],
        [{ text: "Mensal - R$ 30,00", callback_data: "plano_mensal" }],
        [{ text: "Trimestral - R$ 80,00", callback_data: "plano_trimestral" }],
      ],
    },
  });
});

// Tratamento de planos
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id.toString();
  const planos = {
    plano_semanal: { valor: 1.0, descricao: "Plano Semanal", dias: 7 },
    plano_mensal: { valor: 30.0, descricao: "Plano Mensal", dias: 30 },
    plano_trimestral: { valor: 80.0, descricao: "Plano Trimestral", dias: 90 },
  };
  
  const { valor, descricao, dias } = planos[callbackQuery.data] || {};
  if (!valor) return bot.sendMessage(chatId, "Plano inválido.");
  
  const linkPagamento = await gerarLinkPagamento(valor, descricao, "email_do_usuario@example.com", userId);
  bot.sendMessage(chatId, linkPagamento ? `Pague aqui: ${linkPagamento}` : "Erro ao gerar pagamento.");
});

// Configuração do webhook
const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  const paymentId = req.body?.data?.id;
  if (!paymentId) return res.status(400).send("Dados inválidos");

  try {
    const payment = await mercadopago.payment.findById(paymentId);
    if (payment.body.status === "approved") {
      const userId = payment.body.metadata?.userId;
      if (userId) {
        const plano = payment.body.description;
        const dias = plano.includes("Semanal") ? 7 : plano.includes("Mensal") ? 30 : 90;
        salvarUsuario(userId, plano, dias);
        bot.sendMessage(userId, "Pagamento aprovado! Acesso liberado.");
      }
    }
  } catch (error) {
    console.error("Erro no webhook:", error);
  }

  res.sendStatus(200);
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
