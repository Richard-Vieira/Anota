import { useState, useEffect } from 'react'
import { api, formataDinheiro, pegaIniciais } from '../api.js'
import { mascaraCPF, mascaraCNPJ, mascaraDocumento, mascaraTelefone, municipioUF, soNumeros } from '../formatos.js'
import CamposEndereco from '../components/CamposEndereco.jsx'

const vazio = {
  tipo: 'PF', nome: '', documento: '', email: '', telefone: '',
  cep: '', endereco: '', numero: '', bairro: '', municipio: '', uf: '', codigo_ibge: ''
}

function Clientes() {
  const [lista, setLista] = useState([])
  const [form, setForm] = useState(vazio)
  const [editando, setEditando] = useState(null) // id do cliente que ta editando
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [busca, setBusca] = useState('')
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  async function carregar() {
    // a api ja manda quantas notas e o total de cada cliente
    const r = await api('/clientes')
    if (r.ok) {
      setLista(r.dados)
    } else {
      setErro(r.dados.erro)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const pj = form.tipo == 'PJ'

  function campo(nome, valor) {
    setForm({ ...form, [nome]: valor })
  }

  function trocaTipo(tipo) {
    // trocou o tipo, o documento antigo nao serve mais
    setForm({ ...form, tipo: tipo, documento: '' })
  }

  function limpar() {
    setForm(vazio)
    setEditando(null)
  }

  // pessoa juridica: busca o nome e o endereco na BrasilAPI (pelo backend)
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
    // usa o form mais novo (a pessoa pode ter digitado algo enquanto buscava)
    setForm(form => ({
      ...form,
      nome: c.nome || form.nome,
      email: form.email || c.email,
      telefone: form.telefone || c.telefone,
      cep: c.cep || form.cep,
      endereco: c.endereco || form.endereco,
      numero: c.numero || form.numero,
      bairro: c.bairro || form.bairro,
      municipio: c.municipio || form.municipio,
      uf: c.uf || form.uf,
      codigo_ibge: c.codigo_ibge || form.codigo_ibge
    }))
    setMsg('Dados da Receita preenchidos' + (c.situacao ? ' (situação: ' + c.situacao.toLowerCase() + ')' : '') + '. Confira e salve.')
  }

  function digitouDocumento(valor) {
    const doc = soNumeros(valor).substring(0, pj ? 14 : 11)
    const completou = pj && doc.length == 14 && soNumeros(form.documento).length != 14
    campo('documento', doc)
    if (completou) buscarCnpj(doc)
  }

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    setMsg('')

    // a validacao de verdade ta no backend, aqui so ve se ta vazio
    if (form.nome.trim() == '' || form.documento == '') {
      setErro('Preencha o nome e o ' + (form.tipo == 'PF' ? 'CPF' : 'CNPJ'))
      return
    }

    let url = '/clientes'
    let metodo = 'POST'
    if (editando) {
      url = '/clientes/' + editando
      metodo = 'PUT'
    }

    // o usuario_id nao vai, a api pega pelo token
    const r = await api(url, { method: metodo, body: form })
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
    // troca null por '' pros inputs nao reclamarem
    const f = {}
    for (const k in vazio) f[k] = cli[k] == null ? '' : cli[k]
    f.tipo = cli.tipo || (String(cli.documento).length == 14 ? 'PJ' : 'PF')
    setForm(f)
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
      if (editando == id) limpar()
      carregar()
    }
  }

  const b = busca.trim().toLowerCase()
  const bNum = soNumeros(b)
  const filtrados = lista.filter(c =>
    c.nome.toLowerCase().includes(b) ||
    (bNum != '' && String(c.documento).includes(bNum)) ||
    String(c.municipio || '').toLowerCase().includes(b)
  )

  return (
    <div className="duas-colunas lista-e-form">
      <div>
        <h1>Clientes</h1>
        <input className="busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ ou cidade" />

        {filtrados.length == 0 && (
          <p className="lista-vazia">{lista.length == 0 ? 'Nenhum cliente cadastrado ainda' : 'Nenhum cliente encontrado'}</p>
        )}
        {filtrados.map(c => (
          <div className={'lista-linha' + (editando == c.id ? ' selecionada' : '')} key={c.id}>
            <span className="iniciais">{pegaIniciais(c.nome)}</span>
            <div className="lista-info">
              <div className="lista-nome">
                {c.nome}
                <span className="codigo">{c.tipo == 'PJ' ? 'PJ' : 'PF'}</span>
              </div>
              <div className="lista-doc">
                {mascaraDocumento(c.documento)}
                {c.municipio ? ' · ' + municipioUF(c.municipio, c.uf) : ''}
                {c.email ? ' · ' + c.email : ''}
              </div>
            </div>
            <div className="lista-numeros">
              <strong>{formataDinheiro(c.total_notas)}</strong>
              {c.qtd_notas} {c.qtd_notas == 1 ? 'nota' : 'notas'}
            </div>
            <div className="lista-acoes">
              <button className="pequeno" onClick={() => editar(c)}>Editar</button>
              <button className="pequeno perigo" onClick={() => excluir(c.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>

      <form className="painel painel-fixo" onSubmit={salvar}>
        <h2>{editando ? 'Editar cliente' : 'Novo cliente'}</h2>

        <div className="seletor-tipo">
          <button type="button" className={!pj ? 'ativo' : ''} onClick={() => trocaTipo('PF')}>Pessoa física</button>
          <button type="button" className={pj ? 'ativo' : ''} onClick={() => trocaTipo('PJ')}>Pessoa jurídica</button>
        </div>

        <label>{pj ? 'CNPJ' : 'CPF'}</label>
        <div className="grade-campos">
          <div className="campo-largo">
            <input
              value={pj ? mascaraCNPJ(form.documento) : mascaraCPF(form.documento)}
              onChange={e => digitouDocumento(e.target.value)}
              placeholder={pj ? '00.000.000/0000-00' : '000.000.000-00'}
              inputMode="numeric"
            />
          </div>
          {pj && (
            <div className="campo-botao">
              <button type="button" className="secundario" onClick={() => buscarCnpj(form.documento)} disabled={buscandoCnpj}>
                {buscandoCnpj ? 'Buscando...' : 'Buscar de novo'}
              </button>
            </div>
          )}
        </div>

        <label>{pj ? 'Razão social' : 'Nome'}</label>
        <input value={form.nome} onChange={e => campo('nome', e.target.value)} />

        <div className="grade-campos">
          <div className="campo-metade">
            <label>E-mail</label>
            <input type="email" value={form.email} onChange={e => campo('email', e.target.value)} />
          </div>
          <div className="campo-metade">
            <label>Telefone</label>
            <input value={mascaraTelefone(form.telefone)} onChange={e => campo('telefone', mascaraTelefone(e.target.value))} placeholder="(00) 00000-0000" />
          </div>
        </div>

        <CamposEndereco dados={form} muda={novo => setForm(novo)} />

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
