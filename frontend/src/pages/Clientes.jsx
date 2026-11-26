import { useState, useEffect } from 'react'
import { api, formataDinheiro, pegaIniciais } from '../api.js'

function Clientes() {
  const [lista, setLista] = useState([])
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [editando, setEditando] = useState(null) // id do cliente que ta editando
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [notas, setNotas] = useState([]) // so pra contar as notas de cada cliente
  const [busca, setBusca] = useState('')

  async function carregar() {
    const r = await api('/clientes')
    if (r.ok) {
      setLista(r.dados)
    } else {
      setErro(r.dados.erro)
    }
    const r2 = await api('/notas')
    if (r2.ok) setNotas(r2.dados)
  }

  useEffect(() => {
    carregar()
  }, [])

  function limpar() {
    setNome('')
    setDocumento('')
    setEmail('')
    setTelefone('')
    setEditando(null)
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setMsg('')

    // a validacao de verdade ta no backend, aqui so ve se ta vazio
    if (nome == '' || documento == '' || email == '') {
      setErro('Preencha nome, CPF/CNPJ e email')
      return
    }

    let url = '/clientes'
    let metodo = 'POST'
    if (editando) {
      url = '/clientes/' + editando
      metodo = 'PUT'
    }

    // o usuario_id nao vai mais, a api pega pelo token
    const r = await api(url, { method: metodo, body: { nome, documento, email, telefone } })
    if (!r.ok) {
      setErro(r.dados.erro)
      return
    }
    setMsg(editando ? 'Cliente atualizado' : 'Cliente cadastrado')
    limpar()
    carregar()
  }

  function editar(cli) {
    setErro('')
    setMsg('')
    setEditando(cli.id)
    setNome(cli.nome)
    setDocumento(cli.documento)
    setEmail(cli.email || '')
    setTelefone(cli.telefone || '')
  }

  async function excluir(id) {
    setErro('')
    setMsg('')
    if (!confirm('Excluir esse cliente?')) return
    const r = await api('/clientes/' + id, { method: 'DELETE' })
    if (!r.ok) {
      setErro(r.dados.erro)
    } else {
      setMsg('Cliente excluído')
      carregar()
    }
  }

  // quantas notas e quanto cada cliente ja pagou (so emitidas e enviadas, igual o faturamento)
  function resumoCliente(id) {
    const dele = notas.filter(n => n.cliente_id == id && (n.status == 'emitida' || n.status == 'enviada'))
    const total = dele.reduce((soma, n) => soma + Number(n.valor), 0)
    return { qtd: dele.length, total }
  }

  const b = busca.trim().toLowerCase()
  const filtrados = lista.filter(c => c.nome.toLowerCase().includes(b) || String(c.documento).includes(b))

  return (
    <div className="duas-colunas lista-e-form">
      <div>
        <h1>Clientes</h1>
        <input className="busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou CPF/CNPJ" />

        {filtrados.length == 0 && (
          <p className="lista-vazia">{lista.length == 0 ? 'Nenhum cliente cadastrado ainda' : 'Nenhum cliente encontrado'}</p>
        )}
        {filtrados.map(c => {
          const r = resumoCliente(c.id)
          return (
            <div className="lista-linha" key={c.id}>
              <span className="iniciais">{pegaIniciais(c.nome)}</span>
              <div className="lista-info">
                <div className="lista-nome">{c.nome}</div>
                <div className="lista-doc">{c.documento}{c.email ? ' · ' + c.email : ''}</div>
              </div>
              <div className="lista-numeros">
                <strong>{formataDinheiro(r.total)}</strong>
                {r.qtd} {r.qtd == 1 ? 'nota' : 'notas'}
              </div>
              <div className="lista-acoes">
                <button className="pequeno" onClick={() => editar(c)}>Editar</button>
                <button className="pequeno perigo" onClick={() => excluir(c.id)}>Excluir</button>
              </div>
            </div>
          )
        })}
      </div>

      <form className="painel" onSubmit={salvar}>
        <h2>{editando ? 'Editar cliente' : 'Novo cliente'}</h2>
        <label>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} />

        <label>CPF ou CNPJ</label>
        <input value={documento} onChange={e => setDocumento(e.target.value)} placeholder="só números ou com pontuação" />

        <label>E-mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} />

        <label>Telefone</label>
        <input value={telefone} onChange={e => setTelefone(e.target.value)} />

        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="sucesso">{msg}</p>}

        <div className="botoes">
          <button type="submit">Salvar cliente</button>
          {editando && (
            <button type="button" className="secundario" onClick={limpar}>Cancelar</button>
          )}
        </div>
      </form>
    </div>
  )
}

export default Clientes
