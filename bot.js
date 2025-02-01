const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf } = require('telegraf');
const MercadoPago = require('mercado-pago');
const fetch = require('node-fetch');

// Configuração do Mercado Pago usando variáveis de ambiente
MercadoPago.configurations.setAccessToken(process.env.MERCADO_PAGO_ACCESS_TOKEN);

// Configuração do Telegram Bot usando variáveis de ambiente
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Configuração do Express para Webhook
const app = express();
app.use(bodyParser.json());

// Função para criar preferências de pagamento no Mercado Pago
function criarPreferencia(valor, plano) {
    const preferenceData = {
        items: [
            {
                title: `Assinatura ${plano}`,
                quantity: 1,
                unit_price: valor
            }
        ],
        back_urls: {
            success: 'https://seu_dominio.com/sucesso',
            failure: 'https://seu_dominio.com/falha',
            pending: 'https://seu_dominio.com/pendente'
        },
        auto_return: 'approved'
    };

    return MercadoPago.preferences.create(preferenceData);
}

// Função para verificar o pagamento via Webhook
function verificarPagamento(payment_id) {
    return MercadoPago.payment.get(payment_id);
}

// Função para liberar acesso ao usuário
function liberarAcesso(userId) {
    // Aqui você pode liberar o acesso do usuário no seu bot
    console.log(`Liberando acesso para o usuário ${userId}`);
    // Lógica para liberar acesso (ex: armazenar o status no banco de dados)
}

// Função para bloquear acesso ao usuário
function bloquearAcesso(userId) {
    // Aqui você pode bloquear o acesso do usuário no seu bot
    console.log(`Bloqueando acesso para o usuário ${userId}`);
    // Lógica para bloquear o acesso
}

// Definindo o comando de start no Telegram
bot.start((ctx) => {
    ctx.reply('Bem-vindo! Escolha o plano de assinatura: \n1. Plano Mensal - R$50\n2. Plano Anual
