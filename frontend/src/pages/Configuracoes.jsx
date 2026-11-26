import { useState, useEffect } from 'react'
import { api, pegaUsuario } from '../api.js'
import { mascaraCNPJ, mascaraTelefone, soNumeros } from '../formatos.js'
import CamposEndereco from '../components/CamposEndereco.jsx'

// tela Configuracoes (abre pelo menu do nome do usuario)
// aba "Meus dados" = dados do prestador que vao na nota
// aba "E-mail" = SMTP pra mandar as notas pro cliente
function Configuracoes() {
  const [aba, setAba] = useState('dados')

  return (
    <div className="config-tela">
      <h1>Configurações</h1>
      <div className="abas">
        <button type="button" className={aba == 'dados' ? 'ativa' : ''} onClick={() => setAba('dados')}>Meus dados</button>
        <button type="button" className={aba == 'email' ? 'ativa' : ''} onClick={() => setAba('email')}>E-mail</button>
      </div>
      {aba == 'dados' ? <MeusDados /> : <ConfigEmail />}
    </div>
  )
}

function MeusDados() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    api('/configuracoes/dados').then(r => {
      if (r.ok) setDados(r.dados)
      else setErro(r.dados.erro)
    })
  }, [])

  function campo(nome, valor) {
    setDados({ ...dados, [nome]: valor })
  }

  // consulta a BrasilAPI (pelo backend) e preenche o nome e o endereco
  // roda sozinho quando o CNPJ fica completo (o botao fica pra buscar de novo)
  async function buscarCnpj(cnpj) {
    setErro('')
    setMsg('')
    if (soNumeros(cnpj).length != 14) {
      setErro('Digite o CNPJ completo (14 números)')
      return
    }
    setBuscandoCnpj(true)
    const r = await api('/consulta/cnpj/' + soNumeros(cnpj))
    setBuscandoCnpj(false)
    if (!r.ok) {
      setErro(r.dados.erro)
      return
    }
    const c = r.dados
    setDados(dados => ({
      ...dados,
      nome: c.nome || dados.nome,
      telefone: dados.telefone || c.telefone,
      cep: c.cep || dados.cep,
      endereco: c.endereco || dados.endereco,
      numero: c.numero || dados.numero,
      bairro: c.bairro || dados.bairro,
      municipio: c.municipio || dados.municipio,
      uf: c.uf || dados.uf,
      codigo_ibge: c.codigo_ibge || dados.codigo_ibge
    }))
    setMsg('Dados da Receita preenchidos' + (c.situacao ? ' (situação: ' + c.situacao.toLowerCase() + ')' : '') + '. Confira e salve.')
  }

  function digitouCnpj(valor) {
    const cnpj = soNumeros(valor).substring(0, 14)
    const completou = cnpj.length == 14 && soNumeros(dados.cnpj).length != 14
    campo('cnpj', cnpj)
    if (completou) buscarCnpj(cnpj)
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setMsg('')
    setSalvando(true)
    const r = await api('/configuracoes/dados', { method: 'PUT', body: dados })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.dados.erro)
      return
    }
    setDados(r.dados)
    setMsg('Dados salvos')
    // atualiza o nome que aparece no menu
    const u = pegaUsuario()
    localStorage.setItem('usuario', JSON.stringify({ ...u, nome: r.dados.nome, email: r.dados.email, cnpj: r.dados.cnpj }))
    window.dispatchEvent(new Event('usuario-mudou'))
  }

  if (!dados) {
    return erro ? <p className="erro">{erro}</p> : <p className="texto-menor">Carregando...</p>
  }

  return (
    <form className="config-form" onSubmit={salvar}>
      <p className="texto-menor" style={{ marginTop: 0 }}>Esses dados aparecem como <strong>Prestador</strong> nas suas notas.</p>

      <div className="config-secao">
        <h2>Empresa</h2>
        <div className="grade-campos">
          <div className="campo-largo">
            <label>CNPJ</label>
            <input value={mascaraCNPJ(dados.cnpj)} onChange={e => digitouCnpj(e.target.value)} inputMode="numeric" />
          </div>
          <div className="campo-botao">
            <button type="button" className="secundario" onClick={() => buscarCnpj(dados.cnpj)} disabled={buscandoCnpj}>
              {buscandoCnpj ? 'Buscando...' : 'Buscar de novo'}
            </button>
          </div>
        </div>

        <label>Nome / nome empresarial</label>
        <input value={dados.nome || ''} onChange={e => campo('nome', e.target.value)} />

        <div className="grade-campos">
          <div className="campo-metade">
            <label>Inscrição municipal</label>
            <input value={dados.inscricao_municipal || ''} onChange={e => campo('inscricao_municipal', soNumeros(e.target.value))} placeholder="só números" inputMode="numeric" />
          </div>
          <div className="campo-metade">
            <label>Telefone</label>
            <input value={mascaraTelefone(dados.telefone)} onChange={e => campo('telefone', mascaraTelefone(e.target.value))} placeholder="(00) 00000-0000" />
          </div>
        </div>

        <label>E-mail</label>
        <input type="email" value={dados.email || ''} onChange={e => campo('email', e.target.value)} />

        <label>Situação no Simples Nacional</label>
        <input value={dados.simples_nacional} readOnly className="campo-fixo" />
      </div>

      <div className="config-secao">
        <h2>Endereço</h2>
        <CamposEndereco dados={dados} muda={novo => setDados(novo)} />
      </div>

      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="sucesso">{msg}</p>}
      <button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar dados'}</button>
    </form>
  )
}

