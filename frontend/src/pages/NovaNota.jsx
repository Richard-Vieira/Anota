import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, formataDinheiro } from '../api.js'

// reconhecimento de voz do proprio navegador (Web Speech API)
// no Chrome e no Edge funciona, no Firefox nao tem
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition

// tira acento e deixa minusculo pra comparar palavras
function normaliza(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9$]/g, '')
}

// ajustado com IA para melhorar o codigo
// pinta de verde no texto falado as palavras que viraram cliente, servico e valor
// (servico compara so o comeco da palavra: "pintei" bate com "pintura")
function destacaTexto(texto, cliente, servico) {
  const nomeCliente = cliente ? cliente.nome.split(' ').map(normaliza).filter(p => p.length >= 3) : []
  const nomeServico = servico ? servico.descricao.split(' ').map(normaliza).filter(p => p.length >= 4) : []
  const palavras = texto.split(' ')
  const pedacos = [] // { texto, marcado }

  for (let i = 0; i < palavras.length; i++) {
    const p = normaliza(palavras[i])
    const anterior = i > 0 ? normaliza(palavras[i - 1]) : ''
    let marcado = false
    if (nomeCliente.includes(p)) marcado = true
    if (p.length >= 4 && nomeServico.some(s => s.substring(0, 4) == p.substring(0, 4))) marcado = true
    if (/\d/.test(p) || p == 'r$') marcado = true
    if (['reais', 'real', 'conto', 'pila'].includes(p) && /\d/.test(anterior)) marcado = true

    // junta palavras marcadas seguidas num chip so ("Joana Silva")
    const ultimo = pedacos[pedacos.length - 1]
    if (ultimo && ultimo.marcado == marcado) {
      ultimo.texto += ' ' + palavras[i]
    } else {
      pedacos.push({ texto: (ultimo ? ' ' : '') + palavras[i], marcado })
    }
  }

  return pedacos.map((p, i) => {
    if (!p.marcado) return <span key={i}>{p.texto}</span>
    // a virgula/ponto do final fica fora do chip
    const partes = p.texto.trim().match(/^(.*?)([.,!?;:]*)$/)
    return <span key={i}>{p.texto.startsWith(' ') ? ' ' : ''}<span className="chip">{partes[1]}</span>{partes[2]}</span>
  })
}

// icone do microfone (svg branco)
function IconeMicrofone() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  )
}

