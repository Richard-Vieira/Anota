// coisas do login com JWT
require('dotenv').config();
const jwt = require('jsonwebtoken');

const SEGREDO = process.env.JWT_SECRET;
const EXPIRA = process.env.JWT_EXPIRA || '8h';

if (!SEGREDO) {
  console.log('ATENCAO: JWT_SECRET nao esta no .env, o login nao vai funcionar');
}

// cria o token com o id do usuario dentro
function gerarToken(usuario) {
  return jwt.sign({ id: usuario.id }, SEGREDO, { expiresIn: EXPIRA });
}

// ajustado com IA para melhorar o codigo
// middleware: confere o token que vem no header Authorization: Bearer xxxxx
// se tiver certo coloca o id do usuario em req.usuario_id pras rotas usarem
// assim o usuario_id nao vem mais do front (antes dava pra trocar o id e ver dados de outro)
function verificaToken(req, res, next) {
  const header = req.headers.authorization || '';
  const partes = header.split(' ');

  if (partes.length != 2 || partes[0] != 'Bearer') {
    return res.status(401).json({ erro: 'Faça login para continuar' });
  }

  try {
    const dados = jwt.verify(partes[1], SEGREDO);
    req.usuario_id = dados.id;
    next();
  } catch (err) {
    console.log('token invalido:', err.message);
    if (err.name == 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Sua sessão expirou, faça login de novo' });
    }
    return res.status(401).json({ erro: 'Sessão inválida, faça login de novo' });
  }
}

module.exports = { gerarToken, verificaToken };
