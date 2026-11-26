import { API } from './config.js'

// pega o usuario e o token que foram salvos no login
export function pegaUsuario() {
  return JSON.parse(localStorage.getItem('usuario'))
}

export function pegaToken() {
  return localStorage.getItem('token')
}

export function sair(expirou) {
  localStorage.removeItem('usuario')
  localStorage.removeItem('token')
  // recarrega a pagina pro App ver que saiu (com navigate o menu nao atualizava)
  window.location.href = expirou ? '/login?expirou=1' : '/login'
}

// o token JWT tem 3 partes separadas por ponto, a do meio tem a data que vence (exp)
export function tokenVencido(token) {
  try {
    const dados = JSON.parse(atob(token.split('.')[1]))
    return dados.exp * 1000 < Date.now()
  } catch (e) {
    return true
  }
}

// ajustado com IA para melhorar o codigo
// todas as telas chamam a api por aqui:
// - ja coloca o token no header Authorization
// - se a api responder 401 (token vencido ou invalido) volta pro login
// - devolve { ok, dados } pra nao repetir o resp.json() em todo lugar
export async function api(caminho, opcoes = {}) {
  const headers = { Authorization: 'Bearer ' + pegaToken() }
  let body = undefined
  if (opcoes.body) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opcoes.body)
  }

  let resp
  try {
    resp = await fetch(API + caminho, { method: opcoes.method || 'GET', headers, body })
  } catch (e) {
    return { ok: false, dados: { erro: 'Não foi possível conectar no servidor' } }
  }

  if (resp.status == 401) {
    sair(true)
    return { ok: false, dados: { erro: 'Sua sessão expirou' } }
  }

  const dados = await resp.json()
  return { ok: resp.ok, dados }
}

// pra baixar o PDF (nao da pra usar link normal pq precisa mandar o token)
export async function baixarArquivo(caminho, nomeArquivo) {
  let resp
  try {
    resp = await fetch(API + caminho, { headers: { Authorization: 'Bearer ' + pegaToken() } })
  } catch (e) {
    return 'Não foi possível conectar no servidor'
  }
  if (resp.status == 401) {
    sair(true)
    return 'Sua sessão expirou'
  }
  if (!resp.ok) {
    const dados = await resp.json()
    return dados.erro
  }
  const arquivo = await resp.blob()
  const url = URL.createObjectURL(arquivo)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
  return null // null = deu certo
}

export function formataDinheiro(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// "Joana Silva" -> "JS" (pro circulo do menu e das listas)
export function pegaIniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/)
  if (partes[0] == '') return '?'
  let ini = partes[0][0]
  if (partes.length > 1) ini += partes[partes.length - 1][0]
  return ini.toUpperCase()
}
