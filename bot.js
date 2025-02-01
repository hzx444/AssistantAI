require("dotenv").config();
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");
const mercadopago = require("mercadopago");

// Configura o acesso ao Mercado Pago
mercadopago.configure({
  access_token: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

// Criar instância do bot do Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Criar instância da OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Chave da API OpenAI
});

// Função para gerar link de pagamento
async function gerarLinkPagamento(valor, descricao, emailUsuario) {
  try {
    const paymentData = {
      transaction_amount: valor,
      description: descricao,
      payment_method_id: "pix", // Método de pagamento (PIX)
      payer: {
        email: emailUsuario, // Email do usuário
      },
    };

    // Cria o pagamento
    const response = await mercadopago.payment.create(paymentData);
    return response.body.init_point; // Retorna o link de pagamento
  } catch (error) {
    console.error("Erro ao gerar link de pagamento:", error);
    return null;
  }
}

// Quando o bot receber uma mensagem
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) {
    return bot.sendMessage(chatId, "Envie uma mensagem válida.");
  }

  // Comando para gerar link de pagamento
  if (text.startsWith("/pagar")) {
    const valor = 10.0; // Valor do pagamento
    const descricao = "Acesso ao bot por 30 dias"; // Descrição do pagamento
    const emailUsuario = msg.from.email || "email_do_usuario@example.com"; // Tenta capturar o email do usuário

    const linkPagamento = await gerarLinkPagamento(valor, descricao, emailUsuario);
    if (linkPagamento) {
      bot.sendMessage(chatId, `Clique no link para pagar: ${linkPagamento}`);
    } else {
      bot.sendMessage(chatId, "Erro ao gerar o link de pagamento. Tente novamente.");
    }
    return;
  }

  // Resposta padrão usando a OpenAI
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
