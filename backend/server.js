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
const cripto = require('./cripto');
const { consultaCep, consultaCnpj, ErroConsulta } = require('./consultas');

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

// =============== CONSULTAS (ViaCEP e BrasilAPI) ===============
// o front chama aqui e o backend chama a API de fora (assim da pra validar e tratar o erro num lugar so)
app.get('/consulta/cep/:cep', verificaToken, async (req, res) => {
  const cep = val.soNumeros(req.params.cep);
  if (!val.validarCEP(cep)) {
    return res.status(400).json({ erro: 'O CEP precisa ter 8 números' });
  }
  try {
    res.json(await consultaCep(cep));
  } catch (err) {
    if (err instanceof ErroConsulta) return res.status(err.status).json({ erro: err.message });
    trataErro(res, err);
  }
});

app.get('/consulta/cnpj/:cnpj', verificaToken, async (req, res) => {
  const cnpj = val.soNumeros(req.params.cnpj);
  if (!val.validarCNPJ(cnpj)) {
    return res.status(400).json({ erro: 'CNPJ inválido' });
  }
  try {
    res.json(await consultaCnpj(cnpj));
  } catch (err) {
    if (err instanceof ErroConsulta) return res.status(err.status).json({ erro: err.message });
    trataErro(res, err);
  }
});

// valida os campos de endereco que se repetem no prestador e no cliente
// (todos opcionais, mas se vier tem que estar certo)
function validaEndereco(body) {
  if (!val.vazio(body.cep) && !val.validarCEP(body.cep)) return 'O CEP precisa ter 8 números';
  if (!val.vazio(body.uf) && !val.validarUF(body.uf)) return 'UF inválida (use a sigla do estado, ex: SC)';
  if (!val.vazio(body.codigo_ibge) && !val.validarIBGE(body.codigo_ibge)) return 'O código IBGE do município tem 7 números';
  if (!val.vazio(body.telefone) && !val.validarTelefone(body.telefone)) return 'Telefone inválido (coloque o DDD)';
  if (!val.vazio(body.numero) && String(body.numero).length > 10) return 'Número do endereço muito grande';
  return null;
}

// deixa vazio como null e corta o texto no tamanho da coluna
function textoOuNull(v, tamanho) {
  if (val.vazio(v)) return null;
  return String(v).trim().substring(0, tamanho);
}

// =============== CONFIGURACOES: MEUS DADOS ===============
// o "Simples Nacional" nao fica no banco: o ANota e so pra MEI, entao e sempre o mesmo texto
const SIMPLES_NACIONAL = 'Optante - Microempreendedor Individual (MEI)';

