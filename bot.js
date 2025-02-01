// Função para gerar o botão com o link de pagamento
async function gerarLinkPagamento(valor, descricao, emailUsuario, metodoPagamento) {
  try {
    console.log("Gerando link de pagamento...");
    console.log("Valor:", valor);
    console.log("Descrição:", descricao);
    console.log("Email do usuário:", emailUsuario);
    console.log("Método de pagamento:", metodoPagamento);

    // Configuração do pagamento com base no método escolhido
    const paymentData = {
      transaction_amount: valor,
      description: descricao,
      payment_method_id: metodoPagamento, // Escolher entre "pix" ou "credit_card"
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
      const linkPagamento = response.body.point_of_interaction.transaction_data.ticket_url;
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

// Função para enviar mensagem com botão de pagamento
function enviarMensagemComBotao(chatId, linkPagamento) {
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Clique e Adquira Agora!",  // Texto do botão
            url: linkPagamento,               // Link de pagamento
          },
        ],
      ],
    },
  };

  bot.sendMessage(chatId, "Clique no botão abaixo para concluir o pagamento:", options);
}

// No código onde você gera o link de pagamento, substitua a função de envio de mensagem:
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id.toString();
  const plano = callbackQuery.data;

  let valor, descricao, diasValidade;
  switch (plano) {
    case "plano_semanal":
      valor = 9.90; // Novo valor semanal
      descricao = "Plano Semanal";
      diasValidade = 7;
      break;
    case "plano_mensal":
      valor = 19.90; // Novo valor mensal
      descricao = "Plano Mensal";
      diasValidade = 30;
      break;
    case "plano_trimestral":
      valor = 39.90; // Novo valor trimestral
      descricao = "Plano Trimestral";
      diasValidade = 90;
      break;
  }

  const metodoPagamento = "credit_card"; // Defina como "pix" ou "credit_card" dependendo da preferência

  const linkPagamento = await gerarLinkPagamento(valor, descricao, "email_do_usuario@example.com", metodoPagamento);
  if (linkPagamento) {
    // Aqui estamos usando a nova função para enviar o botão com o link
    enviarMensagemComBotao(chatId, linkPagamento);
    salvarUsuario(userId, descricao, diasValidade); // Salva os dados do usuário
  } else {
    bot.sendMessage(chatId, "Erro ao gerar o link de pagamento. Tente novamente.");
  }
});
