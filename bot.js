require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");
const mercadopago = require("mercadopago");
const db = require("./database");

// Configuração do Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

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
function salvarUsuario(userId, preapprovalId, plano, diasValidade) {
  const validoAte = new Date(Date.now() + diasValidade * 24 * 60 * 60 * 1000).toISOString();
  const query = `
    INSERT INTO usuarios (userId, preapprovalId, plano, validoAte)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET
      preapprovalId = excluded.preapprovalId,
      plano = excluded.plano,
      validoAte = excluded.validoAte
  `;

  db.run(query, [userId, preapprovalId, plano, validoAte], (err) => {
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
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Comando /start com menu de planos
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();

  const planos = {
    "Plano Semanal - R$ 9,90": "2c93808494b46ea50194bffed1b10657",
    "Plano Mensal - R$ 19,90": "2c93808494bfe9840194c00563960002",
    "Plano Trimestral - R$ 39,90": "2c93808494b8c5eb0194c006404003f4",
  };

  const botoes = Object.entries(planos).map(([nome, id]) => [{
    text: nome,
    url: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=${id}`
  }]);

  bot.sendMessage(chatId, "Escolha o melhor plano para liberar o assistente:", {
    reply_markup: { inline_keyboard: botoes }
  });
});

// Webhook para notificações do Mercado Pago
const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  const { type, action, data } = req.body;

  if (type === "preapproval" && action === "updated" && data.id) {
    try {
      const preapproval = await mercadopago.preapproval.findById(data.id);
      const status = preapproval.body.status;
      const userId = preapproval.body.external_reference;
      const plano = preapproval.body.reason;

      if (status === "authorized") {
        const diasValidade = plano.includes("Semanal") ? 7 : plano.includes("Mensal") ? 30 : 90;
        salvarUsuario(userId, data.id, plano, diasValidade);
        bot.sendMessage(userId, "✅ Pagamento aprovado! Seu acesso foi liberado.");
      } else if (status === "cancelled" || status === "paused") {
        db.run("DELETE FROM usuarios WHERE userId = ?", [userId], () => {
          bot.sendMessage(userId, "🚫 Sua assinatura foi cancelada. Acesso revogado.");
        });
      }
    } catch (error) {
      console.error("Erro ao processar webhook:", error);
    }
  }
  res.sendStatus(200);
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