function NovaNota() {
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState(null)
  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [gravando, setGravando] = useState(false)
  const reconhecimento = useRef(null)
  const [editandoDados, setEditandoDados] = useState(false)
  const [enviarEmail, setEnviarEmail] = useState(false)
  const [enviarZap, setEnviarZap] = useState(false)
  const [linkZap, setLinkZap] = useState('')

  // campos da previa (da pra mudar antes de emitir)
  const [clienteId, setClienteId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')

  // carrega clientes e servicos pros selects
  useEffect(() => {
    api('/clientes').then(r => { if (r.ok) setClientes(r.dados) })
    api('/servicos').then(r => { if (r.ok) setServicos(r.dados) })

    // se sair da tela gravando, para o microfone
    return () => {
      if (reconhecimento.current) reconhecimento.current.abort()
    }
  }, [])

  // ajustado com IA para melhorar o codigo
  // liga/desliga o microfone. O navegador vai transformando a fala em texto
  // e o texto vai aparecendo no campo "O que você disse" (da pra corrigir depois)
  function microfone() {
    setErro('')
    if (!Reconhecimento) return

    if (gravando) {
      reconhecimento.current.stop()
      return
    }

    const rec = new Reconhecimento()
    rec.lang = 'pt-BR'
    rec.continuous = true // continua ouvindo ate clicar de novo
    rec.interimResults = true // mostra o texto enquanto a pessoa ainda ta falando

    // se ja tinha texto no campo, junta com o que falar agora
    const textoAntes = texto.trim() == '' ? '' : texto.trim() + ' '

    rec.onresult = (evento) => {
      let falado = ''
      for (let i = 0; i < evento.results.length; i++) {
        falado += evento.results[i][0].transcript
      }
      setTexto(textoAntes + falado)
    }
    rec.onerror = (evento) => {
      console.log('erro no microfone', evento.error)
      if (evento.error == 'not-allowed' || evento.error == 'service-not-allowed') {
        setErro('O navegador não deixou usar o microfone. Libere a permissão ou digite o texto.')
      } else if (evento.error == 'no-speech') {
        setErro('Não ouvi nada. Tente de novo falando mais perto do microfone.')
      } else if (evento.error == 'network') {
        setErro('O reconhecimento de voz precisa de internet. Você pode digitar o texto.')
      } else if (evento.error != 'aborted') {
        setErro('Não consegui gravar (' + evento.error + '). Você pode digitar o texto.')
      }
    }
    rec.onend = () => setGravando(false)

    rec.start()
    reconhecimento.current = rec
    setGravando(true)
  }

  async function interpretar() {
    setErro('')
    setMsg('')
    setPrevia(null)
    if (gravando) reconhecimento.current.stop()
    if (texto.trim() == '') {
      setErro('Fale ou escreva o que você fez')
      return
    }
    setCarregando(true)
    const r = await api('/notas/interpretar', { method: 'POST', body: { texto } })
    console.log('interpretou', r.dados)
    if (!r.ok) {
      setErro(r.dados.erro)
    } else {
      const d = r.dados
      setPrevia(d)
      setEditandoDados(false)
      setClienteId(d.cliente ? d.cliente.id : '')
      setServicoId(d.servico ? d.servico.id : '')
      setValor(d.valor ? d.valor : '')
      setDescricao(d.descricao)
    }
    setCarregando(false)
  }

  // quando escolhe o servico na mao e ainda nao tem valor, usa o valor cadastrado
  function escolheServico(id) {
    setServicoId(id)
    const s = servicos.find(x => x.id == id)
    if (s && valor == '') setValor(Number(s.valor))
    if (s && descricao == '') setDescricao(s.descricao)
  }

  // o que ainda falta (vai sumindo conforme a pessoa preenche)
  const faltando = []
  if (clienteId == '') faltando.push('cliente')
  if (servicoId == '') faltando.push('serviço')
  if (valor == '' || Number(valor) <= 0) faltando.push('valor')
  if (descricao.trim() == '') faltando.push('descrição')

  async function emitir() {
    setErro('')
    if (faltando.length > 0) {
      setErro('Preencha antes de emitir: ' + faltando.join(', '))
      return
    }
    setCarregando(true)

    // primeiro salva a nota
    const r1 = await api('/notas', {
      method: 'POST',
      body: { cliente_id: clienteId, servico_id: servicoId, descricao: descricao, valor: valor }
    })
    if (!r1.ok) {
      setErro(r1.dados.erro)
      setCarregando(false)
      return
    }

    // depois manda emitir (simulado)
    const r2 = await api('/notas/' + r1.dados.id + '/emitir', { method: 'POST' })
    if (!r2.ok) {
      setErro(r2.dados.erro + ' (a nota ficou pendente na tela Notas)')
    } else {
      let mensagem = 'Nota nº ' + r2.dados.numero + ' emitida! Valor: ' + formataDinheiro(valor) + '.'

      // se marcou "Enviar por e-mail" usa a mesma rota do botao da tela Notas
      if (enviarEmail) {
        const r3 = await api('/notas/' + r1.dados.id + '/enviar-email', { method: 'POST' })
        mensagem += r3.ok ? ' ' + r3.dados.mensagem : ' Não consegui enviar o e-mail: ' + r3.dados.erro
      }

      // WhatsApp: monta o mesmo link wa.me da tela Notas (abre quando clicar no link)
      setLinkZap('')
      const cli = clientes.find(c => c.id == clienteId)
      let tel = String((cli && cli.telefone) || '').replace(/\D/g, '')
      if (enviarZap && tel == '') {
        mensagem += ' O cliente não tem telefone cadastrado para o WhatsApp.'
      } else if (enviarZap) {
        if (!(tel.startsWith('55') && tel.length >= 12)) tel = '55' + tel
        const txt = 'Olá, ' + cli.nome + '! Segue a nota fiscal de serviço nº ' + r2.dados.numero +
          ' referente a "' + descricao + '", no valor de ' + formataDinheiro(valor) + '. Obrigado!'
        setLinkZap('https://wa.me/' + tel + '?text=' + encodeURIComponent(txt))
      }

      setMsg(mensagem)
      setPrevia(null)
      setEditandoDados(false)
      setTexto('')
    }
    setCarregando(false)
  }

  const clienteEscolhido = clientes.find(c => c.id == clienteId)
  const servicoEscolhido = servicos.find(x => x.id == servicoId)
  const hoje = new Date().toLocaleDateString('pt-BR')

  // os campos de editar (aparecem na caixa amarela quando falta algo, ou no "Editar dados")
  function campo(nome) {
    if (nome == 'cliente') {
      return (
        <div key="cliente">
          <label>Cliente</label>
          <select className={faltando.includes('cliente') ? 'campo-faltando' : ''} value={clienteId} onChange={e => setClienteId(e.target.value)}>
            <option value="">-- selecione --</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          {clientes.length == 0 && <small>Você ainda não tem clientes. <Link to="/clientes">Cadastre aqui</Link>.</small>}
        </div>
      )
    }
    if (nome == 'serviço') {
      return (
        <div key="servico">
          <label>Serviço</label>
          <select className={faltando.includes('serviço') ? 'campo-faltando' : ''} value={servicoId} onChange={e => escolheServico(e.target.value)}>
            <option value="">-- selecione --</option>
            {servicos.map(s => (
              <option key={s.id} value={s.id}>{s.descricao}</option>
            ))}
          </select>
        </div>
      )
    }
    if (nome == 'valor') {
      return (
        <div key="valor">
          <label>Valor (R$)</label>
          <input className={faltando.includes('valor') ? 'campo-faltando' : ''} type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} />
        </div>
      )
    }
    return (
      <div key="descricao">
        <label>Descrição</label>
        <input className={faltando.includes('descrição') ? 'campo-faltando' : ''} type="text" value={descricao} onChange={e => setDescricao(e.target.value)} />
      </div>
    )
  }

  const falta = <span className="falta">Falta informar</span>

  return (
    <div className="duas-colunas">
      {/* ============ esquerda: gravar e o texto ============ */}
      <div>
        <div className="gravar">
          <button
            type="button"
            className={'botao-microfone' + (gravando ? ' gravando' : '')}
            onClick={microfone}
            disabled={!Reconhecimento || carregando}
            title={gravando ? 'Parar de gravar' : 'Gravar áudio'}
          >
            <IconeMicrofone />
          </button>
          <div>
            <strong>{gravando ? 'Ouvindo... toque de novo para parar' : (texto != '' ? 'Áudio recebido' : 'Toque para gravar')}</strong>
            <span className="texto-menor">Diga para quem fez o serviço, o que fez e quanto cobrou.</span>
          </div>
        </div>

        {!Reconhecimento && (
          <p className="aviso">
            Seu navegador não tem reconhecimento de voz (funciona no Chrome e no Edge). Pode digitar normalmente abaixo.
          </p>
        )}

        <h2 style={{ marginTop: 40, marginBottom: 8 }}>O que você disse</h2>
        {previa ? (
          <>
            <p className="texto-falado">{destacaTexto(texto, clienteEscolhido, servicoEscolhido)}</p>
            <button className="pequeno" style={{ marginTop: 8, marginLeft: -12 }} onClick={() => setPrevia(null)}>Corrigir o texto</button>
          </>
        ) : (
          <>
            <textarea
              className="textarea-falado"
              rows="4"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ex.: Fiz a pintura da casa da Joana Silva, ficou 1.500 reais"
            />
            <button onClick={interpretar} disabled={carregando}>
              {carregando ? 'Aguarde...' : 'Gerar prévia'}
            </button>
          </>
        )}

        {/* caixa amarela: o que a IA nao entendeu */}
        {previa && faltando.length > 0 && !editandoDados && (
          <div className="aviso">
            <strong style={{ fontWeight: 500 }}>{previa.pergunta || 'Falta informar: ' + faltando.join(', ')}</strong>
            {faltando.map(f => campo(f))}
          </div>
        )}

        {erro && <p className="erro">{erro}</p>}
        {msg && (
          <p className="sucesso">
            {msg}{' '}
            {linkZap && <><a href={linkZap} target="_blank">Abrir o WhatsApp</a>. </>}
            <Link to="/notas">Ir para Notas</Link> para baixar o PDF.
          </p>
        )}
      </div>

      {/* ============ direita: previa da nota ============ */}
      <div className="painel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Prévia da nota</h2>
          {previa && (
            <span className={'chip' + (previa.origem == 'ia' ? '' : ' cinza')}>
              {previa.origem == 'ia' ? 'entendido pela IA' : 'interpretação simulada'}
            </span>
          )}
        </div>

        <div className="papel">
          <div className="papel-linha"><span>Cliente</span><span>{!previa ? '—' : clienteEscolhido ? clienteEscolhido.nome : falta}</span></div>
          <div className="papel-linha"><span>CPF/CNPJ</span><span>{!previa ? '—' : clienteEscolhido ? clienteEscolhido.documento : falta}</span></div>
          <div className="papel-linha"><span>Serviço</span><span>{!previa ? '—' : servicoEscolhido ? servicoEscolhido.descricao : falta}</span></div>
          <div className="papel-linha"><span>Descrição</span><span>{!previa ? '—' : descricao.trim() != '' ? descricao : falta}</span></div>
          <div className="papel-linha"><span>Data</span><span>{hoje}</span></div>
          <div className="papel-valor">
            <span>Valor</span>
            {previa && faltando.includes('valor')
              ? falta
              : <span className="valor-destaque" style={{ color: '#16201C' }}>{formataDinheiro(previa ? valor : 0)}</span>}
          </div>
          {previa && previa.valor_do_cadastro && (
            <p className="texto-menor" style={{ margin: '8px 0 0' }}>Você não falou o valor, usei o valor cadastrado do serviço.</p>
          )}
        </div>

        {!previa && <p className="texto-menor">A prévia aparece aqui depois que você falar o serviço.</p>}

        {previa && editandoDados && (
          <div>{['cliente', 'serviço', 'valor', 'descrição'].map(f => campo(f))}</div>
        )}

        {previa && (
          <>
            <div className="checks">
              <span>Enviar ao cliente por:</span>
              <label><input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)} /> E-mail</label>
              <label><input type="checkbox" checked={enviarZap} onChange={e => setEnviarZap(e.target.checked)} /> WhatsApp</label>
            </div>
            <div className="botoes">
              <button onClick={emitir} disabled={carregando}>
                {carregando ? 'Emitindo...' : 'Emitir nota'}
              </button>
              <button className="secundario" onClick={() => setEditandoDados(!editandoDados)}>
                {editandoDados ? 'Pronto' : 'Editar dados'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default NovaNota
