import { useState, useEffect } from 'react'
import { API } from '../config.js'

function NovaNota() {
  const usuario = JSON.parse(localStorage.getItem('usuario'))

  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState(null)
  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [carregando, setCarregando] = useState(false)

  // campos da previa (da pra mudar antes de emitir)
  const [clienteId, setClienteId] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')

  // carrega clientes e servicos pros selects
  useEffect(() => {
    fetch(API + '/clientes?usuario_id=' + usuario.id)
      .then(r => r.json())
      .then(d => setClientes(d))
    fetch(API + '/servicos?usuario_id=' + usuario.id)
      .then(r => r.json())
      .then(d => setServicos(d))
  }, [])

  async function interpretar() {
    setErro('')
    setMsg('')
    setPrevia(null)
    if (texto.trim() == '') {
      setErro('Escreva o que você disse')
      return
    }
    setCarregando(true)
    try {
      const resp = await fetch(API + '/notas/interpretar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id, texto: texto })
      })
      const dados = await resp.json()
      console.log('interpretou', dados)
      if (!resp.ok) {
        setErro(dados.erro)
      } else {
        setPrevia(dados)
        setClienteId(dados.cliente ? dados.cliente.id : '')
        setServicoId(dados.servico ? dados.servico.id : '')
        setValor(dados.valor ? dados.valor : '')
        setDescricao(dados.descricao)
      }
    } catch (e) {
      setErro('Erro ao conectar no servidor')
    }
    setCarregando(false)
  }

  async function emitir() {
    setErro('')
    if (clienteId == '' || servicoId == '' || valor == '') {
      setErro('Preencha cliente, serviço e valor antes de emitir')
      return
    }
    setCarregando(true)
    try {
      // primeiro salva a nota
      const r1 = await fetch(API + '/notas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: usuario.id,
          cliente_id: clienteId,
          servico_id: servicoId,
          descricao: descricao,
          valor: valor
        })
      })
      const nota = await r1.json()
      if (!r1.ok) {
        setErro(nota.erro)
        setCarregando(false)
        return
      }

      // depois manda emitir (simulado)
      const r2 = await fetch(API + '/notas/' + nota.id + '/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id })
      })
      const res2 = await r2.json()
      if (!r2.ok) {
        setErro(res2.erro)
      } else {
        setMsg('Nota emitida! Número: ' + res2.numero)
        setPrevia(null)
        setTexto('')
      }
    } catch (e) {
      setErro('Erro ao conectar no servidor')
    }
    setCarregando(false)
  }

  return (
    <div>
      <h2>Nova nota</h2>
      <div className="card">
        <label>O que você disse</label>
        {/* TODO: trocar por gravacao de audio quando tiver a IA */}
        <textarea
          rows="4"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Ex.: Fiz a pintura da casa da Joana Silva, ficou 1.500 reais"
        />
        <button onClick={interpretar} disabled={carregando}>
          {carregando ? 'Aguarde...' : 'Gerar prévia'}
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="sucesso">{msg}</p>}

      {previa && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Prévia da nota</h3>

          {previa.faltando.length > 0 && (
            <p className="aviso">
              Não consegui identificar: {previa.faltando.join(', ')}. Preencha abaixo.
            </p>
          )}

          <label>Cliente</label>
          <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
            <option value="">-- selecione --</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>

          <label>Serviço</label>
          <select value={servicoId} onChange={e => setServicoId(e.target.value)}>
            <option value="">-- selecione --</option>
            {servicos.map(s => (
              <option key={s.id} value={s.id}>{s.descricao}</option>
            ))}
          </select>

          <label>Valor (R$)</label>
          <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />
          {previa.valor_do_cadastro && (
            <small style={{ color: '#888' }}>Você não falou o valor, usei o valor cadastrado do serviço.</small>
          )}

          <label>Descrição</label>
          <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} />

          <button onClick={emitir} disabled={carregando}>Emitir nota</button>
          <button className="secundario" onClick={() => setPrevia(null)} style={{ marginLeft: 8 }}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

export default NovaNota
