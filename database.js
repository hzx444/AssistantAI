const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite");

// Cria a tabela de usuários
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      plano TEXT NOT NULL,
      dataPagamento TEXT NOT NULL,
      validoAte TEXT NOT NULL
    )
  `);
});

module.exports = db;
