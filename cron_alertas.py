import sqlite3
import datetime
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'backend', 'data', 'database.db')

EMAIL_SENDER = 'financa.ff.facil@gmail.com'
EMAIL_PASSWORD = os.getenv('EMAIL_APP_PASSWORD', 'aucfcntgmsodmmut')

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
        print(f'Erro ao enviar email para {to_email}: {e}')
        return False

def check_and_send_alerts():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    today = datetime.datetime.now()
    current_day = today.day
    
    # Busca usuários que habilitaram alertas por e-mail
    try:
        c.execute("SELECT id, name, email FROM users WHERE email_alerts = 1")
        users = c.fetchall()
    except:
        users = [] # Falha caso a coluna email_alerts não exista ainda
        
    for user in users:
        user_id = user['id']
        # Busca despesas pendentes para os próximos 3 dias
        c.execute("SELECT * FROM transactions WHERE user_id = ? AND type = 'expense'", (user_id,))
        expenses = c.fetchall()
        
        alert_items = []
        for exp in expenses:
            if exp['payment_day'] and exp['payment_day'].isdigit():
                pay_day = int(exp['payment_day'])
                # Calcula a diferença de dias (considerando fim de mês simplificado)
                if 0 <= (pay_day - current_day) <= 3:
                    alert_items.append(exp)
        
        if alert_items:
            # Monta o corpo do e-mail
            html_body = f"<h2>Olá {user['name']}!</h2>"
            html_body += "<p>Você tem as seguintes contas vencendo nos próximos 3 dias:</p><ul>"
            
            for item in alert_items:
                html_body += f"<li><strong>{item['description']}</strong> - R$ {item['amount']:.2f} (Vencimento: Dia {item['payment_day']})</li>"
            
            html_body += "</ul><p>Acesse o Finanças Fácil para mais detalhes.</p>"
            
            # Envia o e-mail
            print(f"Enviando alerta para {user['email']}...")
            send_email(user['email'], "Aviso de Vencimento - Finanças Fácil", html_body)

    conn.close()

if __name__ == '__main__':
    print(f"--- Iniciando Cron de Alertas em {datetime.datetime.now()} ---")
    check_and_send_alerts()
    print("--- Finalizado ---")
