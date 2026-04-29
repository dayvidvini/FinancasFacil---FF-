# --- INÍCIO DO ARQUIVO: ANALISADOR DE DADOS (PYTHON) ---
# Este script recebe os dados financeiros que estavam no Banco de Dados (SQLite), via Node.js.
# Aqui nós mastigamos esses dados, somamos, tiramos médias e devolvemos
# um JSON limpo, pronto para os Gráficos do site desenharem na tela.

import sys
import json
import datetime
import calendar

def calculate_analytics(transactions, budgets=None):
    if budgets is None: budgets = {}
    
    # Inicia os totais no zero
    total_income = 0.0
    total_expenses = 0.0
    
    # Dicionário que vai guardar a soma dos gastos para cada categoria
    expenses_by_category = {}
    
    # Molde para os meses do ano. Cada mês guarda o quanto entrou e quanto saiu
    monthly_data = {
        'Jan': {'income': 0, 'expense': 0}, 'Fev': {'income': 0, 'expense': 0},
        'Mar': {'income': 0, 'expense': 0}, 'Abr': {'income': 0, 'expense': 0},
        'Mai': {'income': 0, 'expense': 0}, 'Jun': {'income': 0, 'expense': 0},
        'Jul': {'income': 0, 'expense': 0}, 'Ago': {'income': 0, 'expense': 0},
        'Set': {'income': 0, 'expense': 0}, 'Out': {'income': 0, 'expense': 0},
        'Nov': {'income': 0, 'expense': 0}, 'Dez': {'income': 0, 'expense': 0},
    }

    # Distribuição dos gastos pelos dias da semana (Segunda a Domingo)
    weekly_data = {
        'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0, 'Dom': 0
    }
    
    days_map = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
    months_list = list(monthly_data.keys())

    # --- INÍCIO: LAÇO DE REPETIÇÃO (RODA PARA CADA TRANSAÇÃO) ---
    for t in transactions:
        amount = float(t.get('amount', 0))
        date_str = t.get('date', '')
        
        month_idx = -1
        weekday_idx = -1
        try:
            # Tenta converter a data que veio do banco em objeto Date do Python
            if date_str:
                date_obj = datetime.datetime.strptime(date_str.split(' ')[0], '%Y-%m-%d')
                month_idx = date_obj.month - 1
                weekday_idx = date_obj.weekday()
        except Exception:
            pass

        if t.get('type') == 'income':  # SE FOR RENDA
            total_income += amount
            if month_idx >= 0:
                monthly_data[months_list[month_idx]]['income'] += amount
                
        elif t.get('type') == 'expense': # SE FOR GASTO
            total_expenses += amount
            
            # Soma ao montante da categoria
            cat = t.get('category', 'Outros')
            expenses_by_category[cat] = expenses_by_category.get(cat, 0) + amount
            
            # Soma ao mês do gráfico
            if month_idx >= 0:
                monthly_data[months_list[month_idx]]['expense'] += amount
            
            # Soma ao dia da semana do gráfico de barras (da tela Relatórios)
            if weekday_idx >= 0:
                weekly_data[days_map[weekday_idx]] += amount
    # --- TÉRMINO: LAÇO DE REPETIÇÃO ---

    # Saldo = Entradas Menos Saídas
    balance = total_income - total_expenses
    
    # --- INÍCIO: CÁLCULOS EXTRAS (SUGESTÃO E MÉDIAS) ---
    today = datetime.date.today()
    _, days_in_month = calendar.monthrange(today.year, today.month)
    remaining_days = days_in_month - today.day + 1
    
    # Sugestão de Gasto Diário para não ficar no negativo
    daily_suggestion = 0.0
    if balance > 0 and days_in_month > 0:
        daily_suggestion = balance / days_in_month
        
    # Médias usadas na tela "Relatórios"
    # Fazemos uma média fictícia divindo pelo ano em si ou tempo fixo pra simplificar
    media_renda = total_income / max(1, today.month) 
    media_gastos = total_expenses / max(1, today.month)
    media_economia = media_renda - media_gastos
    # --- TÉRMINO: CÁLCULOS EXTRAS ---
        
    # --- INÍCIO: ORÇAMENTOS (BUDGETS) ---
    budget_status = {}
    for cat, limit in budgets.items():
        spent = expenses_by_category.get(cat, 0.0)
        percentage = (spent / limit * 100) if limit > 0 else 0
        budget_status[cat] = {
            'limit': limit,
            'spent': spent,
            'percentage': round(percentage, 1),
            'remaining': round(limit - spent, 2)
        }
    # --- TÉRMINO: ORÇAMENTOS ---

    # --- INÍCIO: DEVOLUÇÃO DOS DADOS ---
    # Montamos um grande dicionário que será devolvido como formato JSON
    return {
        'summary': {
            'total_income': round(total_income, 2),
            'total_expenses': round(total_expenses, 2),
            'balance': round(balance, 2),
            'daily_suggestion': round(daily_suggestion, 2)
        },
        'reports': {
            'media_renda': round(media_renda, 2),
            'media_gastos': round(media_gastos, 2),
            'media_economia': round(media_economia, 2),
        },
        'categories': expenses_by_category,
        'monthly': monthly_data,
        'weekly': weekly_data, # Adicionado para os graficos semanais roxos
        'budgets': budget_status
    }
    # --- TÉRMINO: DEVOLUÇÃO ---

def main():
    # Se rodar direto pelo sistema (sem dados), geramos dados falsos para demonstração
    # assim o script não vai dar erro caso você clique em "PLAY" no editor.
    if len(sys.argv) < 2:
        mock_transactions = [
            {"amount": 5000, "type": "income", "date": "2026-04-01", "category": "Salário"},
            {"amount": 1500, "type": "expense", "date": "2026-04-05", "category": "Moradia"},
            {"amount": 400, "type": "expense", "date": "2026-04-08", "category": "Alimentação"}
        ]
        result = calculate_analytics(mock_transactions)
        print(json.dumps(result, indent=2))
        return
        
    raw_data = sys.argv[1] # raw_data possui todo o SQL transformado em Texto JSON
    
    try:
        # Carrega o texto como Objeto (Array de Dicionários) e processa
        transactions = json.loads(raw_data)
        result = calculate_analytics(transactions)
        
        # O "print" no Python, quando chamado de dentro do Node, devolve a resposta pra o site.
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

# É aqui que o arquivo inicia sua execução de verdade caso seja o arquivo principal rodado
if __name__ == "__main__":
    main()
# --- TÉRMINO DO ARQUIVO ---
