/* --- INÍCIO DO ARQUIVO JS PRINCIPAL (APP.JS) --- */
// Este arquivo cuida de toda a interatividade do site: ele escuta cliques, 
// formulários, salva o usuário autenticado, e conecta ao servidor Node (no :3000)

const API_URL = '/api';

// -> Wrapper de API para injetar o Token JWT
async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('ff_token');
    if (!options.headers) options.headers = {};
    
    // Se for FormData (upload de arquivo), não enviamos Content-Type pra o browser definir o boundary automático
    if (!(options.body instanceof FormData) && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }
    
    if (token && !url.includes('/auth/')) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, options);
    if (res.status === 401 && !url.includes('/auth/')) {
        logout(); // Token expirado
    }
    return res;
}


// -> Aplicar configuração global (Tema) logo na inicialização baseando no LocalStorage
function applyGlobalTheme() {
    const theme = localStorage.getItem('ff_user_theme');
    if(theme === 'Escuro') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}
applyGlobalTheme();

// -> Função: Pega o ID do usuário guardado na memória do navegador
function getCurrentUserId() {
    return localStorage.getItem('ff_user_id');
}

// -> Função: Bloqueia páginas. Se não tiver login, manda pro index.
function checkAuth() {
    if (!getCurrentUserId() && window.location.pathname !== '/') {
        window.location.href = '/';
    } else if (getCurrentUserId() && window.location.pathname === '/') {
        window.location.href = '/dashboard'; // Se já ta logado não precisa ver a tela de login
    }
}

// -> Função: Sair do sistema apagando as memórias
function logout() {
    localStorage.removeItem('ff_user_id');
    localStorage.removeItem('ff_token');
    localStorage.removeItem('ff_user_name');
    window.location.href = '/';
}

// -> Função: Logar via Formulário no index
async function handleLogin(e) {
    if(e) e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const res = await apiFetch(`${API_URL}/auth/login`, {
            method: 'POST',
            
            body: JSON.stringify({email, password})
        });
        const data = await res.json();
        if(res.ok) {
            // Salva credenciais e configurações na  memória local e vai pro Dashboard
            localStorage.setItem('ff_user_id', data.user_id);
            localStorage.setItem('ff_token', data.token);
            localStorage.setItem('ff_user_name', data.name);
            if(data.email) localStorage.setItem('ff_user_email', data.email);
            if(data.theme) {
                localStorage.setItem('ff_user_theme', data.theme);
                applyGlobalTheme();
            }
            window.location.href = '/dashboard';
        } else alert(data.error);
    } catch(err) {
        alert("Erro ao logar");
    }
}

