/* --- INÍCIO DO ARQUIVO: SERVIDOR PRINCIPAL NODE.JS --- */
// Este arquivo é o "cérebro" do sistema. Ele responde ao navegador
// entregando os arquivos HTML/CSS e criando as "Rotas/API" (Endpoints) 
// onde salvamos e buscamos informações no banco de dados.

const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const db = require('./database'); // Importando a nossa configuração do Banco

const app = express();
const PORT = process.env.PORT || 3000;

// --- INÍCIO: MIDDLEWARES (CONFIGURAÇÕES GERAIS) ---
app.use(cors()); // Permite acessos externos
app.use(express.json()); // Permite entendermos dados que chegam em formato JSON
app.use(express.static(path.join(__dirname, '../frontend'))); // Diz onde ficam as pastas publicas (css, js)
// --- TÉRMINO: MIDDLEWARES ---

// ==========================================
// --- INÍCIO: ROTAS DE PÁGINAS VISUAIS (HTML) ---
// Função: Quando você acessa "/", ele envia o index.html (Login)
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/index.html')));

app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/dashboard.html')));
app.get('/renda', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/renda.html')));
app.get('/gasto', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/gasto.html')));
app.get('/relatorios', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/relatorios.html')));
app.get('/projetos', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/projetos.html')));
app.get('/configuracoes', (req, res) => res.sendFile(path.join(__dirname, '../frontend/html/configuracoes.html')));
// --- TÉRMINO: ROTAS VISUAIS ---


// ==========================================
// --- INÍCIO: ENDPOINTS DA API (BANCO DE DADOS) ---
// Função: As rotas abaixo recebem comunicações em background (Fetch API do JS)
// ==========================================

// -> Login: Verifica email e senha
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Credenciais inválidas" });
        // Se logou com sucesso, retorna o ID do usuário, tema e email
        res.json({ message: "Login com sucesso", user_id: row.id, name: row.name, theme: row.theme, email: row.email });
    });
});

// -> Cadastro: Insere novo usuário no banco
app.post('/api/auth/register', (req, res) => {
    const { name, email, phone, password } = req.body;
    db.run('INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)', [name, email, phone, password], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Usuário criado com sucesso", user_id: this.lastID });
    });
});

// -> Cadastro de Transações (Renda ou Gasto)
app.post('/api/transactions', (req, res) => {
    const { user_id, type, description, amount, category, frequency, payment_day } = req.body;
    const stmt = 'INSERT INTO transactions (user_id, type, description, amount, category, frequency, payment_day) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.run(stmt, [user_id, type, description, amount, category, frequency || null, payment_day || null], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Transação criada", transaction_id: this.lastID });
    });
});

