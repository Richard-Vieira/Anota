// API do ANota
// projeto integrador - ADS
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const val = require('./validacoes');
const { gerarToken, verificaToken } = require('./auth');
const ia = require('./ia');
const { gerarPdf } = require('./pdf');
const { enviarEmail } = require('./email');

const app = express();
app.use(cors());
app.use(express.json());

// ajustado com IA para melhorar o codigo
// funcao pra nao repetir o tratamento de erro do banco em todas as rotas
function trataErro(res, err) {
  console.log('ERRO:', err.message);
  // 23503 = erro de chave estrangeira (tentou apagar algo que ta sendo usado)
  if (err.code === '23503') {
    return res.status(400).json({ erro: 'Esse registro está sendo usado em alguma nota e não pode ser excluído' });
  }
  // 22P02 = mandou texto onde era numero
  if (err.code === '22P02') {
    return res.status(400).json({ erro: 'Algum campo foi enviado com formato inválido' });
  }
  // 23505 = valor repetido em coluna UNIQUE (email ou cnpj do usuario)
  if (err.code === '23505') {
    return res.status(400).json({ erro: 'Já existe uma conta com esse email ou CNPJ' });
  }
  return res.status(500).json({ erro: 'Erro no servidor, tente novamente' });
}

app.get('/', (req, res) => {
  res.send('API do ANota funcionando');
});

// =============== CADASTRO E LOGIN ===============
// essas duas rotas sao as unicas que nao precisam do token
app.post('/cadastro', async (req, res) => {
  const { nome, cnpj, email, senha } = req.body;
  console.log('novo cadastro', email);

  if (val.vazio(nome)) {
    return res.status(400).json({ erro: 'Informe seu nome' });
  }
  if (val.vazio(cnpj)) {
    return res.status(400).json({ erro: 'Informe o CNPJ do seu MEI' });
  }
  if (!val.validarCNPJ(cnpj)) {
    return res.status(400).json({ erro: 'CNPJ inválido' });
  }
  if (val.vazio(email)) {
    return res.status(400).json({ erro: 'Informe o email' });
  }
  if (!val.validarEmail(email)) {
    return res.status(400).json({ erro: 'Email inválido' });
  }
  if (val.vazio(senha) || String(senha).length < 6) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres' });
  }

  try {
    const emailLimpo = email.trim().toLowerCase();
    const cnpjLimpo = val.soNumeros(cnpj);

    // ve se ja tem alguem com esse email ou cnpj
    const existe = await pool.query('SELECT email, cnpj FROM usuario WHERE email = $1 OR cnpj = $2', [emailLimpo, cnpjLimpo]);
    if (existe.rows.length > 0) {
      if (existe.rows[0].email == emailLimpo) {
        return res.status(400).json({ erro: 'Já existe uma conta com esse email' });
      }
      return res.status(400).json({ erro: 'Já existe uma conta com esse CNPJ' });
    }

    // nunca salva a senha pura, so o hash
    const hash = await bcrypt.hash(String(senha), 10);
    const resultado = await pool.query(
      'INSERT INTO usuario (nome, cnpj, email, senha) VALUES ($1, $2, $3, $4) RETURNING id, nome, cnpj, email',
      [nome.trim(), cnpjLimpo, emailLimpo, hash]
    );
    const usuario = resultado.rows[0];
    // ja devolve o token pra pessoa entrar direto
    res.status(201).json({ token: gerarToken(usuario), usuario: usuario });
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  console.log('tentando login', email);

  if (val.vazio(email) || val.vazio(senha)) {
    return res.status(400).json({ erro: 'Informe o email e a senha' });
  }
  if (!val.validarEmail(email)) {
    return res.status(400).json({ erro: 'Email inválido' });
  }

  try {
    const resultado = await pool.query('SELECT * FROM usuario WHERE email = $1', [email.trim().toLowerCase()]);
    if (resultado.rows.length == 0) {
      return res.status(400).json({ erro: 'Email ou senha incorretos' });
    }
    const usuario = resultado.rows[0];
    const ok = await bcrypt.compare(String(senha), usuario.senha);
    if (!ok) {
      return res.status(400).json({ erro: 'Email ou senha incorretos' });
    }
    // nao manda a senha de volta ne
    delete usuario.senha;
    res.json({ token: gerarToken(usuario), usuario: usuario });
  } catch (err) {
    trataErro(res, err);
  }
});

