# --- SERVIDOR PRINCIPAL FLASK (app.py) ---
import os
import sqlite3
import datetime
import jwt
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import csv
import io
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import xml.etree.ElementTree as ET
import urllib.request
import re


try:
    from ofxparse import OfxParser
except ImportError:
    pass # Falta ofxparse

# IMPORTANTE: garantir que a pasta analytics funcione como módulo
from analytics.analyzer import calculate_analytics

app = Flask(__name__)
CORS(app)

app.config['SECRET_KEY'] = 'uma_chave_super_secreta_ff' # Ideal em variavel de ambiente

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'backend', 'data', 'database.db')
FRONTEND_PATH = os.path.join(BASE_DIR, 'frontend')

# ==========================================
# INÍCIO: BANCO DE DADOS
# ==========================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()

    # Tabela Users com mais colunas
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        phone TEXT,
        currency TEXT DEFAULT 'BRL',
        language TEXT DEFAULT 'PT-BR',
        is_verified INTEGER DEFAULT 0,
        push_enabled INTEGER DEFAULT 0,
        email_alerts INTEGER DEFAULT 0,
        monthly_report INTEGER DEFAULT 0,
        theme TEXT DEFAULT 'Claro'
    )''')
    
    # Try adding columns to users if they already exist
    try: c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN currency TEXT DEFAULT 'BRL'")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'PT-BR'")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN push_enabled INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN email_alerts INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN monthly_report INTEGER DEFAULT 0")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'Claro'")
    except: pass
    try: c.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0")
    except: pass

    # Tabela Transactions com frequency e payment_day
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        description TEXT,
        amount REAL,
        category TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        frequency TEXT DEFAULT 'Única',
        payment_day TEXT
    )''')
    
    try: c.execute("ALTER TABLE transactions ADD COLUMN frequency TEXT DEFAULT 'Única'")
    except: pass
    try: c.execute("ALTER TABLE transactions ADD COLUMN payment_day TEXT")
    except: pass

    # Tabela Projects
    c.execute('''CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        subtitle TEXT,
        target_amount REAL,
        current_amount REAL,
        deadline_date TEXT
    )''')

    # Tabela Budgets (Orçamentos)
    c.execute('''CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        category TEXT,
        limit_amount REAL,
        UNIQUE(user_id, category)
    )''')

    # Novas tabelas para Expansão
    c.execute('''CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        type TEXT,
        balance REAL DEFAULT 0,
        color TEXT DEFAULT '#4f46e5'
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS credit_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        limit_amount REAL DEFAULT 0,
        closing_day INTEGER,
        due_day INTEGER,
        color TEXT DEFAULT '#e11d48'
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        type TEXT,
        color TEXT DEFAULT '#10b981',
        icon TEXT DEFAULT 'fas fa-tag'
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        asset_name TEXT,
        ticker TEXT,
        quantity REAL DEFAULT 0,
        average_price REAL DEFAULT 0,
        current_price REAL DEFAULT 0,
        date_bought DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS shared_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER,
        guest_email TEXT,
        status TEXT DEFAULT 'pending'
    )''')

    # Alterar transactions para adicionar chaves estrangeiras
    try: c.execute("ALTER TABLE transactions ADD COLUMN account_id INTEGER")
    except: pass
    try: c.execute("ALTER TABLE transactions ADD COLUMN credit_card_id INTEGER")
    except: pass
    try: c.execute("ALTER TABLE transactions ADD COLUMN category_id INTEGER")
    except: pass
    try: c.execute("ALTER TABLE transactions ADD COLUMN pdf_url TEXT")
    except: pass

    # Alterar accounts e credit_cards para novos campos
    try: c.execute("ALTER TABLE accounts ADD COLUMN color TEXT DEFAULT '#4f46e5'")
    except: pass
    try: c.execute("ALTER TABLE credit_cards ADD COLUMN color TEXT DEFAULT '#e11d48'")
    except: pass

    conn.commit()
    conn.close()

init_db()
# ==========================================
# TÉRMINO: BANCO DE DADOS
# ==========================================


# ==========================================
# INÍCIO: FUNÇÕES DE SEGURANÇA E JWT
# ==========================================
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'error': 'Token ausente. Faça login novamente.'}), 401
        
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user_id = data['user_id']
        except Exception as e:
            return jsonify({'error': 'Token inválido ou expirado.'}), 401
            
        return f(current_user_id, *args, **kwargs)
    return decorated
