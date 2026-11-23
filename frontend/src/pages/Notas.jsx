import { useState, useEffect } from 'react'
import { API } from '../config.js'

const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formataDinheiro(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "2026-06-05" -> "05/06/2026"
function formataData(d) {
  if (!d) return ''
  const p = d.split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

function Notas() {
  const usuario = JSON.parse(localStorage.getItem('usuario'))
  const [notas, setNotas] = useState([])
  const [fat, setFat] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch(API + '/notas?usuario_id=' + usuario.id)
      .then(r => r.json())
      .then(dados => {
        console.log(dados)
        setNotas(dados)
      })
      .catch(() => setErro('Erro ao carregar as notas'))

    fetch(API + '/faturamento?usuario_id=' + usuario.id + '&ano=' + new Date().getFullYear())
      .then(r => r.json())
      .then(dados => setFat(dados))
  }, [])

  return (
    <div>
      <h2>Notas</h2>

      {fat && (
        <div className="card total">
          <div>
            <small>Total faturado em {fat.ano}</small>
            <div className="valor-grande">{formataDinheiro(fat.total)}</div>
            <small style={{ color: '#888' }}>
              {((fat.total / fat.limite_mei) * 100).toFixed(1)}% do limite do MEI ({formataDinheiro(fat.limite_mei)})
            </small>
          </div>
          <div className="meses">
            {fat.meses.filter(m => m.total > 0).map(m => (
              <div key={m.mes}>
                <small>{nomesMeses[m.mes - 1]}</small>
                <div>{formataDinheiro(m.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {erro && <p className="erro">{erro}</p>}

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Data</th>
            <th>Cliente</th>
            <th>Serviço</th>
            <th>Descrição</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {notas.length == 0 && (
            <tr><td colSpan="7">Nenhuma nota ainda</td></tr>
          )}
          {notas.map(n => (
            <tr key={n.id}>
              <td>{n.id}</td>
              <td>{formataData(n.data_emissao)}</td>
              <td>{n.cliente_nome}</td>
              <td>{n.servico_descricao}</td>
              <td>{n.descricao}</td>
              <td>{formataDinheiro(n.valor)}</td>
              <td><span className={'status ' + n.status}>{n.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default Notas
