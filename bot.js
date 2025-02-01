// Importando a biblioteca
const TelegramBot = require('node-telegram-bot-api');

// Definindo o token do bot (use seu próprio token)
const token = 'SEU_TOKEN_AQUI';

// Criando a instância do bot
const bot = new TelegramBot(token, { polling: true });

// Função para gerar link de pagamento
async function gerarLinkPagamento(valor, descricao, emailUsuario, metodoPagamento) {
  try {
    console.log("Gerando link de pagamento...");
    console.log("Valor:", valor);
    console.log("Descrição:", descricao);
    console.log("Email do usuário:", emailUsuario);
    console.log("Método de pagamento:", metodoPagamento);

    // Verifica se o valor foi passado corretamente
    if (!valor || valor <= 0) {
      throw new Error("Valor da transação inválido");
    }

    const paymentData = {
      transaction_amount: valor, // Passando o valor corretamente
      description: descricao,
      payment_method_id: metodoPagamento, // Método de pagamento escolhido
      payer: {
        email: emailUsuario, // Email do usuário
      },
    };

    console.log("Dados do pagamento:", paymentData);

    // Cria o pagamento
    const response = await mercadopago.payment.create(paymentData);
    console.log("Resposta do Mercado Pago:", response);

    // Verifica se o link de pagamento está na resposta
    if (response.body && response.body.init_point) {
      const linkPagamento = response.body.init_point; // Link do pagamento

      // Se o pagamento for via PIX, vamos retornar o QR Code
      if (metodoPagamento === 'pix' && response.body.point_of_interaction) {
        const qrCode = response.body.point_of_interaction.qr_code;
        return qrCode; // Retorna o QR Code para o PIX
      }

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

  // Perguntar como o usuário quer pagar
  bot.sendMessage(chatId, "Escolha o método de pagamento:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "PIX", callback_data: "pix" }],
        [{ text: "Cartão", callback_data: "cartao" }],
      ],
    },
  }).then(() => {
    // Aguardar a escolha de pagamento
    bot.once("callback_query", (paymentChoice) => {
      const metodoPagamento = paymentChoice.data === "cartao" ? "credit_card" : "pix";

      // Verifica se o valor é passado corretamente
      if (!valor || valor <= 0) {
        bot.sendMessage(chatId, "Erro: O valor de pagamento não foi definido corretamente.");
        return;
      }

      gerarLinkPagamento(valor, descricao, "email_do_usuario@example.com", metodoPagamento)
        .then((linkPagamento) => {
          if (linkPagamento) {
            if (metodoPagamento === 'pix') {
              // Envia o QR Code do Pix
              bot.sendMessage(chatId, "Escaneie o QR Code abaixo para realizar o pagamento:", {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "Escanear QR Code", url: linkPagamento }],
                  ],
                },
              });
            } else {
              // Envia o link do pagament
