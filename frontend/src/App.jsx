import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Cadastro from './pages/Cadastro.jsx'
import NovaNota from './pages/NovaNota.jsx'
import Notas from './pages/Notas.jsx'
import Clientes from './pages/Clientes.jsx'
import Servicos from './pages/Servicos.jsx'
import { pegaUsuario, pegaToken, tokenVencido, sair, pegaIniciais } from './api.js'

function App() {
  // pega o usuario e o token que foram salvos no login
  let usuario = pegaUsuario()
  const token = pegaToken()

  // se o token ja venceu limpa tudo e manda pro login
  if (usuario && (!token || tokenVencido(token))) {
    localStorage.removeItem('usuario')
    localStorage.removeItem('token')
    usuario = null
  }

  // se nao ta logado so deixa ver o login e o cadastro
  if (!usuario) {
    return (
      <Routes>
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <div>
      <header className="menu">
        <span className="marca">ANota</span>
        <nav>
          <NavLink to="/nova-nota">Nova nota</NavLink>
          <NavLink to="/notas">Notas</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/servicos">Serviços</NavLink>
        </nav>
        <div className="usuario-menu">
          <span className="nome-usuario">{usuario.nome}</span>
          <span className="iniciais">{pegaIniciais(usuario.nome)}</span>
          <a href="#" onClick={(e) => { e.preventDefault(); sair() }}>Sair</a>
        </div>
      </header>

      <main className="conteudo">
        <Routes>
          <Route path="/nova-nota" element={<NovaNota />} />
          <Route path="/notas" element={<Notas />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/servicos" element={<Servicos />} />
          <Route path="*" element={<Navigate to="/nova-nota" />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
