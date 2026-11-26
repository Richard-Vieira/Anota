// envio de email com o nodemailer
// ordem que ele tenta:
//  1. o SMTP que o usuario salvou na tela Configuracoes > E-mail
//  2. o SMTP do .env
//  3. uma conta de teste do Ethereal (nao entrega de verdade, mas da um link pra ver como ficou)
require('dotenv').config();
const nodemailer = require('nodemailer');

// o do .env e o do Ethereal sao iguais pra todo mundo, entao cria uma vez so e guarda
let transporteGeral = null;
let remetenteGeral = '';
let geralETeste = false;

async function pegaTransporteGeral() {
  if (transporteGeral) return transporteGeral;

  if (process.env.SMTP_HOST) {
    const porta = Number(process.env.SMTP_PORT || 587);
    transporteGeral = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta == 465, // 465 e com ssl direto, 587 nao
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    remetenteGeral = process.env.SMTP_FROM || process.env.SMTP_USER;
    console.log('email: usando o SMTP do .env', process.env.SMTP_HOST);
  } else {
    // cria uma conta de teste na hora
    const conta = await nodemailer.createTestAccount();
    transporteGeral = nodemailer.createTransport({
      host: conta.smtp.host,
      port: conta.smtp.port,
      secure: conta.smtp.secure,
      auth: { user: conta.user, pass: conta.pass }
    });
    remetenteGeral = conta.user;
    geralETeste = true;
    console.log('email: sem SMTP, usando conta de teste do Ethereal', conta.user);
  }
  return transporteGeral;
}

// manda o email e devolve { teste, link, origem }
// config = o SMTP do usuario (vem do banco com a senha ja descriptografada) ou null
async function enviarEmail(para, assunto, texto, anexo, config) {
  let transporte;
  let de;
  let teste = false;
  let origem;

  if (config && config.smtp_host) {
    const porta = Number(config.smtp_porta || 587);
    transporte = nodemailer.createTransport({
      host: config.smtp_host,
      port: porta,
      secure: porta == 465,
      auth: { user: config.smtp_usuario, pass: config.smtp_senha },
      connectionTimeout: 15000 // se o servidor nao responder em 15s desiste
    });
    de = '"' + (config.nome_remetente || 'ANota').replace(/"/g, '') + '" <' + config.smtp_usuario + '>';
    origem = 'usuario';
  } else {
    transporte = await pegaTransporteGeral();
    de = '"ANota" <' + remetenteGeral + '>';
    teste = geralETeste;
    origem = teste ? 'ethereal' : 'env';
  }

  const info = await transporte.sendMail({
    from: de,
    to: para,
    subject: assunto,
    text: texto,
    attachments: anexo ? [anexo] : []
  });
  console.log('email enviado (' + origem + ')', info.messageId);

  let link = null;
  if (teste) {
    link = nodemailer.getTestMessageUrl(info);
    console.log('ver o email em:', link);
  }
  return { teste: teste, link: link, origem: origem };
}

module.exports = { enviarEmail };
