require("dotenv").config();
const express = require("express"); // Adicionado para o webhook
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");
const db = require("./database"); // Importa o banco de dados

// Criar instância do bot do Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Criar instância da OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Chave da API OpenAI
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

// Resposta padrão usando a OpenAI
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); // Captura o ID do usuário
  const text = msg.text;

  // Verifica se o usuário tem acesso
  verificarAcesso(userId, (temAcesso) => {
    if (!temAcesso) {
      return bot.sendMessage(chatId, "Você não tem acesso ao bot. Por favor, informe seu e-mail de compra.");
    }

    if (!text) {
      return bot.sendMessage(chatId, "Envie uma mensagem válida.");
    }

    // Resposta com OpenAI
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
  const userId = msg.from.id.toString();

  // Verifica se o usuário já tem acesso
  verificarAcesso(userId, (temAcesso) => {
    if (!temAcesso) {
      bot.sendMessage(chatId, "Você não tem acesso ao bot. Por favor, informe seu e-mail de compra.");
    } else {
      bot.sendMessage(chatId, "Olá! Você já tem acesso ao bot. Como posso te ajudar?");
    }
  });
});

// Configuração do webhook
const app = express();
app.use(express.json());

// Rota para receber notificações da Kirvano (logs de pagamento)
app.post("/webhook", async (req, res) => {
  const { data } = req.body;

  if (data && data.id) {
    const paymentId = data.id;

    try {
      // Verifica o status do pagamento
      if (data.event === "SALE_APPROVED" && data.status === "APPROVED") {
        const emailUsuario = data.customer.email;
        const plano = data.products[0].offer_name; // Exemplo de como pegar a oferta comprada
        const diasValidade = plano === "Plano Semanal" ? 7 : plano === "Plano Mensal" ? 30 : 90;

        // Salva os dados do usuário
        salvarUsuario(emailUsuario, plano, diasValidade);

        console.log(`Pagamento aprovado para o e-mail ${emailUsuario}.`);
      }
    } catch (error) {
      console.error("Erro ao processar webhook:", error);
    }
  }

  res.status(200).send("OK");
});

// Função para salvar os dados do usuário
function salvarUsuario(email, plano, diasValidade) {
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

  db.run(query, [email, plano, dataPagamento, validoAte], (err) => {
    if (err) {
      console.error("Erro ao salvar usuário:", err);
    } else {
      console.log(`Usuário ${email} salvo com sucesso.`);
    }
  });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