// daqui pra baixo todas as rotas usam o verificaToken
// o usuario_id vem do token (req.usuario_id), nao mais da query/body

// =============== CLIENTES ===============
app.get('/clientes', verificaToken, async (req, res) => {
  try {
    const dados = await pool.query('SELECT * FROM cliente WHERE usuario_id = $1 ORDER BY nome', [req.usuario_id]);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

// validacao do cliente (era repetida no post e no put, juntei aqui)
function validaCliente(body) {
  const { nome, documento, email } = body;
  if (val.vazio(nome)) return 'O nome do cliente é obrigatório';
  if (val.vazio(documento)) return 'O CPF ou CNPJ é obrigatório';
  if (!val.validarDocumento(documento)) return 'CPF ou CNPJ inválido';
  if (val.vazio(email)) return 'O email é obrigatório';
  if (!val.validarEmail(email)) return 'Email inválido';
  return null;
}

app.post('/clientes', verificaToken, async (req, res) => {
  // pega os dados do form
  const { nome, documento, email, telefone } = req.body;
  console.log('novo cliente', req.body);

  const erro = validaCliente(req.body);
  if (erro) {
    return res.status(400).json({ erro: erro });
  }

  try {
    const doc = val.soNumeros(documento);
    const resultado = await pool.query(
      'INSERT INTO cliente (usuario_id, nome, documento, email, telefone) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.usuario_id, nome.trim(), doc, email.trim(), telefone || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/clientes/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  const { nome, documento, email, telefone } = req.body;

  const erro = validaCliente(req.body);
  if (erro) {
    return res.status(400).json({ erro: erro });
  }

  try {
    // o AND usuario_id garante que so altera cliente que e dele
    const res2 = await pool.query(
      'UPDATE cliente SET nome = $1, documento = $2, email = $3, telefone = $4 WHERE id = $5 AND usuario_id = $6 RETURNING *',
      [nome.trim(), val.soNumeros(documento), email.trim(), telefone || null, id, req.usuario_id]
    );
    if (res2.rows.length == 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json(res2.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.delete('/clientes/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  try {
    const r = await pool.query('DELETE FROM cliente WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.usuario_id]);
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json({ mensagem: 'Cliente excluído' });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== SERVICOS ===============
app.get('/servicos', verificaToken, async (req, res) => {
  try {
    const dados = await pool.query('SELECT * FROM servico WHERE usuario_id = $1 ORDER BY descricao', [req.usuario_id]);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/servicos', verificaToken, async (req, res) => {
  const { descricao, valor } = req.body;

  if (val.vazio(descricao)) {
    return res.status(400).json({ erro: 'A descrição do serviço é obrigatória' });
  }
  if (val.vazio(valor)) {
    return res.status(400).json({ erro: 'O valor é obrigatório' });
  }
  if (!val.validarValor(valor)) {
    return res.status(400).json({ erro: 'O valor tem que ser maior que zero' });
  }

  try {
    const v = Number(String(valor).replace(',', '.'));
    const resultado = await pool.query(
      'INSERT INTO servico (usuario_id, descricao, valor) VALUES ($1, $2, $3) RETURNING *',
      [req.usuario_id, descricao.trim(), v]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/servicos/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  const { descricao, valor } = req.body;

  if (val.vazio(descricao)) {
    return res.status(400).json({ erro: 'A descrição do serviço é obrigatória' });
  }
  if (val.vazio(valor)) {
    return res.status(400).json({ erro: 'O valor é obrigatório' });
  }
  if (!val.validarValor(valor)) {
    return res.status(400).json({ erro: 'O valor tem que ser maior que zero' });
  }

  try {
    const v = Number(String(valor).replace(',', '.'));
    const res2 = await pool.query(
      'UPDATE servico SET descricao = $1, valor = $2 WHERE id = $3 AND usuario_id = $4 RETURNING *',
      [descricao.trim(), v, id, req.usuario_id]
    );
    if (res2.rows.length == 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }
    res.json(res2.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.delete('/servicos/:id', verificaToken, async (req, res) => {
  const id = req.params.id;
  try {
    const r = await pool.query('DELETE FROM servico WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.usuario_id]);
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }
    res.json({ mensagem: 'Serviço excluído' });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== NOTAS ===============
// select das notas com o nome do cliente e do servico (uso em mais de um lugar)
// to_char pq senao a data vem com fuso e muda o dia
const SQL_NOTAS = `SELECT n.id, n.descricao, n.valor, to_char(n.data_emissao, 'YYYY-MM-DD') AS data_emissao, n.status,
                          n.numero_nfse, n.cliente_id, c.nome AS cliente_nome, c.email AS cliente_email,
                          c.telefone AS cliente_telefone, n.servico_id, s.descricao AS servico_descricao
                   FROM nota_fiscal n
                   JOIN cliente c ON c.id = n.cliente_id
                   JOIN servico s ON s.id = n.servico_id
                   WHERE n.usuario_id = $1`;

app.get('/notas', verificaToken, async (req, res) => {
  try {
    const dados = await pool.query(SQL_NOTAS + ' ORDER BY n.data_emissao DESC, n.id DESC', [req.usuario_id]);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/notas', verificaToken, async (req, res) => {
  const { cliente_id, servico_id, descricao, valor } = req.body;
  const usuario_id = req.usuario_id;
  console.log('criando nota', req.body);

  if (val.vazio(cliente_id)) {
    return res.status(400).json({ erro: 'Escolha o cliente' });
  }
  if (val.vazio(servico_id)) {
    return res.status(400).json({ erro: 'Escolha o serviço' });
  }
  if (val.vazio(descricao)) {
    return res.status(400).json({ erro: 'A descrição da nota é obrigatória' });
  }
  if (val.vazio(valor)) {
    return res.status(400).json({ erro: 'O valor é obrigatório' });
  }
  if (!val.validarValor(valor)) {
    return res.status(400).json({ erro: 'O valor tem que ser maior que zero' });
  }

  try {
    // confere se o cliente e o servico sao desse usuario mesmo
    const cli = await pool.query('SELECT id FROM cliente WHERE id = $1 AND usuario_id = $2', [cliente_id, usuario_id]);
    if (cli.rows.length == 0) {
      return res.status(400).json({ erro: 'Cliente não encontrado' });
    }
    const serv = await pool.query('SELECT id FROM servico WHERE id = $1 AND usuario_id = $2', [servico_id, usuario_id]);
    if (serv.rows.length == 0) {
      return res.status(400).json({ erro: 'Serviço não encontrado' });
    }

    const v = Number(String(valor).replace(',', '.'));
    const resultado = await pool.query(
      `INSERT INTO nota_fiscal (usuario_id, cliente_id, servico_id, descricao, valor, data_emissao, status)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE, 'pendente')
       RETURNING id, usuario_id, cliente_id, servico_id, descricao, valor, to_char(data_emissao, 'YYYY-MM-DD') AS data_emissao, status`,
      [usuario_id, cliente_id, servico_id, descricao.trim(), v]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /notas/interpretar
// recebe o texto que a pessoa falou (o front transcreve o audio com o reconhecimento de voz do navegador)
// a IA tenta entender cliente, servico e valor. Se nao tiver IA configurada usa a busca de palavras (ia.js)
app.post('/notas/interpretar', verificaToken, async (req, res) => {
  const { texto } = req.body;
  console.log('texto recebido:', texto);

  if (val.vazio(texto)) {
    return res.status(400).json({ erro: 'Escreva ou fale o que você fez' });
  }
  if (String(texto).length > 1000) {
    return res.status(400).json({ erro: 'Texto muito grande, fale só o cliente, o serviço e o valor' });
  }

  try {
    const clientes = await pool.query('SELECT * FROM cliente WHERE usuario_id = $1', [req.usuario_id]);
    const servicos = await pool.query('SELECT * FROM servico WHERE usuario_id = $1', [req.usuario_id]);

    const resposta = await ia.interpretar(String(texto), clientes.rows, servicos.rows);
    console.log('resultado da interpretacao (' + resposta.origem + ')', resposta);
    res.json(resposta);
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /notas/:id/emitir
// SIMULADO: nao manda nada pro governo, so gera o proximo numero e muda o status pra emitida
// pra emitir de verdade no Sistema Nacional da NFS-e precisa:
//  - certificado digital A1 do MEI (pra assinar o XML da DPS)
//  - credenciamento no ambiente de Producao Restrita (o ambiente de testes do governo)
// TODO: trocar essa simulacao pela chamada real quando tiver o certificado
app.post('/notas/:id/emitir', verificaToken, async (req, res) => {
  const id = req.params.id;
  const usuario_id = req.usuario_id;

  try {
    const nota = await pool.query('SELECT * FROM nota_fiscal WHERE id = $1 AND usuario_id = $2', [id, usuario_id]);
    if (nota.rows.length == 0) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (nota.rows[0].status == 'cancelada') {
      return res.status(400).json({ erro: 'Essa nota está cancelada' });
    } else if (nota.rows[0].status != 'pendente' || nota.rows[0].numero_nfse) {
      return res.status(400).json({ erro: 'Essa nota já foi emitida' });
    }

    // proximo numero da sequencia desse usuario (salvo com 6 digitos: 000001, 000002...)
    const ultimo = await pool.query('SELECT MAX(numero_nfse) AS ultimo FROM nota_fiscal WHERE usuario_id = $1', [usuario_id]);
    const numero = String(Number(ultimo.rows[0].ultimo || 0) + 1).padStart(6, '0');

    // o "AND status = 'pendente'" e pra nao emitir duas vezes se clicar 2x rapido
    const r = await pool.query(
      `UPDATE nota_fiscal SET status = 'emitida', data_emissao = CURRENT_DATE, numero_nfse = $1
       WHERE id = $2 AND usuario_id = $3 AND status = 'pendente' AND numero_nfse IS NULL
       RETURNING id, numero_nfse, status, to_char(data_emissao, 'YYYY-MM-DD') AS data_emissao`,
      [numero, id, usuario_id]
    );
    if (r.rows.length == 0) {
      return res.status(400).json({ erro: 'Essa nota já foi emitida' });
    }

    res.json({
      mensagem: 'Nota emitida com sucesso (simulação)',
      id: Number(id),
      numero: r.rows[0].numero_nfse,
      data_emissao: r.rows[0].data_emissao,
      status: 'emitida'
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// busca a nota com tudo que precisa pro PDF e pro email (prestador, cliente e servico)
async function buscaNotaCompleta(id, usuario_id) {
  const r = await pool.query(
    `SELECT n.id, n.descricao, n.valor, to_char(n.data_emissao, 'YYYY-MM-DD') AS data_emissao, n.status, n.numero_nfse,
            u.nome AS prestador_nome, u.cnpj AS prestador_cnpj, u.email AS prestador_email,
            c.nome AS cliente_nome, c.documento AS cliente_documento, c.email AS cliente_email, c.telefone AS cliente_telefone,
            s.descricao AS servico_descricao
     FROM nota_fiscal n
     JOIN usuario u ON u.id = n.usuario_id
     JOIN cliente c ON c.id = n.cliente_id
     JOIN servico s ON s.id = n.servico_id
     WHERE n.id = $1 AND n.usuario_id = $2`,
    [id, usuario_id]
  );
  return r.rows[0];
}

// GET /notas/:id/pdf - baixa o PDF da nota
app.get('/notas/:id/pdf', verificaToken, async (req, res) => {
  try {
    const nota = await buscaNotaCompleta(req.params.id, req.usuario_id);
    if (!nota) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (!nota.numero_nfse) {
      return res.status(400).json({ erro: 'Emita a nota antes de gerar o PDF' });
    }

    const pdf = await gerarPdf(nota);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="nfse-' + nota.numero_nfse + '.pdf"');
    res.send(pdf);
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /notas/:id/enviar-email - manda o PDF pro email do cliente
app.post('/notas/:id/enviar-email', verificaToken, async (req, res) => {
  try {
    const nota = await buscaNotaCompleta(req.params.id, req.usuario_id);
    if (!nota) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (nota.status != 'emitida' && nota.status != 'enviada') {
      return res.status(400).json({ erro: 'Só dá pra enviar nota emitida' });
    }
    if (val.vazio(nota.cliente_email)) {
      return res.status(400).json({ erro: 'Esse cliente não tem email cadastrado' });
    }

    const pdf = await gerarPdf(nota);
    const valor = Number(nota.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const texto =
      'Olá, ' + nota.cliente_nome + '!\n\n' +
      'Segue em anexo a nota fiscal de serviço nº ' + nota.numero_nfse + ', ' +
      'referente a "' + nota.descricao + '", no valor de ' + valor + '.\n\n' +
      'Obrigado pela preferência!\n' + nota.prestador_nome;

    let envio;
    try {
      envio = await enviarEmail(nota.cliente_email, 'Nota fiscal nº ' + nota.numero_nfse, texto, {
        filename: 'nfse-' + nota.numero_nfse + '.pdf',
        content: pdf
      });
    } catch (err) {
      console.log('erro ao mandar email:', err.message);
      return res.status(500).json({ erro: 'Não foi possível enviar o email. Confira a configuração do SMTP.' });
    }

    await pool.query("UPDATE nota_fiscal SET status = 'enviada' WHERE id = $1 AND usuario_id = $2", [nota.id, req.usuario_id]);

    res.json({
      mensagem: 'Email enviado para ' + nota.cliente_email,
      status: 'enviada',
      teste: envio.teste,
      link: envio.link // so vem quando e conta de teste (Ethereal)
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== FATURAMENTO ===============
// conta as notas emitidas e as enviadas (enviada = emitida e ja mandada pro cliente)
app.get('/faturamento', verificaToken, async (req, res) => {
  let ano = req.query.ano;
  if (val.vazio(ano)) {
    ano = new Date().getFullYear();
  }

  try {
    const total = await pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM nota_fiscal
       WHERE usuario_id = $1 AND status IN ('emitida', 'enviada') AND EXTRACT(YEAR FROM data_emissao) = $2`,
      [req.usuario_id, ano]
    );
    const porMes = await pool.query(
      `SELECT EXTRACT(MONTH FROM data_emissao) AS mes, SUM(valor) AS total FROM nota_fiscal
       WHERE usuario_id = $1 AND status IN ('emitida', 'enviada') AND EXTRACT(YEAR FROM data_emissao) = $2
       GROUP BY mes ORDER BY mes`,
      [req.usuario_id, ano]
    );

    // monta os 12 meses, os que nao tem nota ficam 0
    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const achou = porMes.rows.find(r => Number(r.mes) == m);
      meses.push({ mes: m, total: achou ? Number(achou.total) : 0 });
    }

    res.json({
      ano: Number(ano),
      total: Number(total.rows[0].total),
      // limite do MEI = 81 mil por ano (conferir se mudou)
      limite_mei: 81000,
      meses: meses
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /faturamento/perguntar - pergunta em texto, tipo "quanto faturei em outubro?"
app.post('/faturamento/perguntar', verificaToken, async (req, res) => {
  const { pergunta } = req.body;
  console.log('pergunta do faturamento:', pergunta);

  if (val.vazio(pergunta)) {
    return res.status(400).json({ erro: 'Escreva sua pergunta' });
  }
  if (String(pergunta).length > 300) {
    return res.status(400).json({ erro: 'Pergunta muito grande' });
  }

  try {
    const notas = await pool.query(SQL_NOTAS + ' ORDER BY n.data_emissao', [req.usuario_id]);
    const resposta = await ia.responderFaturamento(String(pergunta), notas.rows);
    res.json(resposta);
  } catch (err) {
    trataErro(res, err);
  }
});

// app.get('/teste', (req, res) => {
//   res.json({ ok: true });
// });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('servidor rodando na porta ' + PORT);
  console.log(ia.temChave() ? 'IA: usando a API do Claude' : 'IA: sem IA_API_KEY, usando a interpretacao simulada');
});
