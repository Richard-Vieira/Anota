// criptografia da senha do e-mail (SMTP)
// a senha do SMTP nao pode ser hash igual a do login, pq o sistema precisa ler ela de volta pra mandar o email
// entao usa AES-256-GCM do proprio Node (modulo crypto), com a chave CRIPTO_CHAVE do .env
require('dotenv').config();
const crypto = require('crypto');

function temChave() {
  return !!(process.env.CRIPTO_CHAVE && process.env.CRIPTO_CHAVE.trim() != '');
}

// o AES-256 precisa de uma chave de 32 bytes, entao tira o sha256 do texto do .env
function pegaChave() {
  return crypto.createHash('sha256').update(String(process.env.CRIPTO_CHAVE)).digest();
}

// ajustado com IA para melhorar o codigo
// salva no banco como "iv:tag:texto" (tudo em hex)
// iv = numero aleatorio novo a cada vez, tag = confere se ninguem mexeu no texto
function criptografar(texto) {
  if (!temChave()) throw new Error('CRIPTO_CHAVE nao configurada no .env');
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', pegaChave(), iv);
  const dados = Buffer.concat([cifra.update(String(texto), 'utf8'), cifra.final()]);
  const tag = cifra.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + dados.toString('hex');
}

function descriptografar(salvo) {
  if (!salvo) return '';
  if (!temChave()) throw new Error('CRIPTO_CHAVE nao configurada no .env');
  const partes = String(salvo).split(':');
  if (partes.length != 3) throw new Error('senha salva num formato estranho');
  const decifra = crypto.createDecipheriv('aes-256-gcm', pegaChave(), Buffer.from(partes[0], 'hex'));
  decifra.setAuthTag(Buffer.from(partes[1], 'hex'));
  const texto = Buffer.concat([decifra.update(Buffer.from(partes[2], 'hex')), decifra.final()]);
  return texto.toString('utf8');
}

module.exports = { temChave, criptografar, descriptografar };
