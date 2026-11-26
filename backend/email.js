// envio de email com o nodemailer
// se tiver SMTP no .env usa ele, se nao usa uma conta de teste do Ethereal
// (o Ethereal nao entrega o email de verdade, mas da um link pra ver como ficou)
require('dotenv').config();
const nodemailer = require('nodemailer');

let transporte = null;
let usandoTeste = false;
let remetente = '';

async function pegaTransporte() {
  // so cria uma vez
  if (transporte) return transporte;

  if (process.env.SMTP_HOST) {
    const porta = Number(process.env.SMTP_PORT || 587);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta == 465, // 465 e com ssl direto, 587 nao
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    remetente = process.env.SMTP_FROM || process.env.SMTP_USER;
    console.log('email: usando o SMTP', process.env.SMTP_HOST);
  } else {
    // cria uma conta de teste na hora
    const conta = await nodemailer.createTestAccount();
    transporte = nodemailer.createTransport({
      host: conta.smtp.host,
      port: conta.smtp.port,
      secure: conta.smtp.secure,
      auth: { user: conta.user, pass: conta.pass }
    });
    remetente = conta.user;
    usandoTeste = true;
    console.log('email: sem SMTP no .env, usando conta de teste do Ethereal', conta.user);
  }
  return transporte;
}

// manda o email e devolve { teste, link }
async function enviarEmail(para, assunto, texto, anexo) {
  const t = await pegaTransporte();
  const info = await t.sendMail({
    from: '"ANota" <' + remetente + '>',
    to: para,
    subject: assunto,
    text: texto,
    attachments: anexo ? [anexo] : []
  });
  console.log('email enviado', info.messageId);

  let link = null;
  if (usandoTeste) {
    link = nodemailer.getTestMessageUrl(info);
    console.log('ver o email em:', link);
  }
  return { teste: usandoTeste, link: link };
}

module.exports = { enviarEmail };
