require("dotenv").config();
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");
const mercadopago = require("mercadopago");
const db = require("./database"); // Importa o banco de dados

// Configura o acesso ao Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

// Função para gerar link de pagamento (PIX ou Cartão)
async function gerarLinkPagamento(valor, descricao, emailUsuario, metodoPagamento) {
  try {
    console.log("Gerando link de pagamento...");
    console.log("Valor:", valor);
    console.log("Descrição:", descricao);
    console.log("Email do usuário:", emailUsuario);
    console.log("Método de pagamento:", metodoPagamento);

    const paymentData = {
      transaction_amount: valor,
      description: descricao,
      payment_method_id: metodoPagamento, // PIX ou credit_card
      payer: {
        email: emailUsuario, // Email do usuário
      },
    };

    console.log("Dados do pagamento:", paymentData);

    // Cria o pagamento
    const response = await mercadopago.payment.create(paymentData);
    console.log("Resposta do Mercado Pago:", response);

    // Verifica se o link de pagamento está na resposta
    if (response.body && response.body.point_of_interaction && response.body.point_of_interaction.transaction_data) {
      const linkPagamento = metodoPagamento === "pix" 
        ? response.body.point_of_interaction.transaction_data.ticket_url // Link do PIX
        : response.body.transaction_details.external_resource_url; // Link do Cartão

      console.log("Link de pagamento:", linkPagamento);
      return linkPagamento;
    } else {
      console.error("Link de pagamento não encontrado na resposta:", response.body);
      return null;
    }
  } catch (error) {
    console.error("Erro ao gerar link de pagamento:", error);
    return null;
  }
}

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
  apiKey: process.env.OPENAI_API_KEY, // Chave da API OpenAI
});

// Quando o bot receber uma mensagem
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); // Captura o ID do usuário
  const text = msg.text;

  // Verifica se o usuário tem acesso
  verificarAcesso(userId, (temAcesso) => {
    if (!temAcesso) {
      return bot.sendMessage(chatId, "Você não tem acesso ao bot. Use /start para escolher um plano.");
    }

    if (!text) {
      return bot.sendMessage(chatId, "Envie uma mensagem válida.");
    }

    // Comando para gerar link de pagamento
    if (text.startsWith("/pagar")) {
      const valor = 10.0; // Valor do pagamento
      const descricao = "Acesso ao bot por 30 dias"; // Descrição do pagamento
      const emailUsuario = msg.from.email || "email_do_usuario@example.com"; // Tenta capturar o email do usuário

      gerarLinkPagamento(valor, descricao, emailUsuario, "pix") // Usando PIX por padrão
        .then((linkPagamento) => {
          if (linkPagamento) {
            const botao = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: "Clique e Adquira Agora Mesmo!", url: linkPagamento }],
                ],
              },
            };
            bot.sendMessage(chatId, `Clique abaixo para pagar ${descricao}:`, botao);
          } else {
            bot.sendMessage(chatId, "Erro ao gerar o link de pagamento. Tente novamente.");
          }
        })
        .catch((error) => {
          console.error("Erro ao gerar link de pagamento:", error);
          bot.sendMessage(chatId, "Erro ao processar o pagamento. Tente novamente.");
        });
      return;
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
  const userId = msg.from.id.toString();

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Plano Semanal - R$ 9,90", callback_data: "plano_semanal" },
          { text: "Plano Mensal - R$ 19,90", callback_data: "plano_mensal" },
        ],
        [
          { text: "Plano Trimestral - R$ 39,90", callback_data: "plano_trimestral" },
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
      valor = 9.90;
      descricao = "Plano Semanal";
      diasValidade = 7;
      break;
    case "plano_mensal":
      valor = 19.90;
      descricao = "Plano Mensal";
      diasValidade = 30;
      break;
    case "plano_trimestral":
      valor = 39.90;
      descricao = "Plano Trimestral";
      diasValidade = 90;
      break;
  }

  // Gerar o link de pagamento (com PIX por padrão)
  const linkPagamento = await gerarLinkPagamento(valor, descricao, "email_do_usuario@example.com", "pix");
  if (linkPagamento) {
    const botao = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Clique e Adquira Agora Mesmo!", url: linkPagamento }],
        ],
      },
    };
    bot.sendMessage(chatId, `Clique abaixo para pagar ${descricao}:`, botao);
    salvarUsuario(userId, descricao, diasValidade); // Salva os dados do usuário
  } else {
    bot.sendMessage(chatId, "Erro ao gerar o link de pagamento. Tente novamente.");
  }
});