function ConfigEmail() {
  const [cfg, setCfg] = useState(null)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [linkTeste, setLinkTeste] = useState('')
  const [ocupado, setOcupado] = useState('')

  useEffect(() => {
    api('/configuracoes/email').then(r => {
      if (r.ok) setCfg(r.dados)
      else setErro(r.dados.erro)
    })
  }, [])

  function campo(nome, valor) {
    setCfg({ ...cfg, [nome]: valor })
  }

  function limparMensagens() {
    setErro('')
    setMsg('')
    setLinkTeste('')
  }

  async function gravar() {
    const r = await api('/configuracoes/email', {
      method: 'PUT',
      body: {
        smtp_host: cfg.smtp_host,
        smtp_porta: cfg.smtp_porta,
        smtp_usuario: cfg.smtp_usuario,
        smtp_senha: senha, // vazio = mantem a senha que ja estava salva
        nome_remetente: cfg.nome_remetente
      }
    })
    if (!r.ok) {
      setErro(r.dados.erro)
      return false
    }
    setSenha('')
    setCfg({ ...cfg, configurado: r.dados.configurado, tem_senha: !!r.dados.tem_senha })
    return r.dados.mensagem
  }

  async function salvar(e) {
    e.preventDefault()
    limparMensagens()
    setOcupado('salvar')
    const ok = await gravar()
    if (ok) setMsg(ok)
    setOcupado('')
  }

  // salva primeiro (pra testar o que esta na tela) e depois manda o teste
  async function testar() {
    limparMensagens()
    setOcupado('teste')
    const ok = await gravar()
    if (!ok) {
      setOcupado('')
      return
    }
    const r = await api('/configuracoes/email/teste', { method: 'POST' })
    setOcupado('')
    if (!r.ok) {
      setErro(r.dados.erro)
      return
    }
    setMsg(r.dados.mensagem + (r.dados.origem == 'usuario' ? ' pelo seu servidor SMTP.' : r.dados.origem == 'env' ? ' pelo e-mail padrão do sistema.' : '.'))
    if (r.dados.link) setLinkTeste(r.dados.link)
  }

  if (!cfg) {
    return erro ? <p className="erro">{erro}</p> : <p className="texto-menor">Carregando...</p>
  }

  return (
    <form className="config-form" onSubmit={salvar}>
      <p className="texto-menor" style={{ marginTop: 0 }}>
        As notas são enviadas ao cliente por este e-mail. Se deixar em branco, o ANota usa o e-mail padrão do sistema
        (ou uma caixa de teste, quando o sistema também não tem).
      </p>

      <div className="config-secao">
        <h2>Servidor de e-mail (SMTP)</h2>
        <div className="grade-campos">
          <div className="campo-largo">
            <label>Servidor SMTP</label>
            <input value={cfg.smtp_host} onChange={e => campo('smtp_host', e.target.value.trim())} placeholder="smtp.gmail.com" />
          </div>
          <div className="campo-curto">
            <label>Porta</label>
            <input value={cfg.smtp_porta} onChange={e => campo('smtp_porta', soNumeros(e.target.value).substring(0, 5))} inputMode="numeric" />
          </div>
        </div>

        <label>Usuário</label>
        <input value={cfg.smtp_usuario} onChange={e => campo('smtp_usuario', e.target.value.trim())} placeholder="seu@email.com" />

        <label>Senha</label>
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          placeholder={cfg.tem_senha ? '••••••' : ''}
          autoComplete="new-password"
        />
        <span className="texto-menor" style={{ display: 'block', marginTop: 6 }}>
          {cfg.tem_senha ? 'Já tem uma senha salva. Deixe em branco para manter.' : 'No Gmail use uma "senha de app".'} A senha fica criptografada.
        </span>

        <label>Nome do remetente</label>
        <input value={cfg.nome_remetente} onChange={e => campo('nome_remetente', e.target.value)} placeholder="Como o cliente vê o seu nome" />
      </div>

      {erro && <p className="erro">{erro}</p>}
      {msg && (
        <p className="sucesso">
          {msg}
          {linkTeste && <> Foi para uma caixa de teste: <a href={linkTeste} target="_blank">ver o e-mail</a></>}
        </p>
      )}
      <div className="botoes">
        <button type="submit" disabled={ocupado != ''}>{ocupado == 'salvar' ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="secundario" onClick={testar} disabled={ocupado != ''}>
          {ocupado == 'teste' ? 'Enviando...' : 'Enviar e-mail de teste'}
        </button>
      </div>
    </form>
  )
}

export default Configuracoes
