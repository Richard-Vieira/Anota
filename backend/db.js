// conexao com o postgres
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// testa a conexao quando sobe
pool.query('SELECT NOW()')
  .then(() => console.log('conectou no banco'))
  .catch(err => console.log('erro ao conectar no banco:', err.message));

module.exports = pool;
