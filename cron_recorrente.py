import sqlite3
import datetime
import os
import calendar

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'backend', 'data', 'database.db')

def process_recurrents():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    today = datetime.datetime.now()
    current_month_str = today.strftime('%Y-%m')
    current_day = today.day

    # Busca transacoes mensais
    c.execute("SELECT * FROM transactions WHERE frequency = 'Mensal'")
    mensais = c.fetchall()

    for t in mensais:
        # Se o dia de pagamento for hoje ou anterior
        pay_day = int(t['payment_day']) if t['payment_day'] and t['payment_day'].isdigit() else 1
        
        # Ajuste para "último dia do mês" (representado pelo dia 31 no front)
        _, last_day_of_month = calendar.monthrange(today.year, today.month)
        if pay_day == 31:
            pay_day = last_day_of_month
            
        if current_day >= pay_day:
            # Verifica se já existe um registro parecido para este mês
            c.execute("""
                SELECT id FROM transactions 
                WHERE user_id = ? AND description = ? AND amount = ? AND frequency = 'Única'
                AND date LIKE ?
            """, (t['user_id'], t['description'], t['amount'], f"{current_month_str}-%"))
            
            if not c.fetchone():
                # Insere o gasto para este mes como Única (para não gerar loop)
                new_date = today.replace(day=pay_day).strftime('%Y-%m-%d 12:00:00')
                c.execute("""
                    INSERT INTO transactions 
                    (user_id, type, description, amount, category, frequency, payment_day, date)
                    VALUES (?, ?, ?, ?, ?, 'Única', ?, ?)
                """, (t['user_id'], t['type'], t['description'], t['amount'], t['category'], t['payment_day'], new_date))
                print(f"Lançado recorrente: {t['description']}")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    print(f"--- Iniciando Cron Recorrente em {datetime.datetime.now()} ---")
    process_recurrents()
    print("--- Finalizado ---")