// -> Ler Transações (CRUD: Puxar lista de um usuário específico, filtrando se é Renda ou Gasto)
app.get('/api/transactions/:user_id', (req, res) => {
    const user_id = req.params.user_id;
    const type = req.query.type; 
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    let params = [user_id];
    
    if (type) {
        query += ' AND type = ?';
        params.push(type);
    }
    query += ' ORDER BY id DESC'; // Mostra os cadastros mais recentes primeiro
    
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// -> Deletar Transação (CRUD: Usando ID da transação)
app.delete('/api/transactions/:id', (req, res) => {
    db.run('DELETE FROM transactions WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Transação excluída com sucesso" });
    });
});

// -> Atualizar Transação (CRUD: Editar uma já existente)
app.put('/api/transactions/:id', (req, res) => {
    const { description, amount, category, frequency, payment_day } = req.body;
    const stmt = 'UPDATE transactions SET description = ?, amount = ?, category = ?, frequency = ?, payment_day = ? WHERE id = ?';
    db.run(stmt, [description, amount, category, frequency || null, payment_day || null, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Transação atualizada" });
    });
});

// ==========================================
// --- INÍCIO: ENDPOINTS DE CONFIGURAÇÕES DE USUÁRIO ---
// ==========================================

// -> Buscar dados completos do Usuário
app.get('/api/users/:id', (req, res) => {
    db.get('SELECT id, name, email, currency, language, push_enabled, email_alerts, monthly_report, theme FROM users WHERE id = ?', [req.params.id], (err, row) => {
        if(err) return res.status(500).json({error: "Erro no banco"});
        if(!row) return res.status(404).json({error: "Usuário não encontrado"});
        res.json(row);
    });
});

// -> Atualizar Perfil (Nome, Moeda, Idioma)
app.put('/api/users/:id/profile', (req, res) => {
    const { name, currency, language } = req.body;
    db.run('UPDATE users SET name = ?, currency = ?, language = ? WHERE id = ?', [name, currency, language, req.params.id], function(err) {
        if(err) return res.status(500).json({error: "Falha ao salvar perfil"});
        res.json({message: "Perfil atualizado com sucesso"});
    });
});

// -> Atualizar Senha de Segurança
app.put('/api/users/:id/security', (req, res) => {
    const { current_password, new_password } = req.body;
    db.get('SELECT password FROM users WHERE id = ?', [req.params.id], (err, row) => {
        if(err) return res.status(500).json({error: "Erro no banco"});
        if(!row || row.password !== current_password) return res.status(401).json({error: "Senha atual incorreta"});
        
        db.run('UPDATE users SET password = ? WHERE id = ?', [new_password, req.params.id], function(erru) {
             if(erru) return res.status(500).json({error: "Falha ao atualizar senha"});
             res.json({message: "Senha alterada com sucesso"});
        });
    });
});

// -> Atualizar Configurações/Preferências (Toggles e Tema)
app.put('/api/users/:id/settings', (req, res) => {
    const { push_enabled, email_alerts, monthly_report, theme } = req.body;
    
    // Constrói query dinamicamente, permitindo enviar 1 configuração só
    let fields = [];
    let params = [];
    
    if(push_enabled !== undefined) { fields.push('push_enabled = ?'); params.push(push_enabled ? 1 : 0); }
    if(email_alerts !== undefined) { fields.push('email_alerts = ?'); params.push(email_alerts ? 1 : 0); }
    if(monthly_report !== undefined) { fields.push('monthly_report = ?'); params.push(monthly_report ? 1 : 0); }
    if(theme !== undefined) { fields.push('theme = ?'); params.push(theme); }
    
    if(fields.length === 0) return res.json({message: "Nenhuma modificação requerida"});
    
    params.push(req.params.id);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(query, params, function(err) {
        if(err) return res.status(500).json({error: "Erro ao salvar preferência"});
        res.json({message: "Preferências salvas", theme});
    });
});

// -> Exportar Dados (CSV)
app.get('/api/users/:id/export', (req, res) => {
    db.all('SELECT type, description, amount, category, frequency, payment_day, created_at FROM transactions WHERE user_id = ?', [req.params.id], (err, rows) => {
         if(err) return res.status(500).send("Erro ao processar dados");
         
         let csvContent = "Tipo,Descrição,Valor(R$),Categoria,Frequência,Dia_Vencimento,Data_Criacao\n";
         rows.forEach(r => {
             csvContent += `${r.type},${r.description},${r.amount},${r.category},${r.frequency},${r.payment_day || ''},${r.created_at}\n`;
         });
         
         res.setHeader('Content-Type', 'text/csv; charset=utf-8');
         res.setHeader('Content-Disposition', 'attachment; filename="dados_financas.csv"');
         res.send(csvContent);
    });
});

// -> Apagar Conta Permanentemente
app.delete('/api/users/:id', (req, res) => {
    const uid = req.params.id;
    // Deleção em Cascata (Ordem reversa das tabelas dependentes até users)
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run('DELETE FROM transactions WHERE user_id = ?', [uid]);
        db.run('DELETE FROM projects WHERE user_id = ?', [uid]);
        db.run('DELETE FROM users WHERE id = ?', [uid], function(err) {
            if(err) {
                db.run('ROLLBACK');
                return res.status(500).json({error: "Falha ao apagar conta"});
            }
            db.run('COMMIT');
            res.json({message: "Conta e dados deletados permanentemente."});
        });
    });
});
// --- TÉRMINO: ENDPOINTS CONFIGURAÇÕES ---

// ==========================================
// --- INÍCIO: ENDPOINTS PARA PROJETOS FUTUROS ---
// ==========================================

// -> Criar Novo Projeto
app.post('/api/projects', (req, res) => {
    const { user_id, title, subtitle, target_amount, current_amount, deadline_date } = req.body;
    const stmt = 'INSERT INTO projects (user_id, title, subtitle, target_amount, current_amount, deadline_date) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(stmt, [user_id, title, subtitle || null, target_amount, current_amount || 0, deadline_date], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Projeto criado", project_id: this.lastID });
    });
});