app.get('/configuracoes/dados', verificaToken, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nome, cnpj, email, inscricao_municipal, telefone, cep, endereco, numero, bairro, municipio, uf, codigo_ibge
       FROM usuario WHERE id = $1`,
      [req.usuario_id]
    );
    if (r.rows.length == 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    const dados = r.rows[0];
    dados.simples_nacional = SIMPLES_NACIONAL;
    res.json(dados);
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/configuracoes/dados', verificaToken, async (req, res) => {
  const b = req.body;
  if (val.vazio(b.nome)) return res.status(400).json({ erro: 'Informe o nome' });
  if (val.vazio(b.cnpj) || !val.validarCNPJ(b.cnpj)) return res.status(400).json({ erro: 'CNPJ inválido' });
  if (val.vazio(b.email) || !val.validarEmail(b.email)) return res.status(400).json({ erro: 'E-mail inválido' });
  if (!val.vazio(b.inscricao_municipal) && !/^\d{1,20}$/.test(val.soNumeros(b.inscricao_municipal))) {
    return res.status(400).json({ erro: 'Inscrição municipal inválida' });
  }
  const erroEnd = validaEndereco(b);
  if (erroEnd) return res.status(400).json({ erro: erroEnd });

  try {
    const cnpj = val.soNumeros(b.cnpj);
    const email = b.email.trim().toLowerCase();
    // outro usuario ja usa esse email ou cnpj?
    const existe = await pool.query('SELECT id FROM usuario WHERE (email = $1 OR cnpj = $2) AND id <> $3', [email, cnpj, req.usuario_id]);
    if (existe.rows.length > 0) {
      return res.status(400).json({ erro: 'Já existe outra conta com esse e-mail ou CNPJ' });
    }

    const r = await pool.query(
      `UPDATE usuario SET nome = $1, cnpj = $2, email = $3, inscricao_municipal = $4, telefone = $5, cep = $6,
              endereco = $7, numero = $8, bairro = $9, municipio = $10, uf = $11, codigo_ibge = $12
       WHERE id = $13
       RETURNING id, nome, cnpj, email, inscricao_municipal, telefone, cep, endereco, numero, bairro, municipio, uf, codigo_ibge`,
      [
        b.nome.trim().substring(0, 100), cnpj, email,
        val.vazio(b.inscricao_municipal) ? null : val.soNumeros(b.inscricao_municipal),
        textoOuNull(b.telefone, 20),
        val.vazio(b.cep) ? null : val.soNumeros(b.cep),
        textoOuNull(b.endereco, 150), textoOuNull(b.numero, 10), textoOuNull(b.bairro, 80), textoOuNull(b.municipio, 80),
        val.vazio(b.uf) ? null : b.uf.trim().toUpperCase(),
        val.vazio(b.codigo_ibge) ? null : val.soNumeros(b.codigo_ibge),
        req.usuario_id
      ]
    );
    const dados = r.rows[0];
    dados.simples_nacional = SIMPLES_NACIONAL;
    res.json(dados);
  } catch (err) {
    trataErro(res, err);
  }
});

// =============== CONFIGURACOES: E-MAIL ===============
// a senha nunca volta pro front, so avisa se ja tem uma salva
app.get('/configuracoes/email', verificaToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM config_email WHERE usuario_id = $1', [req.usuario_id]);
    if (r.rows.length == 0) {
      return res.json({ configurado: false, smtp_host: '', smtp_porta: 587, smtp_usuario: '', nome_remetente: '', tem_senha: false });
    }
    const c = r.rows[0];
    res.json({
      configurado: true,
      smtp_host: c.smtp_host,
      smtp_porta: c.smtp_porta,
      smtp_usuario: c.smtp_usuario,
      nome_remetente: c.nome_remetente || '',
      tem_senha: !!c.smtp_senha
    });
  } catch (err) {
    trataErro(res, err);
  }
});

app.put('/configuracoes/email', verificaToken, async (req, res) => {
  const { smtp_host, smtp_porta, smtp_usuario, smtp_senha, nome_remetente } = req.body;

  // mandou tudo vazio = quer apagar a configuracao e voltar pro e-mail padrao
  if (val.vazio(smtp_host) && val.vazio(smtp_usuario) && val.vazio(smtp_senha)) {
    try {
      await pool.query('DELETE FROM config_email WHERE usuario_id = $1', [req.usuario_id]);
      return res.json({ mensagem: 'Configuração removida, as notas vão pelo e-mail padrão do sistema', configurado: false });
    } catch (err) {
      return trataErro(res, err);
    }
  }

  if (val.vazio(smtp_host) || !/^[a-zA-Z0-9.-]+$/.test(String(smtp_host).trim())) {
    return res.status(400).json({ erro: 'Servidor SMTP inválido (ex: smtp.gmail.com)' });
  }
  const porta = Number(smtp_porta);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    return res.status(400).json({ erro: 'Porta inválida (normalmente 587 ou 465)' });
  }
  if (val.vazio(smtp_usuario)) {
    return res.status(400).json({ erro: 'Informe o usuário do SMTP (normalmente o seu e-mail)' });
  }
  if (!val.vazio(smtp_senha) && !cripto.temChave()) {
    return res.status(500).json({ erro: 'O servidor está sem CRIPTO_CHAVE no .env, não dá pra salvar a senha' });
  }

  try {
    const atual = await pool.query('SELECT smtp_senha FROM config_email WHERE usuario_id = $1', [req.usuario_id]);
    // se nao mandou senha nova, mantem a que ja estava salva
    let senha = atual.rows.length > 0 ? atual.rows[0].smtp_senha : null;
    if (!val.vazio(smtp_senha)) {
      senha = cripto.criptografar(String(smtp_senha));
    }
    if (!senha) {
      return res.status(400).json({ erro: 'Informe a senha do SMTP' });
    }

    await pool.query(
      `INSERT INTO config_email (usuario_id, smtp_host, smtp_porta, smtp_usuario, smtp_senha, nome_remetente)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (usuario_id) DO UPDATE SET smtp_host = $2, smtp_porta = $3, smtp_usuario = $4, smtp_senha = $5, nome_remetente = $6`,
      [req.usuario_id, String(smtp_host).trim(), porta, String(smtp_usuario).trim().substring(0, 100), senha, textoOuNull(nome_remetente, 100)]
    );
    res.json({ mensagem: 'Configuração de e-mail salva', configurado: true, tem_senha: true });
  } catch (err) {
    trataErro(res, err);
  }
});

// pega o SMTP do usuario com a senha aberta (so usa aqui dentro, nunca manda pro front)
async function pegaConfigEmail(usuario_id) {
  const r = await pool.query('SELECT * FROM config_email WHERE usuario_id = $1', [usuario_id]);
  if (r.rows.length == 0) return null;
  const c = r.rows[0];
  try {
    c.smtp_senha = cripto.descriptografar(c.smtp_senha);
  } catch (err) {
    // trocou a CRIPTO_CHAVE e nao da mais pra abrir a senha
    console.log('nao consegui abrir a senha do smtp:', err.message);
    throw new Error('Não foi possível ler a senha do e-mail salva. Salve a senha de novo em Configurações.');
  }
  return c;
}

// POST /configuracoes/email/teste - manda um email de teste pro proprio usuario
app.post('/configuracoes/email/teste', verificaToken, async (req, res) => {
  try {
    const u = await pool.query('SELECT nome, email FROM usuario WHERE id = $1', [req.usuario_id]);
    let config;
    try {
      config = await pegaConfigEmail(req.usuario_id);
    } catch (err) {
      return res.status(400).json({ erro: err.message });
    }

    let envio;
    try {
      envio = await enviarEmail(
        u.rows[0].email,
        'Teste de e-mail do ANota',
        'Olá, ' + u.rows[0].nome + '!\n\nSe você recebeu esta mensagem, o envio de notas por e-mail do ANota está funcionando.\n\nANota',
        null,
        config
      );
    } catch (err) {
      console.log('erro no email de teste:', err.message);
      return res.status(400).json({ erro: 'Não consegui enviar: ' + err.message });
    }
    res.json({
      mensagem: 'E-mail de teste enviado para ' + u.rows[0].email,
      origem: envio.origem,
      teste: envio.teste,
      link: envio.link
    });
  } catch (err) {
    trataErro(res, err);
  }
});

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

    // usa o SMTP que o usuario salvou em Configuracoes (se nao tiver, o email.js usa o .env ou o Ethereal)
    let config;
    try {
      config = await pegaConfigEmail(req.usuario_id);
    } catch (err) {
      return res.status(400).json({ erro: err.message });
    }

    let envio;
    try {
      envio = await enviarEmail(nota.cliente_email, 'Nota fiscal nº ' + nota.numero_nfse, texto, {
        filename: 'nfse-' + nota.numero_nfse + '.pdf',
        content: pdf
      }, config);
    } catch (err) {
      console.log('erro ao mandar email:', err.message);
      return res.status(500).json({ erro: 'Não foi possível enviar o e-mail. Confira a configuração em Configurações > E-mail.' });
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
