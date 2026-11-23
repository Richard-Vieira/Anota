import { useState, useEffect } from 'react'
import { API } from '../config.js'

function Clientes() {
  const usuario = JSON.parse(localStorage.getItem('usuario'))
  const [lista, setLista] = useState([])
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [editando, setEditando] = useState(null) // id do cliente que ta editando
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  function carregar() {
    fetch(API + '/clientes?usuario_id=' + usuario.id)
      .then(r => r.json())
      .then(dados => setLista(dados))
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

    let url = API + '/clientes'
    let metodo = 'POST'
    if (editando) {
      url = API + '/clientes/' + editando
      metodo = 'PUT'
    }

    try {
      const resp = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id, nome, documento, email, telefone })
      })
      const dados = await resp.json()
      if (!resp.ok) {
        setErro(dados.erro)
        return
      }
      setMsg(editando ? 'Cliente atualizado' : 'Cliente cadastrado')
      limpar()
      carregar()
    } catch (err) {
      setErro('Erro ao conectar no servidor')
    }
  }

  function editar(cli) {
    setEditando(cli.id)
    setNome(cli.nome)
    setDocumento(cli.documento)
    setEmail(cli.email || '')
    setTelefone(cli.telefone || '')
  }

  async function excluir(id) {
    if (!confirm('Excluir esse cliente?')) return
    setErro('')
    setMsg('')
    const resp = await fetch(API + '/clientes/' + id + '?usuario_id=' + usuario.id, { method: 'DELETE' })
    const dados = await resp.json()
    if (!resp.ok) {
      setErro(dados.erro)
    } else {
      setMsg('Cliente excluído')
      carregar()
    }
  }

  return (
    <div>
      <h2>Clientes</h2>

      <form className="card" onSubmit={salvar}>
        <h3 style={{ marginTop: 0 }}>{editando ? 'Editar cliente' : 'Novo cliente'}</h3>
        <label>Nome</label>
        <input value={nome} onChange={e => setNome(e.target.value)} />

        <label>CPF ou CNPJ</label>
        <input value={documento} onChange={e => setDocumento(e.target.value)} placeholder="só números ou com pontuação" />

        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} />

        <label>Telefone</label>
        <input value={telefone} onChange={e => setTelefone(e.target.value)} />

        <button type="submit">Salvar</button>
        {editando && (
          <button type="button" className="secundario" onClick={limpar} style={{ marginLeft: 8 }}>Cancelar</button>
        )}
      </form>

      {erro && <p className="erro">{erro}</p>}
      {msg && <p className="sucesso">{msg}</p>}

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>CPF/CNPJ</th>
            <th>Email</th>
            <th>Telefone</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lista.map(c => (
            <tr key={c.id}>
              <td>{c.nome}</td>
              <td>{c.documento}</td>
              <td>{c.email}</td>
              <td>{c.telefone}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="pequeno" onClick={() => editar(c)}>Editar</button>
                <button className="pequeno perigo" onClick={() => excluir(c.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Clientes
