# --- INÍCIO DO ARQUIVO: SERVIDOR PRINCIPAL FLASK (app.py) ---
import os
import sqlite3
import json
import uuid
import smtplib
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
from analytics.analyzer import calculate_analytics # Import nativo das métricas!

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'backend', 'data', 'database.db')
FRONTEND_PATH = os.path.join(os.path.dirname(__file__), 'frontend')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    # Tabela de Usuários (agora com is_verified e verification_token)
    c.execute('''CREATE TABLE IF NOT EXISTS users (
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
        theme TEXT DEFAULT 'Claro',
        is_verified INTEGER DEFAULT 0,
        verification_token TEXT
    )''')
    
    # Migração segura para usuários antigos (adicionar campos se faltar)
    try: c.execute('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0')
    except: pass
    try: c.execute('ALTER TABLE users ADD COLUMN verification_token TEXT')
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'Real (BRL)'")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'Português (BR)'")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN push_enabled INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN email_alerts INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN monthly_report INTEGER DEFAULT 1")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'Claro'")
    except: pass

    # Tabela de Transações
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        frequency TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        payment_day INTEGER,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )''')
    try: c.execute('ALTER TABLE transactions ADD COLUMN payment_day INTEGER')
    except: pass

    # Tabela de Projetos
    c.execute('''CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        target_amount REAL NOT NULL,
        current_amount REAL DEFAULT 0,
        deadline_date TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )''')
    
    conn.commit()
    conn.close()

init_db()

# --- FUNÇÃO DE ENVIO DE E-MAIL ---
def send_verification_email(user_email, token):
    link = f"http://localhost:5000/api/auth/verify/{token}"
    msg = MIMEText(f"Olá!\n\nObrigado por se juntar ao FinançasFácil. Para ativar sua conta e entrar no sistema, por favor clique no link abaixo:\n\n{link}\n\nAbraço,\nEquipe FinançasFácil")
    msg['Subject'] = 'FinançasFácil - Verifique seu e-mail'
    msg['From'] = 'dayvidvini7@gmail.com'
    msg['To'] = user_email

    print("\n" + "="*50)
    print(f"[SIMULAÇÃO DE EMAIL] Para: {user_email}\nLink de Validação: {link}")
    print("="*50 + "\n")
    
    # IMPORTANTE: Para o envio real via Gmail, você precisará da "Senha de App" gerada no painel do Google.
    # Descomente o bloco abaixo e troque 'SUA_SENHA_AQUI' quando for fazer deploy.
    '''
    try:
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login('dayvidvini7@gmail.com', 'SUA_SENHA_AQUI')
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print("Erro ao enviar email real:", e)
    '''

# =========================================================
# ROTAS VISUAIS (SERVIDAS PELO FLASK)
# =========================================================

@app.route('/css/<path:filename>')
def serve_css(filename): return send_from_directory(os.path.join(FRONTEND_PATH, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename): return send_from_directory(os.path.join(FRONTEND_PATH, 'js'), filename)

@app.route('/images/<path:filename>')
def serve_images(filename): return send_from_directory(os.path.join(FRONTEND_PATH, 'images'), filename)

@app.route('/')
def home(): return send_from_directory(os.path.join(FRONTEND_PATH, 'html'), 'index.html')

@app.route('/<page>')
def serve_page(page):
    valid_pages = ['dashboard', 'renda', 'gasto', 'relatorios', 'projetos', 'configuracoes']
    if page in valid_pages:
        return send_from_directory(os.path.join(FRONTEND_PATH, 'html'), f'{page}.html')
    return "404 - Not Found", 404

# =========================================================
# ENDPOINTS DA API (AUTH, TRANSACTIONS, USERS, PROJECTS)
# =========================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    phone = data.get('phone')
    password = data.get('password')
    
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (name, email, phone, password, is_verified, verification_token) VALUES (?, ?, ?, ?, ?, ?)',
                  (name, email, phone, password, 1, None))
        conn.commit()
        user_id = c.lastrowid
        
        return jsonify({"message": "Usuário criado com sucesso! Pode acessar a conta.", "user_id": user_id})
    except sqlite3.IntegrityError:
        return jsonify({"error": "E-mail já cadastrado"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/auth/verify/<token>', methods=['GET'])
def verify_email(token):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT id FROM users WHERE verification_token = ? AND is_verified = 0', (token,))
    user = c.fetchone()
    
    if user:
        c.execute('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', (user['id'],))
        conn.commit()
        conn.close()
        # Após verificar, pode redirecionar o usuário para a tela de login
        return f"<h1>Email verificado com sucesso!</h1><p><a href='/'>Clique aqui para fazer Login</a></p>"
    else:
        conn.close()
        return "<h1>Link inválido ou conta já verificada.</h1>"

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE email = ? AND password = ?', (email, password))
    user = c.fetchone()
    conn.close()
    
    if not user:
        return jsonify({"error": "Credenciais inválidas"}), 401
        
    # Validação de e-mail desativada
        
    return jsonify({
        "message": "Login com sucesso", 
        "user_id": user['id'], 
        "name": user['name'], 
        "theme": user['theme'], 
        "email": user['email']
    })

@app.route('/api/transactions', methods=['POST'])
def create_transaction():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    try:
        c.execute('''INSERT INTO transactions (user_id, type, description, amount, category, frequency, payment_day) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)''',
                  (data.get('user_id'), data.get('type'), data.get('description'), data.get('amount'), 
                   data.get('category'), data.get('frequency'), data.get('payment_day')))
        conn.commit()
        return jsonify({"message": "Transação criada", "transaction_id": c.lastrowid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/transactions/<int:user_id>', methods=['GET'])
def get_transactions(user_id):
    type_filter = request.args.get('type')
    conn = get_db()
    c = conn.cursor()
    
    query = 'SELECT * FROM transactions WHERE user_id = ?'
    params = [user_id]
    
    if type_filter:
        query += ' AND type = ?'
        params.append(type_filter)
        
    query += ' ORDER BY id DESC'
    c.execute(query, params)
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/transactions/<int:id>', methods=['PUT', 'DELETE'])
def update_or_delete_transaction(id):
    conn = get_db()
    c = conn.cursor()
    if request.method == 'DELETE':
        c.execute('DELETE FROM transactions WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Transação excluída com sucesso"})
    elif request.method == 'PUT':
        data = request.json
        c.execute('''UPDATE transactions SET description = ?, amount = ?, category = ?, frequency = ?, payment_day = ? 
                     WHERE id = ?''',
                  (data.get('description'), data.get('amount'), data.get('category'), data.get('frequency'), data.get('payment_day'), id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Transação atualizada"})

# --- USERS ---
@app.route('/api/users/<int:id>', methods=['GET', 'DELETE'])
def user_operations(id):
    conn = get_db()
    c = conn.cursor()
    if request.method == 'GET':
        c.execute('SELECT id, name, email, currency, language, push_enabled, email_alerts, monthly_report, theme FROM users WHERE id = ?', (id,))
        user = c.fetchone()
        conn.close()
        if not user: return jsonify({"error": "Usuário não encontrado"}), 404
        return jsonify(dict(user))
    
    elif request.method == 'DELETE':
        try:
            c.execute('DELETE FROM transactions WHERE user_id = ?', (id,))
            c.execute('DELETE FROM projects WHERE user_id = ?', (id,))
            c.execute('DELETE FROM users WHERE id = ?', (id,))
            conn.commit()
            return jsonify({"message": "Conta deletada"})
        except Exception as e:
            conn.rollback()
            return jsonify({"error": "Falha ao apagar conta"}), 500
        finally:
            conn.close()

@app.route('/api/users/<int:id>/profile', methods=['PUT'])
def update_profile(id):
    conn = get_db()
    data = request.json
    conn.execute('UPDATE users SET name = ?, currency = ?, language = ? WHERE id = ?',
                 (data.get('name'), data.get('currency'), data.get('language'), id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Perfil atualizado"})

@app.route('/api/users/<int:id>/security', methods=['PUT'])
def update_security(id):
    conn = get_db()
    c = conn.cursor()
    data = request.json
    c.execute('SELECT password FROM users WHERE id = ?', (id,))
    row = c.fetchone()
    if not row or row['password'] != data.get('current_password'):
        conn.close()
        return jsonify({"error": "Senha atual incorreta"}), 401
        
    c.execute('UPDATE users SET password = ? WHERE id = ?', (data.get('new_password'), id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Senha alterada"})

@app.route('/api/users/<int:id>/settings', methods=['PUT'])
def update_settings(id):
    data = request.json
    fields = []
    params = []
    
    if 'push_enabled' in data: fields.append('push_enabled = ?'); params.append(1 if data['push_enabled'] else 0)
    if 'email_alerts' in data: fields.append('email_alerts = ?'); params.append(1 if data['email_alerts'] else 0)
    if 'monthly_report' in data: fields.append('monthly_report = ?'); params.append(1 if data['monthly_report'] else 0)
    if 'theme' in data: fields.append('theme = ?'); params.append(data['theme'])
    
    if not fields: return jsonify({"message": "Sem alterações"})
    
    params.append(id)
    conn = get_db()
    conn.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    
    # ATIVAÇÃO DAS CONFIGURAÇÕES: Caso tenham ativado Alertas e Relatório, avisar o log (integração futura)
    if 'email_alerts' in data and data['email_alerts']:
        print("[SISTEMA] Alertas por e-mail ativados para o User ID:", id)
    if 'monthly_report' in data and data['monthly_report']:
        print("[SISTEMA] Relatório mensal ativado para o User ID:", id)
        
    return jsonify({"message": "Preferências salvas"})

@app.route('/api/users/<int:id>/export', methods=['GET'])
def export_csv(id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT type, description, amount, category, frequency, payment_day, date FROM transactions WHERE user_id = ?', (id,))
    rows = c.fetchall()
    conn.close()
    
    csv_content = "Tipo,Descrição,Valor(R$),Categoria,Frequência,Dia_Vencimento,Data_Transacao\n"
    for r in rows:
        csv_content += f"{r['type']},{r['description']},{r['amount']},{r['category']},{r['frequency']},{r['payment_day'] or ''},{r['date']}\n"
        
    from flask import Response
    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-disposition": "attachment; filename=dados_financas.csv"}
    )

# --- PROJECTS ---
@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO projects (user_id, title, subtitle, target_amount, current_amount, deadline_date) 
                 VALUES (?, ?, ?, ?, ?, ?)''',
              (data.get('user_id'), data.get('title'), data.get('subtitle'), data.get('target_amount'), data.get('current_amount', 0), data.get('deadline_date')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Projeto criado", "project_id": c.lastrowid})

@app.route('/api/projects/<int:user_id>', methods=['GET'])
def get_projects(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC', (user_id,))
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/projects/<int:id>', methods=['PUT', 'DELETE'])
def update_or_delete_project(id):
    conn = get_db()
    c = conn.cursor()
    if request.method == 'DELETE':
        c.execute('DELETE FROM projects WHERE id = ?', (id,))
    else:
        data = request.json
        c.execute('''UPDATE projects SET title = ?, subtitle = ?, target_amount = ?, current_amount = ?, deadline_date = ? 
                     WHERE id = ?''',
                  (data.get('title'), data.get('subtitle'), data.get('target_amount'), data.get('current_amount'), data.get('deadline_date'), id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Sucesso"})

# --- DASHBOARD & ANALYTICS INTEGRAÇÃO ---
@app.route('/api/dashboard/<int:user_id>', methods=['GET'])
def dashboard(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT * FROM transactions WHERE user_id = ?', (user_id,))
    # Precisamos converter para a lógica que o calculate_analytics aceita (uma lista de dicionários)
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    
    # IMPORTAÇÃO NATIVA DO SEU CÓDIGO PYTHON (em vez de rodar background process child_process!)
    try:
        analytics_result = calculate_analytics(rows)
        return jsonify({"transactions": rows, "analytics": analytics_result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("Iniciando servidor Flask de desenvolvimento na porta 5000...")
    app.run(host='0.0.0.0', port=5000, debug=True)
# --- TÉRMINO DO ARQUIVO ---