// -> Função: Cadastrar nova conta
window.handleRegister = async function(event) {
    event.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const password = document.getElementById('regPassword').value;
    const confPassword = document.getElementById('regConfPassword').value;
    
    if(password !== confPassword) {
        alert("As senhas não coincidem!");
        return;
    }

    try {
        const res = await apiFetch(`${API_URL}/auth/register`, {
            method: 'POST',
            
            body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if(res.ok) {
            const customAlert = document.getElementById('customAlert');
            const alertText = document.getElementById('customAlertText');
            if (customAlert && alertText) {
                alertText.innerHTML = "<strong>Conta criada com sucesso!</strong><br>Foi enviado um e-mail de confirmação para o endereço informado. Verifique sua <b>Caixa de Entrada</b> ou a pasta de <b>Spam</b>.";
                customAlert.style.display = 'block';
                document.getElementById('registerForm').reset();
            } else {
                alert("Foi enviado um e-mail de confirmação para o endereço informado. Verifique sua Caixa de Entrada ou a pasta de Spam.");
            }
            if(typeof toggleAuth === 'function') toggleAuth('login');
        } else alert(data.error);
    } catch(err) {
        alert("Erro ao cadastrar");
    }
}

// -> Função: Enviar (Criar ou Editar) um Renda ou um Gasto pro Backend
async function submitTransaction(e, type) {
    if(e) e.preventDefault();
    const user_id = getCurrentUserId();
    const description = document.getElementById('transDesc').value;
    const amount = parseFloat(document.getElementById('transAmnt').value);
    const payment_day = document.getElementById('transDate') ? document.getElementById('transDate').value : null;
    const transId = document.getElementById('transId') ? document.getElementById('transId').value : null;
    
    let category = 'Geral';
    let frequency = document.getElementById('transFreq') ? document.getElementById('transFreq').value : 'Única';
    
    if(type === 'expense') {
        category = document.getElementById('transCat').value;
    } else {
        category = 'Renda';
    }
    
    try {
        const url = transId ? `${API_URL}/transactions/${transId}` : `${API_URL}/transactions`;
        const method = transId ? 'PUT' : 'POST';
        
        const res = await apiFetch(url, {
            method: method,
            
            body: JSON.stringify({user_id, type, description, amount, category, frequency, payment_day})
        });
        
        if (res.ok) {
            alert(transId ? "Transação alterada com sucesso!" : "Transação cadastrada com sucesso!");
            if(e) e.target.reset();
            if(document.getElementById('transId')) document.getElementById('transId').value = "";
            cancelEdit(); // Volta botão pro normal
            loadTransactions(type); // Recarrega a tabela na mesma hora
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch(err) {
        alert("Erro ao cadastrar/atualizar transação");
    }
}

// -> Função: Puxar a Lista (Tabela Lateral) com as transacoes feitas
async function loadTransactions(type) {
    const listEl = document.getElementById('transactionsList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/transactions/${user_id}?type=${type}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error(rows.error || "Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Nenhum registro encontrado.</div>`;
            return;
        }
        
        rows.forEach(t => {
            let info = type === 'income' ? `Frequência: ${t.frequency} | Venc.: Dia ${t.payment_day || '--'}` : `Categoria: ${t.category} | Venc.: Dia ${t.payment_day || '--'}`;
            listEl.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; background: #fff;">
                <div>
                    <h4 style="margin-bottom: 4px; font-size: 0.95rem; color: #1f2937;">${t.description}</h4>
                    <p style="font-size: 0.8rem; color: #6b7280; margin-bottom: 6px;">${info}</p>
                    <strong style="color: ${type === 'income' ? '#00c37b' : '#f43f5e'};">R$ ${parseFloat(t.amount).toFixed(2)}</strong>
                </div>
                <div style="display:flex; gap: 8px;">
                    <button class="btn" style="background:transparent; border:1px solid #e5e7eb; color:#3b82f6; padding:0.4rem 0.8rem; width:auto;" onclick="editTransaction('${t.id}', '${t.description}', '${t.amount}', '${t.category}', '${t.frequency}', '${t.payment_day}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn" style="background:transparent; border:1px solid #e5e7eb; color:#f43f5e; padding:0.4rem 0.8rem; width:auto;" onclick="deleteTransaction('${t.id}', '${type}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
        });
    } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; color: red;">Erro ao carregar lista.</div>`;
    }
}

// -> Função: Colocar transação em modo edição no formulário
window.editTransaction = function(id, description, amount, category, frequency, payment_day) {
    document.getElementById('transId').value = id;
    document.getElementById('transDesc').value = description;
    document.getElementById('transAmnt').value = amount;
    
    if(document.getElementById('transDate') && payment_day && payment_day !== 'null') {
        document.getElementById('transDate').value = payment_day;
    } else if(document.getElementById('transDate')) {
        document.getElementById('transDate').value = "";
    }
    
    if(document.getElementById('transFreq')) document.getElementById('transFreq').value = (frequency !== 'null' ? frequency : 'Mensal');
    
    if(document.getElementById('transCat')) {
        document.getElementById('transCat').value = (category !== 'null' ? category : 'Outros');
        if(typeof updateCatGrid === 'function') updateCatGrid();
    }
    
    document.getElementById('transSubmitBtn').innerText = "Salvar Alterações";
    document.getElementById('transCancelBtn').style.display = "inline-block";
}

// -> Função: Cancelar modo edição e esvaziar formulário
window.cancelEdit = function() {
    if(document.getElementById('transId')) document.getElementById('transId').value = "";
    document.getElementById('transactionForm').reset();
    document.getElementById('transSubmitBtn').innerText = document.location.pathname.includes('renda') ? "Cadastrar Renda" : "Cadastrar Gasto";
    document.getElementById('transCancelBtn').style.display = "none";
    if(typeof updateCatGrid === 'function') updateCatGrid();
}

// -> Função: Apagar do banco e recarregar
window.deleteTransaction = async function(id, type) {
    if(!confirm("Tem certeza que deseja excluir este registro permanentemente?")) return;
    
    try {
        const res = await apiFetch(`${API_URL}/transactions/${id}`, { method: 'DELETE' });
        if(res.ok) {
            loadTransactions(type);
        } else {
            alert("Erro ao excluir.");
        }
    } catch(err) {
        alert("Falha de rede ao excluir.");
    }
}

// =====================================
// SESSÃO DE GERENCIAMENTO DE PROJETOS
// =====================================
window.toggleProjectForm = function() {
    const el = document.getElementById('projectFormContainer');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

window.cancelProjectEdit = function() {
    document.getElementById('projectForm').reset();
    document.getElementById('projId').value = "";
    document.getElementById('projSubmitBtn').innerText = "Criar Projeto";
    document.getElementById('projectFormContainer').style.display = 'none';
}

window.submitProject = async function(e) {
    e.preventDefault();
    const user_id = getCurrentUserId();
    const id = document.getElementById('projId').value;
    const title = document.getElementById('projTitle').value;
    const subtitle = document.getElementById('projSub').value;
    const target_amount = parseFloat(document.getElementById('projTarget').value);
    const current_amount = parseFloat(document.getElementById('projCurrent').value);
    const deadline_date = document.getElementById('projDate').value;
    
    try {
        const url = id ? `${API_URL}/projects/${id}` : `${API_URL}/projects`;
        const method = id ? 'PUT' : 'POST';
        
        const res = await apiFetch(url, {
            method,
            
            body: JSON.stringify({user_id, title, subtitle, target_amount, current_amount, deadline_date})
        });
        
        if (res.ok) {
            alert(id ? "Projeto Atualizado!" : "Projeto Criado!");
            cancelProjectEdit();
            loadProjects();
        } else alert("Erro ao salvar projeto");
    } catch(err) {
        alert("Erro na rede.");
    }
}

window.loadProjects = async function() {
    const listEl = document.getElementById('projectsList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/projects/${user_id}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error(rows.error || "Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Você ainda não cadastrou nenhum projeto.</div>`;
            return;
        }
        
        // Pega data atual para calcular os dias
        const hoje = new Date();
        
        rows.forEach(p => {
            let dataSplit = p.deadline_date.split('-'); // ex: 2026-12-30
            let dataBr = "S/D";
            let diffDays = 0;
            if(dataSplit.length === 3) {
                dataBr = `${dataSplit[2]}/${dataSplit[1]}/${dataSplit[0]}`;
                const dataAlvoT = new Date(p.deadline_date.replace(/-/g, '\/')).getTime(); // fix pra tz
                diffDays = Math.ceil((dataAlvoT - hoje.getTime()) / (1000 * 3600 * 24));
            }
            
            let perc = (p.target_amount > 0) ? ((p.current_amount / p.target_amount) * 100).toFixed(1) : 0;
            if(perc > 100) perc = 100;
            
            let faltam = p.target_amount - p.current_amount;
            if(faltam < 0) faltam = 0;
            
            let porMes = diffDays > 0 ? (faltam / (diffDays / 30)) : 0;
            
            listEl.innerHTML += `
            <div class="project-card">
                <div class="project-header-bg">
                    <div>
                        <h3>${p.title}</h3>
                        <p>${p.subtitle || ''}</p>
                        <p style="margin-top: 15px;">
                            <i class="fa-regular fa-calendar"></i> Prazo: ${dataBr} (${diffDays > 0 ? diffDays : 0} dias)
                        </p>
                    </div>
                    <div style="font-size: 1.5rem; display:flex; gap: 10px; align-items:flex-start;">
                        <button class="btn" style="background:transparent; color:white; padding:0; border:none;" onclick="editProject('${p.id}', '${p.title}', '${p.subtitle}', '${p.target_amount}', '${p.current_amount}', '${p.deadline_date}')"><i class="fa-solid fa-pen" style="font-size: 1rem;"></i></button>
                        <button class="btn" style="background:transparent; color:#fca5a5; padding:0; border:none;" onclick="deleteProject('${p.id}')"><i class="fa-solid fa-trash" style="font-size: 1rem;"></i></button>
                        <i class="fa-solid fa-rocket" style="margin-left:8px;"></i>
                    </div>
                </div>
                
                <div class="project-body">
                    <div class="progress-meta">
                        <span>Progresso</span>
                        <span>${perc}%</span>
                    </div>
                    <div class="progress-bar-bg" style="height: 12px;">
                        <div class="progress-bar-fill" style="width: ${perc}%;"></div>
                    </div>
                    <div class="progress-meta" style="color:var(--text-muted); font-size:0.75rem; font-weight:400; margin-top:6px;">
                        <span>R$ ${p.current_amount.toFixed(2)}</span>
                        <span>R$ ${p.target_amount.toFixed(2)}</span>
                    </div>

                    <div class="project-stats-grid">
                        <div class="project-stat-box">
                            <small>Faltam</small>
                            <strong>R$ ${faltam.toFixed(2)}</strong>
                        </div>
                        <div class="project-stat-box suggest">
                            <small>Guardar por mês</small>
                            <strong>R$ ${porMes.toFixed(2)}</strong>
                        </div>
                        <div class="project-stat-box" title="Adicionar R$ 100 guardados" style="cursor:pointer; display:flex; align-items:center; justify-content:center; border: 1px solid var(--border-color); font-weight:600;" onclick="quickAddProject('${p.id}', ${p.current_amount}, 100, '${p.title}', '${p.subtitle}', ${p.target_amount}, '${p.deadline_date}')">
                            + R$ 100
                        </div>
                    </div>
                </div>
            </div>`;
        });
    } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; color: red;">Erro ao carregar projetos.</div>`;
    }
}

window.editProject = function(id, title, subtitle, target, current, date) {
    toggleProjectForm();
    document.getElementById('projId').value = id;
    document.getElementById('projTitle').value = title;
    document.getElementById('projSub').value = subtitle !== 'null' ? subtitle : '';
    document.getElementById('projTarget').value = target;
    document.getElementById('projCurrent').value = current;
    document.getElementById('projDate').value = date;
    document.getElementById('projSubmitBtn').innerText = "Salvar Projeto";
}

window.deleteProject = async function(id) {
    if(!confirm("Excluir projeto permanentemente?")) return;
    try {
        const res = await apiFetch(`${API_URL}/projects/${id}`, { method: 'DELETE' });
        if(res.ok) loadProjects();
        else alert("Erro ao excluir.");
    } catch(er) { alert("Falha na rede.") }
}

window.quickAddProject = async function(id, current_amount, addval, title, subtitle, target_amount, deadline_date) {
    const finalAmount = parseFloat(current_amount) + addval;
    try {
        const res = await apiFetch(`${API_URL}/projects/${id}`, {
            method: 'PUT',
            
            body: JSON.stringify({title, subtitle: subtitle==='null'?'':subtitle, target_amount, current_amount: finalAmount, deadline_date})
        });
        if(res.ok) loadProjects();
    } catch(er) {}
}

// =====================================
// SESSÃO DE CONFIGURAÇÕES DE USUÁRIO
// =====================================

window.loadSettings = async function() {
    const user_id = getCurrentUserId();
    try {
        const res = await apiFetch(`${API_URL}/users/${user_id}`);
        const user = await res.json();
        
        if(res.ok) {
            // Perfil
            document.getElementById('confName').value = user.name || '';
            document.getElementById('confEmail').value = user.email || '';
            if(document.getElementById('confCurrency')) document.getElementById('confCurrency').value = user.currency;
            if(document.getElementById('confLanguage')) document.getElementById('confLanguage').value = user.language;
            
            // Toggles
            if(document.getElementById('confPush')) document.getElementById('confPush').checked = user.push_enabled === 1;
            if(document.getElementById('confEmailAlert')) document.getElementById('confEmailAlert').checked = user.email_alerts === 1;
            if(document.getElementById('confMonthly')) document.getElementById('confMonthly').checked = user.monthly_report === 1;
            
            // Tema Visual: remove "active" de todos e põe só no certo
            const themeBoxes = document.querySelectorAll('#themeConfBox .theme-box');
            if(themeBoxes.length > 0) {
                themeBoxes.forEach(b => b.classList.remove('active'));
                const activeBox = document.getElementById(`theme-${user.theme}`) || document.getElementById('theme-Claro');
                if(activeBox) activeBox.classList.add('active');
            }
            
            // Aplica e salva tema atual no corpo do HTML globalmente
            localStorage.setItem('ff_user_theme', user.theme || 'Claro');
            applyGlobalTheme();
        }
    } catch(er) { }
}

window.updateProfileData = async function() {
    const user_id = getCurrentUserId();
    const name = document.getElementById('confName').value;
    const currency = document.getElementById('confCurrency').value;
    const language = document.getElementById('confLanguage').value;
    
    try {
        const res = await apiFetch(`${API_URL}/users/${user_id}/profile`, {
            method: 'PUT',
            
            body: JSON.stringify({name, currency, language})
        });
        if(res.ok) {
            alert("Perfil salvo com sucesso!");
            localStorage.setItem('ff_user_name', name);
        } else {
            const err = await res.json();
            alert(err.error);
        }
    } catch(er) {}
}

window.updatePasswordData = async function() {
    const user_id = getCurrentUserId();
    const current_password = document.getElementById('confCurrentPass').value;
    const new_password = document.getElementById('confNewPass').value;
    const confirm_pass = document.getElementById('confConfirmPass').value;
    
    if(!current_password || !new_password) return alert("Preencha as senhas.");
    if(new_password !== confirm_pass) return alert("A nova senha e a confirmação não conferem.");
    
    try {
        const res = await apiFetch(`${API_URL}/users/${user_id}/security`, {
            method: 'PUT',
            
            body: JSON.stringify({current_password, new_password})
        });
        if(res.ok) {
            alert("Senha alterada com sucesso!");
            document.getElementById('confCurrentPass').value = '';
            document.getElementById('confNewPass').value = '';
            document.getElementById('confConfirmPass').value = '';
        } else {
            const err = await res.json();
            alert(err.error);
        }
    } catch(er) {}
}

window.updateSettingToggle = async function(field, isChecked) {
    const user_id = getCurrentUserId();
    const bodyObj = {};
    bodyObj[field] = isChecked;
    
    try {
        await apiFetch(`${API_URL}/users/${user_id}/settings`, {
            method: 'PUT',
            
            body: JSON.stringify(bodyObj)
        });
    } catch(er) {}
}

window.updateThemeConfig = async function(themeString) {
    const user_id = getCurrentUserId();
    
    // UI Feedback imediato
    const themeBoxes = document.querySelectorAll('#themeConfBox .theme-box');
    themeBoxes.forEach(b => b.classList.remove('active'));
    document.getElementById(`theme-${themeString}`).classList.add('active');
    
    // Atualização global no front
    localStorage.setItem('ff_user_theme', themeString);
    applyGlobalTheme();
    
    try {
        await apiFetch(`${API_URL}/users/${user_id}/settings`, {
            method: 'PUT',
            
            body: JSON.stringify({theme: themeString})
        });
    } catch(er) {}
}

window.exportFinancialData = function() {
    const user_id = getCurrentUserId();
    // Navegador resolve requisição GET e abre tela de donwload sozinho
    window.location.href = `${API_URL}/users/${user_id}/export`;
}

window.deleteUserAccount = async function() {
    if(!confirm("Atenção CUIDADO!\nExcluir sua conta apaga TODAS as suas Rendas, Gastos, Projetos e seu Perfil permanentemente. Deseja mesmo continuar?")) return;
    
    if(confirm("ÚLTIMO AVISO! Tem 100% de certeza disso?")) {
        const user_id = getCurrentUserId();
        try {
            const res = await apiFetch(`${API_URL}/users/${user_id}`, { method: 'DELETE' });
            if(res.ok) {
                alert("Sua conta e dados foram excluídos permanentemente. Adeus...");
                logout(); // Usa função já existente
            } else alert("Falha ao apagar conta.");
        } catch(er) {}
    }
}

// SESSÃO DE CONTRUÇÃO DE DASHBOARD / RELATÓRIOS
// =====================================

// -> Função: Puxar do backend pra exibir o Dashboard Principal e os Graficos
async function loadDashboard() {
    checkAuth();
    const user_id = getCurrentUserId();
    if(!user_id) return;
    
    try {
        const res = await apiFetch(`${API_URL}/dashboard/${user_id}`);
        const data = await res.json();
        
        if(res.ok) {
            const summary = data.analytics.summary;
            document.getElementById('stat-income').innerText = `R$ ${summary.total_income.toFixed(2).replace('.', ',')}`;
            document.getElementById('stat-expense').innerText = `R$ ${summary.total_expenses.toFixed(2).replace('.', ',')}`;
            document.getElementById('stat-balance').innerText = `R$ ${summary.balance.toFixed(2).replace('.', ',')}`;
            document.getElementById('stat-suggestion').innerText = `R$ ${summary.daily_suggestion.toFixed(2).replace('.', ',')}`;
            
            // Chama a renderização dos charts mandando os dados calculados
            renderCharts(data.analytics); 
            if(document.getElementById('calendarGrid')) {
                renderCalendar(data.transactions);
            }
        }
    } catch(err) {
        console.error("Erro ao carregar dashboard", err);
    }
}

// -> Função: Puxar e montar a tela Inteira avançada de Relatórios
async function loadReports() {
    checkAuth();
    const user_id = getCurrentUserId();
    if(!user_id) return;
    
    try {
        const res = await apiFetch(`${API_URL}/dashboard/${user_id}`);
        const data = await res.json();
        
        if(res.ok) {
            const rep = data.analytics.reports;
            // Preenche as 3 cards superiores
            document.getElementById('rel-media-renda').innerText = `R$ ${rep.media_renda.toFixed(2).replace('.', ',')}`;
            document.getElementById('rel-media-gastos').innerText = `R$ ${rep.media_gastos.toFixed(2).replace('.', ',')}`;
            document.getElementById('rel-media-economia').innerText = `R$ ${rep.media_economia.toFixed(2).replace('.', ',')}`;
            
            const analytics = data.analytics;
            
            const colorsMap = { 'Alimentação': '#f97316', 'Transporte': '#3b82f6', 'Moradia': '#a855f7', 'Lazer': '#ec4899', 'Contas': '#eab308', 'Compras': '#10b981', 'Outros': '#6b7280' };
            
            // Render grafico Linhas Evolutivo Principal
            const ctxLine = document.getElementById('lineChart');
            if(ctxLine) {
                const months = Object.keys(analytics.monthly);
                const incomes = months.map(m => analytics.monthly[m].income);
                const expenses = months.map(m => analytics.monthly[m].expense);
                const balances = months.map(m => analytics.monthly[m].income - analytics.monthly[m].expense);
                
                new Chart(ctxLine, {
                    type: 'line',
                    data: {
                        labels: months,
                        datasets: [
                            { label: 'Renda', data: incomes, borderColor: '#00c37b', backgroundColor: '#00c37b', tension: 0.4 },
                            { label: 'Gastos', data: expenses, borderColor: '#f43f5e', backgroundColor: '#f43f5e', tension: 0.4 },
                            { label: 'Saldo', data: balances, borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.4 }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: {
                                    usePointStyle: true,
                                    boxWidth: 8
                                }
                            }
                        }
                    }
                });
            }
            
            // Grafico Semanal Barras Roxas
            const ctxWeek = document.getElementById('weeklyBarChart');
            if(ctxWeek) {
                 const days = Object.keys(analytics.weekly);
                 const weekVals = Object.values(analytics.weekly);
                 new Chart(ctxWeek, {
                    type: 'bar',
                    data: {
                        labels: days,
                        datasets: [{ label: 'Gastos Diários', data: weekVals, backgroundColor: '#8b5cf6' }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
                 });
            }
            
            // Detalhamentos na aba Categoria
            let listHTML = "";
            let total = analytics.summary.total_expenses;
            
            // Grafico de Pizza Local
            const ctxPieLocal = document.getElementById('categoryPieChart');
            if(ctxPieLocal && Object.keys(analytics.categories).length > 0) {
                 new Chart(ctxPieLocal, {
                     type: 'pie',
                     data: {
                        labels: Object.keys(analytics.categories),
                        datasets: [{
                            data: Object.values(analytics.categories),
                            backgroundColor: Object.keys(analytics.categories).map(k => colorsMap[k] || colorsMap['Outros'])
                        }]
                     },
                     options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{position:'left'}} }
                 });
                 
                 // Escreve as litas HTML calculando as porcentagens
                 for (let cat in analytics.categories) {
                      let val = analytics.categories[cat];
                      let perc = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                      let color = colorsMap[cat] || colorsMap['Outros'];
                      
                      listHTML += `
                      <div class="detail-item">
                           <div class="detail-info"><div class="dot" style="background:${color}"></div>${cat}</div>
                           <div class="detail-values">
                               <strong>R$ ${val.toFixed(2)}</strong>
                               <small>${perc}%</small>
                           </div>
                      </div>`;
                 }
                 document.getElementById('detailsList').innerHTML = listHTML;
            }
            
        }
    } catch(err) {
        console.error("Erro", err);
    }
}

