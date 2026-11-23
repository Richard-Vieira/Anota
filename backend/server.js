// API do ANota
// projeto integrador - ADS
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const val = require('./validacoes');

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
  return res.status(500).json({ erro: 'Erro no servidor, tente novamente' });
}

app.get('/', (req, res) => {
  res.send('API do ANota funcionando');
});

// =============== LOGIN ===============
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
    const ok = await bcrypt.compare(senha, usuario.senha);
    if (!ok) {
      return res.status(400).json({ erro: 'Email ou senha incorretos' });
    }
    // nao manda a senha de volta ne
    delete usuario.senha;
    res.json(usuario);
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== CLIENTES ===============
app.get('/clientes', async (req, res) => {
  const usuario_id = req.query.usuario_id;
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  try {
    const dados = await pool.query('SELECT * FROM cliente WHERE usuario_id = $1 ORDER BY nome', [usuario_id]);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/clientes', async (req, res) => {
  // pega os dados do form
  const { usuario_id, nome, documento, email, telefone } = req.body;
  console.log('novo cliente', req.body);

  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  if (val.vazio(nome)) {
    return res.status(400).json({ erro: 'O nome do cliente é obrigatório' });
  }
  if (val.vazio(documento)) {
    return res.status(400).json({ erro: 'O CPF ou CNPJ é obrigatório' });
  }
  if (!val.validarDocumento(documento)) {
    return res.status(400).json({ erro: 'CPF ou CNPJ inválido' });
  }
  if (val.vazio(email)) {
    return res.status(400).json({ erro: 'O email é obrigatório' });
  }
  if (!val.validarEmail(email)) {
    return res.status(400).json({ erro: 'Email inválido' });
  }

  try {
    const doc = val.soNumeros(documento);
    const resultado = await pool.query(
      'INSERT INTO cliente (usuario_id, nome, documento, email, telefone) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [usuario_id, nome.trim(), doc, email.trim(), telefone || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/clientes/:id', async (req, res) => {
  const id = req.params.id;
  const { usuario_id, nome, documento, email, telefone } = req.body;

  // mesma validacao do post (copiei de la)
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  if (val.vazio(nome)) {
    return res.status(400).json({ erro: 'O nome do cliente é obrigatório' });
  }
  if (val.vazio(documento)) {
    return res.status(400).json({ erro: 'O CPF ou CNPJ é obrigatório' });
  }
  if (!val.validarDocumento(documento)) {
    return res.status(400).json({ erro: 'CPF ou CNPJ inválido' });
  }
  if (val.vazio(email)) {
    return res.status(400).json({ erro: 'O email é obrigatório' });
  }
  if (!val.validarEmail(email)) {
    return res.status(400).json({ erro: 'Email inválido' });
  }

  try {
    const res2 = await pool.query(
      'UPDATE cliente SET nome = $1, documento = $2, email = $3, telefone = $4 WHERE id = $5 AND usuario_id = $6 RETURNING *',
      [nome.trim(), val.soNumeros(documento), email.trim(), telefone || null, id, usuario_id]
    );
    if (res2.rows.length == 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json(res2.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.delete('/clientes/:id', async (req, res) => {
  const id = req.params.id;
  const usuario_id = req.query.usuario_id;
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  try {
    const r = await pool.query('DELETE FROM cliente WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, usuario_id]);
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }
    res.json({ mensagem: 'Cliente excluído' });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== SERVICOS ===============
app.get('/servicos', async (req, res) => {
  const usuario_id = req.query.usuario_id;
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  try {
    const dados = await pool.query('SELECT * FROM servico WHERE usuario_id = $1 ORDER BY descricao', [usuario_id]);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/servicos', async (req, res) => {
  const { usuario_id, descricao, valor } = req.body;

  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
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
      [usuario_id, descricao.trim(), v]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/servicos/:id', async (req, res) => {
  const id = req.params.id;
  const { usuario_id, descricao, valor } = req.body;

  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
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
      [descricao.trim(), v, id, usuario_id]
    );
    if (res2.rows.length == 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }
    res.json(res2.rows[0]);
  } catch (err) {
    trataErro(res, err);
  }
});

app.delete('/servicos/:id', async (req, res) => {
  const id = req.params.id;
  const usuario_id = req.query.usuario_id;
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  try {
    const r = await pool.query('DELETE FROM servico WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, usuario_id]);
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }
    res.json({ mensagem: 'Serviço excluído' });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== NOTAS ===============
app.get('/notas', async (req, res) => {
  const usuario_id = req.query.usuario_id;
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  try {
    // to_char pq senao a data vem com fuso e muda o dia
    const sql = `SELECT n.id, n.descricao, n.valor, to_char(n.data_emissao, 'YYYY-MM-DD') AS data_emissao, n.status,
                        n.cliente_id, c.nome AS cliente_nome, n.servico_id, s.descricao AS servico_descricao
                 FROM nota_fiscal n
                 JOIN cliente c ON c.id = n.cliente_id
                 JOIN servico s ON s.id = n.servico_id
                 WHERE n.usuario_id = $1
                 ORDER BY n.data_emissao DESC, n.id DESC`;
    const dados = await pool.query(sql, [usuario_id]);
    res.json(dados.rows);
  } catch (err) {
    trataErro(res, err);
  }
});

app.post('/notas', async (req, res) => {
  const { usuario_id, cliente_id, servico_id, descricao, valor } = req.body;
  console.log('criando nota', req.body);

  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
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

// tira acento e deixa minusculo pra comparar os textos
function normaliza(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ajustado com IA para melhorar o codigo
// tenta achar o valor no texto, tipo "500 reais", "R$ 1.200,50", "350 conto"
function achaValor(texto) {
  var m = texto.match(/r\$\s*([\d.,]+)/);
  if (!m) {
    m = texto.match(/([\d.,]+)\s*(reais|real|conto|pila)/);
  }
  if (!m) return null;

  var numero = m[1];
  // "1.200,50" -> 1200.50
  if (numero.indexOf(',') >= 0) {
    numero = numero.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}$/.test(numero)) {
    // "1.200" e mil e duzentos, nao 1 virgula 2
    numero = numero.replace(/\./g, '');
  }
  var v = parseFloat(numero);
  if (isNaN(v) || v <= 0) return null;
  return v;
}

// POST /notas/interpretar
// recebe o texto que a pessoa falou (por enquanto digitado, simulando a transcricao do audio)
// TODO: aqui depois vai entrar a IA de verdade (transcrever o audio e entender o texto)
// por enquanto e so uma busca simples de palavras
app.post('/notas/interpretar', async (req, res) => {
  const { usuario_id, texto } = req.body;
  console.log('texto recebido:', texto);

  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  if (val.vazio(texto)) {
    return res.status(400).json({ erro: 'Escreva o que você disse' });
  }

  try {
    const clientes = await pool.query('SELECT * FROM cliente WHERE usuario_id = $1', [usuario_id]);
    const servicos = await pool.query('SELECT * FROM servico WHERE usuario_id = $1', [usuario_id]);
    const t = normaliza(texto);

    // procura o cliente: nome completo vale mais que so o primeiro nome
    let clienteAchado = null;
    let melhorPonto = 0;
    for (let i = 0; i < clientes.rows.length; i++) {
      const c = clientes.rows[i];
      const nome = normaliza(c.nome);
      const primeiroNome = nome.split(' ')[0];
      let pontos = 0;
      if (t.includes(nome)) {
        pontos = 10;
      } else if (primeiroNome.length >= 3 && new RegExp('\\b' + primeiroNome + '\\b').test(t)) {
        pontos = 5;
        // se tiver mais partes do nome soma mais
        const partes = nome.split(' ');
        for (let j = 1; j < partes.length; j++) {
          if (partes[j].length >= 3 && t.includes(partes[j])) pontos++;
        }
      }
      if (pontos > melhorPonto) {
        melhorPonto = pontos;
        clienteAchado = c;
      }
    }

    // procura o servico: ve se as palavras da descricao aparecem no texto
    // usa so o comeco da palavra pra pegar "pintei" -> "pintura", "rebocar" -> "reboco"
    const ignorar = ['de', 'da', 'do', 'e', 'em', 'com', 'para', 'pequenos', 'servico'];
    let servicoAchado = null;
    let melhor = 0;
    for (const s of servicos.rows) {
      const desc = normaliza(s.descricao);
      let pontos = 0;
      if (t.includes(desc)) {
        pontos = 100;
      } else {
        const palavras = desc.split(/\s+/);
        for (const p of palavras) {
          if (p.length < 4 || ignorar.includes(p)) continue;
          const pedaco = p.substring(0, 4);
          if (t.includes(pedaco)) pontos++;
        }
      }
      if (pontos > melhor) {
        melhor = pontos;
        servicoAchado = s;
      }
    }

    let valor = achaValor(t);
    let valorDoCadastro = false;
    // se a pessoa nao falou o valor usa o valor cadastrado do servico
    if (valor == null && servicoAchado) {
      valor = Number(servicoAchado.valor);
      valorDoCadastro = true;
    }

    const faltando = [];
    if (!clienteAchado) faltando.push('cliente');
    if (!servicoAchado) faltando.push('servico');
    if (valor == null) faltando.push('valor');

    // monta uma descricao pra nota
    let descricao = '';
    if (servicoAchado) {
      descricao = servicoAchado.descricao;
      if (clienteAchado) descricao += ' - ' + clienteAchado.nome;
    }

    const resposta = {
      cliente: clienteAchado,
      servico: servicoAchado,
      valor: valor,
      valor_do_cadastro: valorDoCadastro,
      descricao: descricao,
      faltando: faltando
    };
    console.log('resultado da interpretacao', resposta);
    res.json(resposta);
  } catch (err) {
    trataErro(res, err);
  }
});

// POST /notas/:id/emitir
// SIMULADO: gera um numero aleatorio e muda o status pra emitida
// TODO: depois aqui vai chamar a API do governo (NFS-e nacional)
app.post('/notas/:id/emitir', async (req, res) => {
  const id = req.params.id;
  const usuario_id = req.body.usuario_id;

  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }

  try {
    const nota = await pool.query('SELECT * FROM nota_fiscal WHERE id = $1 AND usuario_id = $2', [id, usuario_id]);
    if (nota.rows.length == 0) {
      return res.status(404).json({ erro: 'Nota não encontrada' });
    }
    if (nota.rows[0].status == 'emitida') {
      return res.status(400).json({ erro: 'Essa nota já foi emitida' });
    } else if (nota.rows[0].status == 'cancelada') {
      return res.status(400).json({ erro: 'Essa nota está cancelada' });
    }

    // simula o tempo de resposta da api
    // await new Promise(r => setTimeout(r, 1000));

    const numero = Math.floor(100000 + Math.random() * 900000);
    // TODO: salvar o numero da nota no banco (precisa criar uma coluna)
    await pool.query("UPDATE nota_fiscal SET status = 'emitida', data_emissao = CURRENT_DATE WHERE id = $1", [id]);

    res.json({
      mensagem: 'Nota emitida com sucesso (simulação)',
      id: Number(id),
      numero: numero,
      status: 'emitida'
    });
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== FATURAMENTO ===============
// so conta as notas emitidas
app.get('/faturamento', async (req, res) => {
  const usuario_id = req.query.usuario_id;
  let ano = req.query.ano;
  if (val.vazio(usuario_id)) {
    return res.status(400).json({ erro: 'Informe o usuario_id' });
  }
  if (val.vazio(ano)) {
    ano = new Date().getFullYear();
  }

  try {
    const total = await pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM nota_fiscal
       WHERE usuario_id = $1 AND status = 'emitida' AND EXTRACT(YEAR FROM data_emissao) = $2`,
      [usuario_id, ano]
    );
    const porMes = await pool.query(
      `SELECT EXTRACT(MONTH FROM data_emissao) AS mes, SUM(valor) AS total FROM nota_fiscal
       WHERE usuario_id = $1 AND status = 'emitida' AND EXTRACT(YEAR FROM data_emissao) = $2
       GROUP BY mes ORDER BY mes`,
      [usuario_id, ano]
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

// app.get('/teste', (req, res) => {
//   res.json({ ok: true });
// });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('servidor rodando na porta ' + PORT);
});