# ==========================================
# TÉRMINO: FUNÇÕES DE SEGURANÇA E JWT
# ==========================================



# ==========================================
# INÍCIO: CONFIGURAÇÃO DE E-MAIL
# ==========================================
EMAIL_SENDER = 'financa.ff.facil@gmail.com'
EMAIL_PASSWORD = os.getenv('EMAIL_APP_PASSWORD', 'aucfcntgmsodmmut') # Remova os espacos

def send_email(to_email, subject, body):
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_SENDER
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_SENDER, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f'Erro ao enviar email: {e}')
        return False
# ==========================================
# TÉRMINO: CONFIGURAÇÃO DE E-MAIL
# ==========================================

# ==========================================
# INÍCIO: ROTAS DE FRONTEND E PWA
# ==========================================
@app.route('/')
def home():
    return send_from_directory(os.path.join(FRONTEND_PATH, 'html'), 'index.html')

@app.route('/<page>')
def pages(page):
    return send_from_directory(os.path.join(FRONTEND_PATH, 'html'), f"{page}.html")

@app.route('/css/<path:filename>')
def css(filename):
    return send_from_directory(os.path.join(FRONTEND_PATH, 'css'), filename)

@app.route('/js/<path:filename>')
def js(filename):
    return send_from_directory(os.path.join(FRONTEND_PATH, 'js'), filename)

@app.route('/uploads/<path:filename>')
def uploads(filename):
    return send_from_directory(os.path.join(FRONTEND_PATH, 'uploads'), filename)

@app.route('/manifest.json')
def manifest():
    return send_from_directory(FRONTEND_PATH, 'manifest.json')

@app.route('/cartoes')
def page_cartoes():
    return send_from_directory('frontend/html', 'cartoes.html')

@app.route('/categorias')
def page_categorias():
    return send_from_directory('frontend/html', 'categorias.html')

@app.route('/orcamentos')
def page_orcamentos():
    return send_from_directory(os.path.join(FRONTEND_PATH, 'html'), 'orcamentos.html')

@app.route('/sw.js')
def sw():
    return send_from_directory(FRONTEND_PATH, 'sw.js')
# ==========================================
# TÉRMINO: ROTAS DE FRONTEND E PWA
# ==========================================