// -> Função Auxiliar Visual (Desenha ChartJS do Dashboard Inicial)
function renderCharts(analytics) {
    const colors = { 'Alimentação': '#f97316', 'Transporte': '#3b82f6', 'Moradia': '#a855f7', 'Lazer': '#ec4899', 'Contas': '#eab308', 'Compras': '#10b981', 'Outros': '#6b7280' };

    // Evita multiplicar graficos ao recarregar aba
    if(window.barChartInst) window.barChartInst.destroy();
    if(window.pieChartInst) window.pieChartInst.destroy();
    
    // Grafico Barras do Dashboard
    const ctxBar = document.getElementById('barChart');
    if(ctxBar) {
        const months = Object.keys(analytics.monthly);
        const incomes = months.map(m => analytics.monthly[m].income);
        const expenses = months.map(m => analytics.monthly[m].expense);
        
        window.barChartInst = new Chart(ctxBar, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Entradas', data: incomes, backgroundColor: '#00c37b' },
                    { label: 'Saídas', data: expenses, backgroundColor: '#f43f5e' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Gráfico Pizza Dashboard Central
    const ctxPie = document.getElementById('pieChart');
    if(ctxPie && Object.keys(analytics.categories).length > 0) {
        const labels = Object.keys(analytics.categories);
        const data = Object.values(analytics.categories);
        const bgColors = labels.map(l => colors[l] || colors['Outros']);
        
        window.pieChartInst = new Chart(ctxPie, {
            type: 'pie',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: bgColors, borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    }
}

// Verificação de autenticação padrão ao rodar a aba global.
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    checkAuth();
}

if (window.location.pathname.includes('/renda')) loadTransactions('income');
if (window.location.pathname.includes('/gasto')) loadTransactions('expense');
if (window.location.pathname.includes('/projetos')) loadProjects();
if (window.location.pathname.includes('/configuracoes')) loadSettings();

window.calCurrentDate = new Date();
window.lastTransactions = [];

window.changeCalendarMonth = function(offset) {
    window.calCurrentDate.setMonth(window.calCurrentDate.getMonth() + offset);
    if(window.lastTransactions) {
        renderCalendar(window.lastTransactions);
    }
}

// -> Função: Desenhar Calendário na Dashboard
function renderCalendar(transactions) {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calMonthYear');
    if(!grid || !title) return;
    
    // Salva as transações originais na memória para redesenhar se o mês mudar
    window.lastTransactions = transactions;
    
    const year = window.calCurrentDate.getFullYear();
    const month = window.calCurrentDate.getMonth(); // 0 a 11
    const today = new Date(); // Para referenciar qual é o dia exato de hoje no mundo real
    
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    title.innerText = `${monthNames[month]} ${year}`;
    
    // Calcula o primeiro dia da semana e o total de dias no mês
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Seg...
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Mapeia os dias com transações levando em conta a frequência
    const daysMap = {};
    transactions.forEach(t => {
        if(!t.date) return;
        const origDate = new Date(t.date.split(' ')[0] + 'T12:00:00');
        const dayNum = parseInt(t.payment_day) || origDate.getDate();
        const freq = t.frequency || 'Única';
        
        const markDay = (d) => {
            if(d >= 1 && d <= daysInMonth) {
                if(!daysMap[d]) daysMap[d] = { income: false, expense: false };
                if(t.type === 'income') daysMap[d].income = true;
                if(t.type === 'expense') daysMap[d].expense = true;
            }
        };

        if (freq === 'Única') {
            if (origDate.getMonth() === month && origDate.getFullYear() === year) {
                markDay(dayNum);
            }
        } 
        else if (freq === 'Mensal') {
            const viewYearMonth = year * 12 + month;
            const origYearMonth = origDate.getFullYear() * 12 + origDate.getMonth();
            if (viewYearMonth >= origYearMonth) {
                markDay(dayNum);
            }
        }
        else if (freq === 'Anual') {
            if (origDate.getMonth() === month && year >= origDate.getFullYear()) {
                markDay(dayNum);
            }
        }
        else if (freq === 'Semanal') {
            const MS_PER_DAY = 1000 * 60 * 60 * 24;
            for(let d = 1; d <= daysInMonth; d++) {
                const iterDate = new Date(year, month, d, 12, 0, 0);
                const diffDays = Math.round((iterDate.getTime() - origDate.getTime()) / MS_PER_DAY);
                if (diffDays >= 0 && diffDays % 7 === 0) {
                    markDay(d);
                }
            }
        }
    });
    
    let html = '';
    // Preenche caixas vazias até o primeiro dia
    for(let i = 0; i < firstDay; i++) {
        html += `<div class="cal-day empty"></div>`;
    }
    
    // Preenche as caixinhas dos dias reais
    const isCurrentRealMonth = (today.getMonth() === month && today.getFullYear() === year);
    const currentRealDay = today.getDate();
    
    for(let d = 1; d <= daysInMonth; d++) {
        const isToday = (isCurrentRealMonth && d === currentRealDay) ? 'today' : '';
        let indicatorsInfo = '';
        
        if(daysMap[d]) {
            const hasIn = daysMap[d].income;
            const hasEx = daysMap[d].expense;
            if(hasIn && hasEx) indicatorsInfo = `<div class="cal-indicator-wrapper"><div class="cal-indicator mix"></div></div>`;
            else if(hasIn)     indicatorsInfo = `<div class="cal-indicator-wrapper"><div class="cal-indicator income"></div></div>`;
            else if(hasEx)     indicatorsInfo = `<div class="cal-indicator-wrapper"><div class="cal-indicator expense"></div></div>`;
        }
        
        html += `<div class="cal-day ${isToday}">
                    ${d}
                    ${indicatorsInfo}
                 </div>`;
    }
    
    grid.innerHTML = html;
}
/* --- TÉRMINO DO ARQUIVO --- */

// =====================================
// SESSÃO DE IMPORTAÇÃO (OFX/CSV)
// =====================================
window.importTransactions = async function(event) {
    event.preventDefault();
    const user_id = getCurrentUserId();
    const fileInput = document.getElementById('importFile');
    if (!fileInput.files.length) return alert('Selecione um arquivo.');
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const res = await apiFetch(`${API_URL}/import/${user_id}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if(res.ok) {
            alert(data.message);
            fileInput.value = '';
            if(typeof loadDashboard === 'function') loadDashboard();
        } else alert(data.error);
    } catch(err) {
        alert('Erro ao importar arquivo.');
    }
}

// =====================================
// SESSÃO DE ORÇAMENTOS (BUDGETS)
// =====================================
window.saveBudget = async function(event) {
    event.preventDefault();
    const user_id = getCurrentUserId();
    const category = document.getElementById('budgetCategory').value;
    const limit_amount = parseFloat(document.getElementById('budgetLimit').value);
    
    try {
        const res = await apiFetch(`${API_URL}/budgets`, {
            method: 'POST',
            body: JSON.stringify({ category, limit_amount })
        });
        if(res.ok) {
            alert('Orçamento definido com sucesso!');
            document.getElementById('budgetForm').reset();
            loadDashboard(); // Recarrega para mostrar graficos atualizados
        } else {
            const err = await res.json();
            alert(err.error);
        }
    } catch(err) {
        alert('Erro ao salvar orçamento.');
    }
}

// =====================================
// SESSÃO DE RECUPERAÇÃO DE SENHA
// =====================================
window.handleForgotPassword = async function(event) {
    event.preventDefault();
    const email = prompt('Digite o e-mail da sua conta para recuperar a senha:');
    if(!email) return;
    
    try {
        const res = await apiFetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        alert(data.message || 'Se o e-mail existir, você receberá um link de recuperação.');
    } catch(err) {
        alert('Erro de conexão ao solicitar recuperação.');
    }
}
