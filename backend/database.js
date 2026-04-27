/* --- INÍCIO DO ARQUIVO: CONFIGURAÇÃO DO BANCO DE DADOS --- */
// Este arquivo é responsável por conectar ao banco local SQLite
// e criar as tabelas caso elas ainda não existam no primeiro acesso.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define o caminho do arquivo físico do banco de dados na pasta 'data'
const dbPath = path.resolve(__dirname, 'data', 'database.db');

// Inicia a comunicação com o SQLite
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite com sucesso.');
        
        // db.serialize garante que os comandos rodem em ordem sequencial
        db.serialize(() => {
            
            // --- INÍCIO: TABELA DE USUÁRIOS ---
            // Salva dados cadastrais (nome, email, senha e campos extras de configuração)
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password TEXT NOT NULL,
                currency TEXT DEFAULT 'Real (BRL)',
                language TEXT DEFAULT 'Português (BR)',
                push_enabled INTEGER DEFAULT 0,
                email_alerts INTEGER DEFAULT 0,
                monthly_report INTEGER DEFAULT 1,
                theme TEXT DEFAULT 'Claro'
            )`);
            // --- TÉRMINO: TABELA DE USUÁRIOS ---
            
            // --- INÍCIO: TABELA DE TRANSAÇÕES ---
            // Registra todas as rendas e gastos do usuário
            db.run(`CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                type TEXT NOT NULL, -- 'income' (renda) ou 'expense' (gasto)
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                frequency TEXT,
                date DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);
            // --- TÉRMINO: TABELA DE TRANSAÇÕES ---
            
            // Corrige a tabela se estiver em uma versão antiga para suportar o Dia do Pagamento
            db.run(`ALTER TABLE transactions ADD COLUMN payment_day INTEGER`, (err) => { /* Ignora se já existir */ });

            // --- INÍCIO: TABELA DE METAS (ECONOMIZAR) ---
            // Guarda as informações das metas traçadas na tela "Economizar"
            db.run(`CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                target_amount REAL NOT NULL,
                current_amount REAL DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);
            // --- TÉRMINO: TABELA DE METAS ---

            // --- INÍCIO: TABELA DE PROJETOS FUTUROS ---
            // Guarda os planos de longo prazo como viagens ou compras grandes
            db.run(`CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT,
                target_amount REAL NOT NULL,
                current_amount REAL DEFAULT 0,
                deadline_date TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);
            // --- TÉRMINO: TABELA DE PROJETOS FUTUROS ---

        });
    }
});

// Exporta o banco para ser usado pelo server.js
module.exports = db;
/* --- TÉRMINO DO ARQUIVO --- */