# ==========================================
# INÍCIO: ABA DE AUTENTICAÇÃO (LOGIN/REGISTRO)
# ==========================================
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    hashed_pw = generate_password_hash(data['password'], method='pbkdf2:sha256')
    phone = data.get('phone', '')
    email = data['email']

    conn = get_db()
    c = conn.cursor()
    try:
        c.execute(
            "INSERT INTO users (name, email, password, phone, is_verified) VALUES (?, ?, ?, ?, 0)",
            (data['name'], email, hashed_pw, phone)
        )
        user_id = c.lastrowid
        conn.commit()
        
        # Gerar Token de Verificacao
        token = jwt.encode({
            'verify_email': email,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        
        # Enviar Email
        verify_link = f"{request.host_url}api/auth/verify/{token}"
        html_body = f"""
        <h2>Bem-vindo ao Finanças Fácil!</h2>
        <p>Olá {data['name']}, clique no link abaixo para verificar sua conta:</p>
        <a href="{verify_link}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:5px;">Verificar Minha Conta</a>
        <p>Se você não criou essa conta, apenas ignore este e-mail.</p>
        """
        send_email(email, "Verifique sua conta no Finanças Fácil", html_body)
        
        return jsonify({"message": "Usuário criado. Verifique seu e-mail para confirmar a conta antes de fazer o login!"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "E-mail já cadastrado"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE email=?", (data['email'],))
    user = c.fetchone()
    conn.close()

    if not user or not check_password_hash(user['password'], data['password']):
        return jsonify({"error": "Login inválido"}), 401
        
    if user['is_verified'] == 0:
        return jsonify({"error": "Conta não verificada. Por favor, cheque a caixa de entrada (ou lixeira) do seu e-mail e clique no link de confirmação."}), 403

    # Gera token valido por 24 horas
    token = jwt.encode({
        'user_id': user['id'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, app.config['SECRET_KEY'], algorithm="HS256")

    return jsonify({
        "message": "Login OK", 
        "token": token,
        "user_id": user['id'],
        "name": user['name'],
        "email": user['email'],
        "theme": user['theme']
    })

@app.route('/api/auth/verify/<token>', methods=['GET'])
def verify_email(token):
    try:
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        email = data['verify_email']
        
        conn = get_db()
        c = conn.cursor()
        c.execute("UPDATE users SET is_verified = 1 WHERE email = ?", (email,))
        conn.commit()
        conn.close()
        
        return """
        <div style="font-family:sans-serif; text-align:center; padding: 50px;">
            <h1 style="color:#00c37b;">Conta verificada com sucesso!</h1>
            <p>Você já pode fechar esta aba e fazer login no sistema.</p>
            <a href="/" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:5px;">Ir para o Login</a>
        </div>
        """
    except Exception as e:
        return "<h1 style='text-align:center; padding: 50px;'>Link inválido ou expirado.</h1>"

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.json
    email = data.get('email')
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, name FROM users WHERE email=?", (email,))
    user = c.fetchone()
    conn.close()
    
    if user:
        token = jwt.encode({
            'reset_email': email,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        
        reset_link = f"{request.host_url}reset?token={token}"
        html_body = f"""
        <h2>Recuperação de Senha</h2>
        <p>Olá {user['name']}, recebemos um pedido para alterar sua senha.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 1 hora):</p>
        <a href="{reset_link}" style="display:inline-block; padding:10px 20px; background:#4f46e5; color:#fff; text-decoration:none; border-radius:5px;">Redefinir Senha</a>
        <p>Se você não pediu isso, apenas ignore este e-mail.</p>
        """
        send_email(email, "Recuperação de Senha - Finanças Fácil", html_body)
        
    return jsonify({"message": "Se o e-mail estiver cadastrado, as instruções foram enviadas!"})

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.json
    token = data.get('token')
    new_password = data.get('password')
    
    try:
        decoded = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        email = decoded['reset_email']
        
        hashed_pw = generate_password_hash(new_password, method='pbkdf2:sha256')
        conn = get_db()
        c = conn.cursor()
        c.execute("UPDATE users SET password = ? WHERE email = ?", (hashed_pw, email))
        conn.commit()
        conn.close()
        
        return jsonify({"message": "Senha redefinida com sucesso!"})
    except Exception as e:
        return jsonify({"error": "Link inválido ou expirado."}), 400

# ==========================================
# TÉRMINO: ABA DE AUTENTICAÇÃO

# ==========================================


# ==========================================
# INÍCIO: ABA DE TRANSAÇÕES E IMPORTAÇÃO
# ==========================================
@app.route('/api/transactions', methods=['POST'])
@token_required
def create_transaction(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    date_val = data.get('date') # Ex: "2026-04-28" ou None
    if not date_val:
        date_val = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    c.execute('''INSERT INTO transactions
        (user_id, type, description, amount, category, frequency, payment_day, date, account_id, credit_card_id, pdf_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            current_user_id,
            data['type'],
            data['description'],
            data['amount'],
            data['category'],
            data.get('frequency', 'Única'),
            data.get('payment_day'),
            date_val,
            data.get('account_id'),
            data.get('credit_card_id'),
            data.get('pdf_url')
        )
    )
    
    # Atualizar saldo da conta, se aplicável
    if data.get('account_id'):
        amount = float(data['amount'])
        if data['type'] == 'expense':
            c.execute("UPDATE accounts SET balance = balance - ? WHERE id = ? AND user_id = ?", (amount, data['account_id'], current_user_id))
        elif data['type'] == 'income':
            c.execute("UPDATE accounts SET balance = balance + ? WHERE id = ? AND user_id = ?", (amount, data['account_id'], current_user_id))

    conn.commit()
    conn.close()
    return jsonify({"message": "Criado"})

@app.route('/api/transactions/<int:trans_id>', methods=['PUT'])
@token_required
def update_transaction(current_user_id, trans_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    # Valida se a transação é do usuário logado
    c.execute("SELECT user_id FROM transactions WHERE id=?", (trans_id,))
    row = c.fetchone()
    if not row or row['user_id'] != current_user_id:
        return jsonify({"error": "Não autorizado"}), 403

    c.execute('''UPDATE transactions SET
        type=?, description=?, amount=?, category=?, frequency=?, payment_day=?, account_id=?, credit_card_id=?
        WHERE id=?''',
        (
            data['type'], data['description'], data['amount'], 
            data['category'], data.get('frequency', 'Única'), 
            data.get('payment_day'), data.get('account_id'), data.get('credit_card_id'), trans_id
        )
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Atualizado"})

@app.route('/api/transactions/<int:trans_id>', methods=['DELETE'])
@token_required
def delete_transaction(current_user_id, trans_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM transactions WHERE id=? AND user_id=?", (trans_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Deletado"})

@app.route('/api/transactions/<int:user_id>', methods=['GET'])
@token_required
def get_transactions(current_user_id, user_id):
    if current_user_id != user_id:
        return jsonify({"error": "Não autorizado"}), 403
        
    type_filter = request.args.get('type')
    conn = get_db()
    c = conn.cursor()
    
    if type_filter:
        c.execute("SELECT * FROM transactions WHERE user_id=? AND type=? ORDER BY id DESC", (user_id, type_filter))
    else:
        c.execute("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC", (user_id,))
        
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/import/<int:user_id>', methods=['POST'])
@token_required
def import_transactions(current_user_id, user_id):
    if current_user_id != user_id:
        return jsonify({"error": "Não autorizado"}), 403
        
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
        
    file = request.files['file']
    filename = file.filename.lower()
    
    conn = get_db()
    c = conn.cursor()
    count = 0
    
    if filename.endswith('.csv'):
        # Leitura de CSV simples
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_input = csv.reader(stream)
        for row in csv_input:
            if not row or row[0].lower() == 'data': continue # Pula cabeçalho
            try:
                # Ex formato esperado: data, tipo, categoria, descricao, valor
                date, t_type, category, desc, amount = row[0], row[1], row[2], row[3], float(row[4])
                c.execute('''INSERT INTO transactions (user_id, type, description, amount, category, date)
                             VALUES (?, ?, ?, ?, ?, ?)''', (user_id, t_type, desc, amount, category, date))
                count += 1
            except: pass
            
    elif filename.endswith('.ofx'):
        # Necessita ofxparse
        try:
            from ofxparse import OfxParser
            ofx = OfxParser.parse(file.stream)
            for transaction in ofx.account.statement.transactions:
                t_type = 'income' if transaction.amount > 0 else 'expense'
                amount = abs(float(transaction.amount))
                date = transaction.date.strftime('%Y-%m-%d %H:%M:%S')
                desc = transaction.payee or transaction.memo
                c.execute('''INSERT INTO transactions (user_id, type, description, amount, category, date)
                             VALUES (?, ?, ?, ?, ?, ?)''', (user_id, t_type, desc, amount, 'Outros', date))
                count += 1
        except Exception as e:
            return jsonify({"error": f"Erro processando OFX: {str(e)}"}), 500

    conn.commit()
    conn.close()
    return jsonify({"message": f"{count} transações importadas com sucesso!"})
# ==========================================
# TÉRMINO: ABA DE TRANSAÇÕES E IMPORTAÇÃO
# ==========================================


# ==========================================
# INÍCIO: ABA DE PROJETOS E METAS
# ==========================================
@app.route('/api/projects', methods=['POST'])
@token_required
def create_project(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO projects 
        (user_id, title, subtitle, target_amount, current_amount, deadline_date)
        VALUES (?, ?, ?, ?, ?, ?)''',
        (current_user_id, data['title'], data.get('subtitle', ''), data['target_amount'], data.get('current_amount', 0), data['deadline_date'])
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Projeto Criado"})

@app.route('/api/projects/<int:user_id>', methods=['GET'])
@token_required
def get_projects(current_user_id, user_id):
    if current_user_id != user_id:
        return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM projects WHERE user_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/projects/<int:proj_id>', methods=['PUT'])
@token_required
def update_project(current_user_id, proj_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT user_id FROM projects WHERE id=?", (proj_id,))
    row = c.fetchone()
    if not row or row['user_id'] != current_user_id:
        return jsonify({"error": "Não autorizado"}), 403

    c.execute('''UPDATE projects SET
        title=?, subtitle=?, target_amount=?, current_amount=?, deadline_date=?
        WHERE id=?''',
        (data['title'], data.get('subtitle', ''), data['target_amount'], data.get('current_amount', 0), data['deadline_date'], proj_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Atualizado"})

@app.route('/api/projects/<int:proj_id>', methods=['DELETE'])
@token_required
def delete_project(current_user_id, proj_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM projects WHERE id=? AND user_id=?", (proj_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Deletado"})
# ==========================================
# TÉRMINO: ABA DE PROJETOS E METAS
# ==========================================


# ==========================================
# INÍCIO: ABA DE ORÇAMENTOS (BUDGETS)
# ==========================================
@app.route('/api/budgets/<int:user_id>', methods=['GET'])
@token_required
def get_budgets(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM budgets WHERE user_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/budgets', methods=['POST'])
@token_required
def save_budget(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    # Usando REPLACE INTO pois definimos UNIQUE(user_id, category)
    c.execute('''REPLACE INTO budgets (user_id, category, limit_amount)
                 VALUES (?, ?, ?)''', (current_user_id, data['category'], data['limit_amount']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Orçamento salvo"})
# ==========================================
# TÉRMINO: ABA DE ORÇAMENTOS (BUDGETS)
# ==========================================


# ==========================================
# INÍCIO: ABA DE EXPANSÃO (CONTAS E CARTÕES)
# ==========================================
@app.route('/api/accounts', methods=['POST'])
@token_required
def create_account(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO accounts (user_id, name, type, balance, color)
                 VALUES (?, ?, ?, ?, ?)''',
              (current_user_id, data['name'], data['type'], data.get('balance', 0), data.get('color', '#4f46e5')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Conta criada"})

@app.route('/api/accounts/<int:user_id>', methods=['GET'])
@token_required
def get_accounts(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM accounts WHERE user_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/accounts/<int:account_id>', methods=['DELETE'])
@token_required
def delete_account(current_user_id, account_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM accounts WHERE id=? AND user_id=?", (account_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Conta deletada"})


@app.route('/api/credit_cards', methods=['POST'])
@token_required
def create_credit_card(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO credit_cards (user_id, name, limit_amount, closing_day, due_day, color)
                 VALUES (?, ?, ?, ?, ?, ?)''',
              (current_user_id, data['name'], data.get('limit_amount', 0), data['closing_day'], data['due_day'], data.get('color', '#e11d48')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Cartão criado"})

@app.route('/api/credit_cards/<int:user_id>', methods=['GET'])
@token_required
def get_credit_cards(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM credit_cards WHERE user_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/credit_cards/<int:card_id>', methods=['DELETE'])
@token_required
def delete_credit_card(current_user_id, card_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM credit_cards WHERE id=? AND user_id=?", (card_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Cartão deletado"})
# ==========================================
# TÉRMINO: ABA DE EXPANSÃO (CONTAS E CARTÕES)
# ==========================================


# ==========================================
# INÍCIO: ABA DE EXPANSÃO (CATEGORIAS, INVESTIMENTOS, COMPARTILHAMENTO)
# ==========================================
@app.route('/api/categories', methods=['POST'])
@token_required
def create_category(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO categories (user_id, name, type, color, icon)
                 VALUES (?, ?, ?, ?, ?)''',
              (current_user_id, data['name'], data['type'], data.get('color', '#10b981'), data.get('icon', 'fas fa-tag')))
    conn.commit()
    conn.close()
    return jsonify({"message": "Categoria criada"})

@app.route('/api/categories/<int:user_id>', methods=['GET'])
@token_required
def get_categories(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM categories WHERE user_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
@token_required
def delete_category(current_user_id, cat_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM categories WHERE id=? AND user_id=?", (cat_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Categoria deletada"})


@app.route('/api/investments', methods=['POST'])
@token_required
def create_investment(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO investments (user_id, asset_name, ticker, quantity, average_price, current_price)
                 VALUES (?, ?, ?, ?, ?, ?)''',
              (current_user_id, data['asset_name'], data['ticker'], data.get('quantity', 0), data.get('average_price', 0), data.get('current_price', 0)))
    conn.commit()
    conn.close()
    return jsonify({"message": "Investimento criado"})

@app.route('/api/investments/<int:user_id>', methods=['GET'])
@token_required
def get_investments(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM investments WHERE user_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/investments/<int:inv_id>', methods=['DELETE'])
@token_required
def delete_investment(current_user_id, inv_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM investments WHERE id=? AND user_id=?", (inv_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Investimento deletado"})


@app.route('/api/upload', methods=['POST'])
@token_required
def upload_file(current_user_id):
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nenhum arquivo selecionado"}), 400
        
    if file:
        # Verifica se diretório de uploads existe
        upload_folder = os.path.join('frontend', 'uploads')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder)
            
        filename = f"{current_user_id}_{int(datetime.datetime.now().timestamp())}_{file.filename}"
        file_path = os.path.join(upload_folder, filename)
        file.save(file_path)
        
        return jsonify({"url": f"/uploads/{filename}"})
    
    return jsonify({"error": "Erro no upload"}), 500

@app.route('/api/shared_access', methods=['POST'])
@token_required
def create_shared_access(current_user_id):
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute('''INSERT INTO shared_access (owner_id, guest_email, status)
                 VALUES (?, ?, 'active')''',
              (current_user_id, data['guest_email']))
    conn.commit()
    conn.close()
    return jsonify({"message": "Acesso compartilhado criado"})

@app.route('/api/shared_access/<int:user_id>', methods=['GET'])
@token_required
def get_shared_access(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM shared_access WHERE owner_id=?", (user_id,))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return jsonify(rows)

@app.route('/api/shared_access/<int:share_id>', methods=['DELETE'])
@token_required
def delete_shared_access(current_user_id, share_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM shared_access WHERE id=? AND owner_id=?", (share_id, current_user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Acesso compartilhado removido"})
# ==========================================
# TÉRMINO: ABA DE EXPANSÃO (CATEGORIAS, INVESTIMENTOS, COMPARTILHAMENTO)
# ==========================================


# ==========================================
# INÍCIO: DASHBOARD E EXPORTAÇÃO
# ==========================================
@app.route('/api/dashboard/<int:user_id>')
@token_required
def dashboard(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT * FROM transactions WHERE user_id=?", (user_id,))
    trans_rows = [dict(r) for r in c.fetchall()]
    
    c.execute("SELECT * FROM budgets WHERE user_id=?", (user_id,))
    budgets = {r['category']: r['limit_amount'] for r in c.fetchall()}
    
    conn.close()

    analytics = calculate_analytics(trans_rows, budgets)

    return jsonify({
        "transactions": trans_rows,
        "analytics": analytics
    })

@app.route('/api/users/<int:user_id>/export')
def export(user_id):
    # Nota: Rota sem token_required temporariamente pois window.location.href não envia Headers facilmente no front
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM transactions WHERE user_id=?", (user_id,))
    rows = c.fetchall()
    conn.close()

    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Frequência', 'Dia de Pagamento'])
    for r in rows:
        cw.writerow([r['date'], r['type'], r['category'], r['description'], r['amount'], r['frequency'], r['payment_day']])

    return Response(
        si.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=dados_financasfacil.csv"}
    )
# ==========================================
# TÉRMINO: DASHBOARD E EXPORTAÇÃO
# ==========================================


# ==========================================
# INÍCIO: ABA DE CONFIGURAÇÕES DE CONTA E PERFIL
# ==========================================
@app.route('/api/users/<int:user_id>', methods=['GET'])
@token_required
def get_user_config(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, name, email, phone, currency, language, push_enabled, email_alerts, monthly_report, theme FROM users WHERE id=?", (user_id,))
    user = c.fetchone()
    conn.close()
    if user: return jsonify(dict(user))
    return jsonify({"error": "Não encontrado"}), 404

@app.route('/api/users/<int:user_id>/profile', methods=['PUT'])
@token_required
def update_profile(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    data = request.json
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET name=?, currency=?, language=? WHERE id=?", (data['name'], data.get('currency', 'BRL'), data.get('language', 'PT-BR'), user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Perfil atualizado"})

@app.route('/api/users/<int:user_id>/security', methods=['PUT'])
@token_required
def update_security(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT password FROM users WHERE id=?", (user_id,))
    user = c.fetchone()
    
    if not user or not check_password_hash(user['password'], data['current_password']):
        conn.close()
        return jsonify({"error": "Senha atual incorreta"}), 401

    hashed_pw = generate_password_hash(data['new_password'], method='pbkdf2:sha256')
    c.execute("UPDATE users SET password=? WHERE id=?", (hashed_pw, user_id))
    conn.commit()
    conn.close()
    return jsonify({"message": "Senha atualizada"})

@app.route('/api/users/<int:user_id>/settings', methods=['PUT'])
@token_required
def update_settings(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    data = request.json
    conn = get_db()
    c = conn.cursor()
    
    for key, val in data.items():
        if key in ['theme', 'push_enabled', 'email_alerts', 'monthly_report']:
            c.execute(f"UPDATE users SET {key}=? WHERE id=?", (val, user_id))
            
    conn.commit()
    conn.close()
    return jsonify({"message": "Configurações salvas"})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@token_required
def delete_user(current_user_id, user_id):
    if current_user_id != user_id: return jsonify({"error": "Não autorizado"}), 403
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM users WHERE id=?", (user_id,))
    c.execute("DELETE FROM transactions WHERE user_id=?", (user_id,))
    c.execute("DELETE FROM projects WHERE user_id=?", (user_id,))
    c.execute("DELETE FROM budgets WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Conta apagada"})
# ==========================================
# TÉRMINO: ABA DE CONFIGURAÇÕES DE CONTA E PERFIL
# ==========================================




# ==========================================
# INÍCIO: ABA DE LEITOR DE NOTA FISCAL
# ==========================================
def auto_categorize(description):
    desc = str(description).upper()
    if any(word in desc for word in ['SUPERMERCADO', 'MERCADO', 'PADARIA', 'RESTAURANTE', 'LANCHONETE', 'IFOOD', 'DOCERIA', 'AÇOUGUE', 'ATACADAO']):
        return 'Alimentação'
    if any(word in desc for word in ['POSTO', 'AUTO', 'GASOLINA', 'UBER', '99']):
        return 'Transporte'
    if any(word in desc for word in ['FARMACIA', 'DROGARIA']):
        return 'Saúde'
    return 'Geral'

@app.route('/api/invoice/xml', methods=['POST'])
@token_required
def read_invoice_xml(current_user_id):
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400
    
    file = request.files['file']
    try:
        tree = ET.parse(file)
        root = tree.getroot()
        
        vNF = None
        xNome = None
        
        for elem in root.iter():
            if elem.tag.endswith('vNF'):
                if vNF is None: vNF = float(elem.text)
            elif elem.tag.endswith('xNome') and xNome is None:
                xNome = elem.text
                
        if vNF is None:
            return jsonify({"error": "Valor da nota não encontrado no XML"}), 400
            
        category = auto_categorize(xNome)
        
        return jsonify({
            "description": xNome,
            "amount": vNF,
            "category": category
        })
    except Exception as e:
        return jsonify({"error": f"Erro ao ler XML: {str(e)}"}), 400

@app.route('/api/invoice/qrcode', methods=['POST'])
@token_required
def read_invoice_qrcode(current_user_id):
    data = request.json
    url = data.get('url')
    if not url:
        return jsonify({"error": "URL não fornecida"}), 400
        
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8', errors='ignore')
            
        amount = 0
        description = "Compra (via QR Code)"
        
        match_nome = re.search(r'<div id="u20"[^>]*>([^<]+)</div>', html) or re.search(r'<div class="txtTopo"[^>]*>([^<]+)</div>', html) or re.search(r'<td class="nfce_emitente_nome"[^>]*>([^<]+)</td>', html)
        if match_nome:
            description = match_nome.group(1).strip()
            
        match_valor = re.search(r'<span class="totalNumb"[^>]*>([^<]+)</span>', html) or re.search(r'<span class="txtMax"[^>]*>([^<]+)</span>', html) or re.search(r'<td class="nfce_valor_total"[^>]*>([^<]+)</td>', html)
        if match_valor:
            val_str = match_valor.group(1).replace('.', '').replace(',', '.')
            amount = float(val_str)
            
        category = auto_categorize(description)
        
        return jsonify({
            "description": description,
            "amount": amount,
            "category": category
        })
    except Exception as e:
        return jsonify({"error": f"Erro ao acessar URL da SEFAZ. Tente o XML. ({str(e)})"}), 400
# ==========================================
# TÉRMINO: ABA DE LEITOR DE NOTA FISCAL
# ==========================================

if __name__ == '__main__':
    app.run(port=5000)