// -> Ler Projetos do Usuário
app.get('/api/projects/:user_id', (req, res) => {
    const user_id = req.params.user_id;
    db.all('SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC', [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// -> Deletar Projeto
app.delete('/api/projects/:id', (req, res) => {
    db.run('DELETE FROM projects WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Projeto excluído" });
    });
});

// -> Atualizar Projeto
app.put('/api/projects/:id', (req, res) => {
    const { title, subtitle, target_amount, current_amount, deadline_date } = req.body;
    const stmt = 'UPDATE projects SET title = ?, subtitle = ?, target_amount = ?, current_amount = ?, deadline_date = ? WHERE id = ?';
    db.run(stmt, [title, subtitle || null, target_amount, current_amount || 0, deadline_date, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Projeto atualizado" });
    });
});
// --- TÉRMINO: ENDPOINTS PROJETOS ---

// -> Dashboard e Relatórios (Integrado nativamente em JS para evitar dor de cabeça de ambiente Python)
app.get('/api/dashboard/:user_id', (req, res) => {
    const user_id = req.params.user_id;
    
    // Buscamos todas as transações do usuário no SQLite
    db.all('SELECT * FROM transactions WHERE user_id = ?', [user_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let total_income = 0.0;
        let total_expenses = 0.0;
        let expenses_by_category = {};
        
        let monthly_data = {
            'Jan': {income: 0, expense: 0}, 'Fev': {income: 0, expense: 0},
            'Mar': {income: 0, expense: 0}, 'Abr': {income: 0, expense: 0},
            'Mai': {income: 0, expense: 0}, 'Jun': {income: 0, expense: 0},
            'Jul': {income: 0, expense: 0}, 'Ago': {income: 0, expense: 0},
            'Set': {income: 0, expense: 0}, 'Out': {income: 0, expense: 0},
            'Nov': {income: 0, expense: 0}, 'Dez': {income: 0, expense: 0},
        };
        
        let weekly_data = { 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0 };
        const days_map = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; // No JS, 0 é Domingo
        const months_list = Object.keys(monthly_data);
        
        rows.forEach(t => {
            const amount = parseFloat(t.amount) || 0;
            const dateStr = t.date || '';
            
            let month_idx = -1;
            let weekday_idx = -1;
            
            if(dateStr) {
                 const date_obj = new Date(dateStr.split(' ')[0] + 'T12:00:00'); // Evita timezone bug
                 if(!isNaN(date_obj.getTime())) {
                     month_idx = date_obj.getMonth();
                     weekday_idx = date_obj.getDay();
                 }
            }
            
            if(t.type === 'income') {
                total_income += amount;
                if(month_idx >= 0) monthly_data[months_list[month_idx]].income += amount;
            } else if(t.type === 'expense') {
                total_expenses += amount;
                const cat = t.category || 'Outros';
                expenses_by_category[cat] = (expenses_by_category[cat] || 0) + amount;
                
                if(month_idx >= 0) monthly_data[months_list[month_idx]].expense += amount;
                if(weekday_idx >= 0) weekly_data[days_map[weekday_idx]] += amount;
            }
        });
        
        const balance = total_income - total_expenses;
        
        const today = new Date();
        // Quantidade de dias no mês atual:
        const days_in_month = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const remaining_days = days_in_month - today.getDate() + 1;
        
        let daily_suggestion = 0.0;
        if(balance > 0 && remaining_days > 0) {
            daily_suggestion = balance / remaining_days;
        }
        
        const current_month = Math.max(1, today.getMonth() + 1);
        const media_renda = total_income / current_month;
        const media_gastos = total_expenses / current_month;
        const media_economia = media_renda - media_gastos;
        
        const analytics = {
            summary: {
                total_income: parseFloat(total_income.toFixed(2)),
                total_expenses: parseFloat(total_expenses.toFixed(2)),
                balance: parseFloat(balance.toFixed(2)),
                daily_suggestion: parseFloat(daily_suggestion.toFixed(2))
            },
            reports: {
                media_renda: parseFloat(media_renda.toFixed(2)),
                media_gastos: parseFloat(media_gastos.toFixed(2)),
                media_economia: parseFloat(media_economia.toFixed(2))
            },
            categories: expenses_by_category,
            monthly: monthly_data,
            weekly: weekly_data
        };
        
        res.json({ transactions: rows, analytics: analytics });
    });
});

// --- TÉRMINO: ENDPOINTS API ---

// Inicia o servidor e fica "escutando" na porta 3000
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
/* --- TÉRMINO DO ARQUIVO --- */
