import os
import re

with open('app.py', 'r', encoding='utf-8') as f:
    content = f.read()

imports = '''import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
'''
content = content.replace('import io', 'import io\n' + imports)

# Setup email constants
email_setup = '''
# ==========================================
# INÍCIO: CONFIGURAÇÃO DE E-MAIL
# ==========================================
EMAIL_SENDER = 'dayvidvini7@gmail.com'
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
'''

content = content.replace('# ==========================================\n# INÍCIO: ROTAS DE FRONTEND E PWA', email_setup + '\n# ==========================================\n# INÍCIO: ROTAS DE FRONTEND E PWA')

content = content.replace("language TEXT DEFAULT 'PT-BR',", "language TEXT DEFAULT 'PT-BR',\n        is_verified INTEGER DEFAULT 0,")
content = content.replace("try: c.execute(\"ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'Claro'\")\n    except: pass", "try: c.execute(\"ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'Claro'\")\n    except: pass\n    try: c.execute(\"ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0\")\n    except: pass")

register_logic = '''
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
        verify_link = f"http://localhost:5000/api/auth/verify/{token}"
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
'''
content = re.sub(r"@app\.route\('/api/auth/register', methods=\['POST'\]\).*?def login\(\):", register_logic.strip() + "\n\n@app.route('/api/auth/login', methods=['POST'])\ndef login():", content, flags=re.DOTALL)

login_check = '''
    if not user or not check_password_hash(user['password'], data['password']):
        return jsonify({"error": "Login inválido"}), 401
        
    if user['is_verified'] == 0:
        return jsonify({"error": "Conta não verificada. Por favor, cheque a caixa de entrada (ou lixeira) do seu e-mail e clique no link de confirmação."}), 403
'''
content = re.sub(r"if not user or not check_password_hash\(user\['password'\], data\['password'\]\):.*?return jsonify\(\{\"error\": \"Login inválido\"\}\), 401", login_check.strip(), content, flags=re.DOTALL)


extra_auth = '''
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
        
        reset_link = f"http://localhost:5000/reset.html?token={token}"
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
'''

content = content.replace('# ==========================================\n# TÉRMINO: ABA DE AUTENTICAÇÃO', extra_auth)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done injecting email routes.')
