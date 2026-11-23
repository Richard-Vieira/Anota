import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import Login from './pages/Login.jsx'
import NovaNota from './pages/NovaNota.jsx'
import Notas from './pages/Notas.jsx'
import Clientes from './pages/Clientes.jsx'
import Servicos from './pages/Servicos.jsx'

function App() {
  // pega o usuario que foi salvo no login
  const usuario = JSON.parse(localStorage.getItem('usuario'))

  function sair() {
    localStorage.removeItem('usuario')
    // navigate('/login') // assim nao atualizava o menu
    window.location.href = '/login'
  }

  // se nao ta logado so deixa ver o login
  if (!usuario) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <div>
      <header className="menu">
        <span className="logo">ANota</span>
        <nav>
          <NavLink to="/nova-nota">Nova nota</NavLink>
          <NavLink to="/notas">Notas</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/servicos">Serviços</NavLink>
        </nav>
        <span style={{ marginLeft: 'auto', fontSize: 14 }}>
          {usuario.nome} | <a href="#" onClick={sair}>Sair</a>
        </span>
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
