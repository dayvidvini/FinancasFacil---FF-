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
        if(category === 'Outros') {
            const customName = document.getElementById('customCatName').value;
            if(customName.trim() !== '') {
                category = customName.trim();
                // Optionally save to API directly
                apiFetch(`${API_URL}/categories`, {
                    method: 'POST',
                    body: JSON.stringify({name: category, type: 'expense', color: '#6b7280', icon: 'fa-tag'})
                }).catch(e=>console.log(e));
            }
        }
    } else {
        category = 'Renda';
    }
    
    // Upload de PDF opcional
    let pdf_url = null;
    const transPdfEl = document.getElementById('transPdf');
    if(transPdfEl && transPdfEl.files && transPdfEl.files[0]) {
        try {
            const formData = new FormData();
            formData.append('file', transPdfEl.files[0]);
            const token = localStorage.getItem('ff_token');
            const uploadRes = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const uploadData = await uploadRes.json();
            if(uploadRes.ok) pdf_url = uploadData.url;
        } catch(e) { console.error("Erro upload", e); }
    }
    
    let account_id = null;
    let credit_card_id = null;
    const transAccountEl = document.getElementById('transAccount');
    if(transAccountEl && transAccountEl.value) {
        const val = transAccountEl.value;
        if(val.startsWith('acc_')) account_id = parseInt(val.replace('acc_', ''));
        if(val.startsWith('card_')) credit_card_id = parseInt(val.replace('card_', ''));
    }
    
    const url = transId ? `${API_URL}/transactions/${transId}` : `${API_URL}/transactions`;
    const method = transId ? 'PUT' : 'POST';
    if (frequency === 'Quinzenal' && !transId) {
        const quinzenalType = document.getElementById('transQuinzenalType').value;
        const day1 = parseInt(payment_day);
        if (!day1) return alert('Por favor, informe o Dia da 1ª parcela.');
        
        let day2 = day1 + 15;
        if (quinzenalType === 'ultimoDia') {
            day2 = 31;
        } else if (day2 > 30) {
            day2 = day2 - 30;
        }
        
        try {
            // Parte 1
            const res1 = await apiFetch(url, {
                method: method,
                body: JSON.stringify({user_id, type, description: description + ' - 1ª Parte', amount: amount / 2, category, frequency: 'Mensal', payment_day: day1, account_id, credit_card_id})
            });
            // Parte 2
            const res2 = await apiFetch(url, {
                method: method,
                body: JSON.stringify({user_id, type, description: description + ' - 2ª Parte', amount: amount / 2, category, frequency: 'Mensal', payment_day: day2, account_id, credit_card_id})
            });
            
            if (res1.ok && res2.ok) {
                alert("Transação quinzenal cadastrada em duas partes!");
                if(e) e.target.reset();
                cancelEdit();
                loadTransactions(type);
            } else {
                alert("Erro ao salvar uma das partes da transação.");
            }
        } catch(err) {
            alert("Erro na rede ao cadastrar quinzenal.");
        }
        return;
    }
    
    try {
        const url = transId ? `${API_URL}/transactions/${transId}` : `${API_URL}/transactions`;
        const method = transId ? 'PUT' : 'POST';
        
        const res = await apiFetch(url, {
            method: method,
            
            body: JSON.stringify({user_id, type, description, amount, category, frequency, payment_day, account_id, credit_card_id, pdf_url})
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
            let pdfBtn = t.pdf_url ? `<button class="btn" style="background:transparent; border:1px solid #e5e7eb; color:#8b5cf6; padding:0.4rem 0.8rem; width:auto;" onclick="openPdfModal('${API_URL.replace('/api','')}${t.pdf_url}')" title="Ver Comprovante"><i class="fa-solid fa-file-pdf"></i></button>` : '';
            listEl.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; background: #fff;">
                <div>
                    <h4 style="margin-bottom: 4px; font-size: 0.95rem; color: #1f2937;">${t.description}</h4>
                    <p style="font-size: 0.8rem; color: #6b7280; margin-bottom: 6px;">${info}</p>
                    <strong style="color: ${type === 'income' ? '#00c37b' : '#f43f5e'};">R$ ${parseFloat(t.amount).toFixed(2)}</strong>
                </div>
                <div style="display:flex; gap: 8px;">
                    ${pdfBtn}
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

// Modal Global de PDF
window.openPdfModal = function(url) {
    let modal = document.getElementById('globalPdfModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalPdfModal';
        modal.style.cssText = 'display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:9999; align-items:center; justify-content:center; padding:2rem;';
        modal.innerHTML = `
            <div style="background:#fff; width:100%; max-width:800px; height:90vh; border-radius:12px; display:flex; flex-direction:column; overflow:hidden;">
                <div style="padding:1rem; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;"><i class="fa-solid fa-file-pdf" style="color:#8b5cf6;"></i> Visualizador de Comprovante</h3>
                    <button onclick="document.getElementById('globalPdfModal').style.display='none'" style="background:transparent; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>
                <iframe id="globalPdfIframe" style="flex:1; width:100%; border:none;"></iframe>
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('globalPdfIframe').src = url;
    modal.style.display = 'flex';
}

window.handleFreqChange = function() {
    const freq = document.getElementById('transFreq').value;
    const quinzenalOpts = document.getElementById('quinzenalOptions');
    const lblDate = document.getElementById('lblTransDate');
    
    if (freq === 'Quinzenal') {
        if(quinzenalOpts) quinzenalOpts.style.display = 'block';
        if(lblDate) lblDate.innerText = 'Dia da 1ª parcela';
    } else {
        if(quinzenalOpts) quinzenalOpts.style.display = 'none';
        if(lblDate) lblDate.innerText = 'Dia de pagamento';
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
            
            if(document.getElementById('categoriesList')) {
                loadCategories();
                loadSharedAccess();
            }
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
            if(document.getElementById('stat-income')) document.getElementById('stat-income').innerText = `R$ ${summary.total_income.toFixed(2).replace('.', ',')}`;
            if(document.getElementById('stat-expense')) document.getElementById('stat-expense').innerText = `R$ ${summary.total_expenses.toFixed(2).replace('.', ',')}`;
            if(document.getElementById('stat-balance')) document.getElementById('stat-balance').innerText = `R$ ${summary.balance.toFixed(2).replace('.', ',')}`;
            if(document.getElementById('stat-suggestion')) document.getElementById('stat-suggestion').innerText = `R$ ${summary.daily_suggestion.toFixed(2).replace('.', ',')}`;
            
            // Faturas de Cartão
            if(document.getElementById('stat-credit-cards')) {
                let faturasTotal = 0;
                data.transactions.forEach(t => {
                    if (t.type === 'expense' && t.credit_card_id) {
                        faturasTotal += t.amount;
                    }
                });
                document.getElementById('stat-credit-cards').innerText = `R$ ${faturasTotal.toFixed(2).replace('.', ',')}`;
                
                // Buscar limites
                try {
                    const resCards = await apiFetch(`${API_URL}/credit_cards/${user_id}`);
                    if (resCards.ok) {
                        const cards = await resCards.json();
                        let limitTotal = cards.reduce((acc, c) => acc + c.limit_amount, 0);
                        if(document.getElementById('stat-cc-limit')) document.getElementById('stat-cc-limit').innerText = `R$ ${limitTotal.toFixed(2).replace('.', ',')}`;
                    }
                } catch(e) { console.error(e) }
            }
            
            // Chama a renderização dos charts mandando os dados calculados
            renderCharts(data.analytics); 
            if(document.getElementById('calendarGrid')) {
                renderCalendar(data.transactions);
            }
            if(document.getElementById('budgetsList')) {
                renderBudgets(data.analytics.budgets);
            }
            
            // Buscar Faturas de Cartão (Se existir painel no HTML)
            if(document.getElementById('stat-credit-cards') || document.getElementById('orc-cc-total')) {
                try {
                    const ccRes = await apiFetch(`${API_URL}/credit_cards/${user_id}`);
                    if(ccRes.ok) {
                        const cards = await ccRes.json();
                        let totalLimit = 0;
                        let totalInvoice = 0;
                        cards.forEach(c => {
                            totalLimit += parseFloat(c.limit_amount);
                            // Aqui simplificamos assumindo que as transações do dashboard já poderiam calcular
                            // Mas para não sobrecarregar, pegamos uma estimativa do uso ou se tivéssemos o saldo na tabela.
                            // Neste app, o "saldo" não fica direto no cartão. Se não houver prop invoice_total, deixamos 0 ou somamos o fechamento.
                            // Para um MVP, somamos limite_disponível / limit_amount, mas o back n devolve uso atual no model de credit_cards, a não ser q a gente calcule.
                            // Como a api /credit_cards retorna limit_amount e closing_day, assumiremos q é apenas a soma do limite pra não quebrar.
                        });
                        
                        // Busca transações para calcular a fatura atual (todas despesas vinculadas a cartões no mes atual)
                        const thisMonthStr = new Date().toISOString().slice(0, 7);
                        const ccExpenses = data.transactions.filter(t => t.type === 'expense' && t.date && t.date.startsWith(thisMonthStr) && t.credit_card_id && cards.find(c => c.id == t.credit_card_id));
                        ccExpenses.forEach(t => totalInvoice += parseFloat(t.amount));

                        if(document.getElementById('stat-credit-cards')) document.getElementById('stat-credit-cards').innerText = `R$ ${totalInvoice.toFixed(2).replace('.', ',')}`;
                        if(document.getElementById('stat-cc-limit')) document.getElementById('stat-cc-limit').innerText = `R$ ${totalLimit.toFixed(2).replace('.', ',')}`;
                        if(document.getElementById('orc-cc-total')) document.getElementById('orc-cc-total').innerText = `R$ ${totalInvoice.toFixed(2).replace('.', ',')}`;
                    }
                } catch(e) { console.error("Erro fetch cards", e); }
            }
            
            // --- Gamificação e Conquistas ---
            if(document.getElementById('achievementsGrid')) {
                // 1. Mão de Vaca: total_expense < total_income e income > 0
                if (summary.total_income > 0 && summary.total_expenses < summary.total_income) {
                    document.getElementById('badge-mao-de-vaca').classList.remove('locked');
                    document.getElementById('badge-mao-de-vaca').classList.add('unlocked');
                } else {
                    document.getElementById('badge-mao-de-vaca').classList.remove('unlocked');
                    document.getElementById('badge-mao-de-vaca').classList.add('locked');
                }

                // 2. Investidor: Guardou 20% da renda no mês
                if (summary.total_income > 0 && summary.total_expenses <= (summary.total_income * 0.8)) {
                    document.getElementById('badge-investidor').classList.remove('locked');
                    document.getElementById('badge-investidor').classList.add('unlocked');
                } else {
                    document.getElementById('badge-investidor').classList.remove('unlocked');
                    document.getElementById('badge-investidor').classList.add('locked');
                }
                
                // 3. Visionário: Possui pelo menos um Projeto
                try {
                    const resProj = await apiFetch(`${API_URL}/projects/${user_id}`);
                    if (resProj.ok) {
                        const projects = await resProj.json();
                        if (projects.length > 0) {
                            document.getElementById('badge-visionario').classList.remove('locked');
                            document.getElementById('badge-visionario').classList.add('unlocked');
                        } else {
                            document.getElementById('badge-visionario').classList.remove('unlocked');
                            document.getElementById('badge-visionario').classList.add('locked');
                        }
                    }
                } catch(e) { console.error("Erro fetch projetos conquistas", e); }
            }
            // --------------------------------

        }
    } catch(err) {
        console.error("Erro ao carregar dashboard", err);
    }
}

// -> Função Auxiliar: Renderizar lista de Orçamentos/Budgets
function renderBudgets(budgets) {
    const listEl = document.getElementById('budgetsList');
    if (!listEl) return;
    
    if (!budgets || Object.keys(budgets).length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Nenhum orçamento definido ainda.</div>`;
        return;
    }
    
    let html = '';
    for (let cat in budgets) {
        const b = budgets[cat];
        let color = 'var(--primary-green)'; // default green
        if (b.percentage > 90) {
            color = '#f43f5e'; // red
        } else if (b.percentage > 70) {
            color = '#eab308'; // yellow
        }
        
        let percView = b.percentage > 100 ? 100 : b.percentage;
        
        html += `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-weight: 600; font-size: 1.1rem; color: var(--text-main);">${cat}</span>
                <span style="color: var(--text-muted); font-size: 0.9rem;">R$ ${b.spent.toFixed(2)} / R$ ${b.limit.toFixed(2)}</span>
            </div>
            <div style="background: #f3f4f6; width: 100%; height: 10px; border-radius: 6px; overflow: hidden; margin-bottom: 12px;">
                <div style="background: ${color}; height: 100%; width: ${percView}%; border-radius: 6px; transition: width 0.5s ease;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                <strong style="color: ${color};">${b.percentage}% utilizado</strong>
                <span style="color: var(--text-muted);">Restam: R$ ${b.remaining.toFixed(2)}</span>
            </div>
        </div>`;
    }
    listEl.innerHTML = html;
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
            
            if(document.getElementById('budgetsList') && analytics.budgets) {
                renderBudgets(analytics.budgets);
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

    // Gráfico de Previsão de Fluxo de Caixa (Forecast)
    const ctxForecast = document.getElementById('forecastChart');
    if(ctxForecast && analytics.forecast) {
        if(window.forecastChartInst) window.forecastChartInst.destroy();
        
        const labels = analytics.forecast.map(f => f.month);
        const dataIn = analytics.forecast.map(f => f.expected_income);
        const dataOut = analytics.forecast.map(f => f.expected_expense);
        const dataBal = analytics.forecast.map(f => f.projected_balance);
        
        window.forecastChartInst = new Chart(ctxForecast, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Renda Esperada', data: dataIn, borderColor: '#00c37b', tension: 0.4, borderDash: [5, 5] },
                    { label: 'Gasto Esperado', data: dataOut, borderColor: '#f43f5e', tension: 0.4, borderDash: [5, 5] },
                    { label: 'Saldo Projetado', data: dataBal, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.2)', fill: true, tension: 0.4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
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
// =====================================
// SESSÃO DE BOLETOS
// =====================================
window.loadBoletos = async function() {
    const listEl = document.getElementById('boletosList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/boletos/${user_id}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error(rows.error || "Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Você não tem boletos cadastrados.</div>`;
            return;
        }
        
        rows.forEach(b => {
            const isPaid = b.status === 'paid';
            const statusColor = isPaid ? 'var(--primary-green)' : '#f59e0b'; // verde ou laranja
            const statusText = isPaid ? 'Pago' : 'Pendente';
            
            listEl.innerHTML += `
            <div style="background: var(--bg-main); border: 1px solid var(--border-color); border-left: 4px solid ${statusColor}; border-radius: 8px; padding: 1.5rem; display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px;">
                <div style="display:flex; justify-content: space-between; align-items:flex-start;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main); text-decoration: ${isPaid ? 'line-through' : 'none'}; opacity: ${isPaid ? '0.6' : '1'};">${b.title}</h3>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">Vence em: ${b.due_date.split('-').reverse().join('/')}</p>
                    </div>
                    <div>
                        <strong style="font-size: 1.2rem; color: var(--text-main);">R$ ${b.amount.toFixed(2)}</strong>
                    </div>
                </div>
                
                ${b.barcode ? `<div style="font-size: 0.8rem; background: var(--bg-body); padding: 5px; border-radius: 4px; word-break: break-all; color: var(--text-muted);"><i class="fa-solid fa-barcode"></i> ${b.barcode}</div>` : ''}
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <span style="font-size: 0.8rem; font-weight: 600; color: ${statusColor};">${statusText}</span>
                    <div style="display:flex; gap: 10px;">
                        ${!isPaid ? `<button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="payBoleto('${b.id}')"><i class="fa-solid fa-check"></i> Pagar</button>` : ''}
                        <button class="btn" style="background:transparent; color:#fca5a5; padding:0; border:none;" onclick="deleteBoleto('${b.id}')"><i class="fa-solid fa-trash" style="font-size: 1.1rem;"></i></button>
                    </div>
                </div>
            </div>`;
        });
    } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; color: red;">Erro ao carregar boletos.</div>`;
    }
}

window.saveBoleto = async function(e) {
    e.preventDefault();
    const title = document.getElementById('bolTitle').value;
    const amount = parseFloat(document.getElementById('bolAmount').value);
    const due_date = document.getElementById('bolDueDate').value;
    const barcode = document.getElementById('bolBarcode').value;
    
    try {
        const res = await apiFetch(`${API_URL}/boletos`, {
            method: 'POST',
            body: JSON.stringify({title, amount, due_date, barcode})
        });
        
        if (res.ok) {
            document.getElementById('boletoForm').reset();
            loadBoletos();
        } else alert("Erro ao salvar boleto");
    } catch(err) {
        alert("Erro na rede.");
    }
}

window.payBoleto = async function(id) {
    if(!confirm("Marcar este boleto como pago? Isso criará um Gasto na sua conta automaticamente.")) return;
    try {
        const res = await apiFetch(`${API_URL}/boletos/${id}/pay`, { method: 'PUT' });
        if(res.ok) {
            alert("Boleto pago com sucesso!");
            loadBoletos();
        } else {
            alert("Erro ao marcar como pago.");
        }
    } catch(er) { alert("Falha na rede.") }
}

window.deleteBoleto = async function(id) {
    if(!confirm("Excluir este boleto?")) return;
    try {
        const res = await apiFetch(`${API_URL}/boletos/${id}`, { method: 'DELETE' });
        if(res.ok) loadBoletos();
        else alert("Erro ao excluir.");
    } catch(er) { alert("Falha na rede.") }
}

// =====================================
// SESSÃO DE CONTAS (ACCOUNTS)
// =====================================
window.loadAccounts = async function() {
    const listEl = document.getElementById('accountsList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/accounts/${user_id}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error(rows.error || "Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem; grid-column: 1 / -1;">Você ainda não cadastrou nenhuma conta.</div>`;
            return;
        }
        
        rows.forEach(a => {
            listEl.innerHTML += `
            <div style="background: ${a.color || 'var(--primary-color)'}; border-radius: 12px; padding: 1.5rem; color: white; display: flex; flex-direction: column; justify-content: space-between; position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.1); min-height: 160px;">
                <div style="display:flex; justify-content: space-between; align-items:flex-start;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">${a.name}</h3>
                        <p style="margin: 0; font-size: 0.8rem; opacity: 0.8;">${a.type}</p>
                    </div>
                    <button class="btn" style="background:rgba(255,255,255,0.2); color:white; padding: 6px 10px; border:none; width: auto; min-width: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="deleteAccount('${a.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <p style="margin: 0; font-size: 0.85rem; opacity: 0.8;">Saldo Atual</p>
                        <strong style="font-size: 1.2rem;">R$ ${a.balance.toFixed(2)}</strong>
                    </div>
                    <i class="fa-solid fa-wallet" style="font-size: 2rem; opacity: 0.7;"></i>
                </div>
            </div>`;
        });
    } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; color: red;">Erro ao carregar contas.</div>`;
    }
}

window.saveAccount = async function(e) {
    e.preventDefault();
    const name = document.getElementById('accName').value;
    const type = document.getElementById('accType').value;
    const balance = parseFloat(document.getElementById('accBalance').value);
    const color = document.getElementById('accColor').value;
    
    try {
        const res = await apiFetch(`${API_URL}/accounts`, {
            method: 'POST',
            body: JSON.stringify({name, type, balance, color})
        });
        
        if (res.ok) {
            document.getElementById('accountForm').reset();
            loadAccounts();
        } else alert("Erro ao salvar conta");
    } catch(err) {
        alert("Erro na rede.");
    }
}

window.deleteAccount = async function(id) {
    if(!confirm("Excluir conta permanentemente? (Isso não apagará as transações vinculadas, mas elas perderão a referência da conta)")) return;
    try {
        const res = await apiFetch(`${API_URL}/accounts/${id}`, { method: 'DELETE' });
        if(res.ok) loadAccounts();
        else alert("Erro ao excluir.");
    } catch(er) { alert("Falha na rede.") }
}

// =====================================
// SESSÃO DE CARTÕES DE CRÉDITO
// =====================================
window.loadCreditCards = async function() {
    const listEl = document.getElementById('cardsList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/credit_cards/${user_id}`);
        const rows = await res.json();
        
        const resTrans = await apiFetch(`${API_URL}/transactions/${user_id}?type=expense`);
        let expenses = [];
        if(resTrans.ok) {
            expenses = await resTrans.json();
        }
        const thisMonthStr = new Date().toISOString().slice(0, 7);
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error(rows.error || "Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem; grid-column: 1 / -1;">Você ainda não cadastrou nenhum cartão.</div>`;
            return;
        }
        
        rows.forEach(c => {
            let invoiceTotal = 0;
            const cardExpenses = expenses.filter(t => t.credit_card_id == c.id && t.date && t.date.startsWith(thisMonthStr));
            cardExpenses.forEach(t => invoiceTotal += parseFloat(t.amount));

            listEl.innerHTML += `
            <div style="background: ${c.color}; border-radius: 12px; padding: 1.5rem; color: white; display: flex; flex-direction: column; justify-content: space-between; position: relative; box-shadow: 0 4px 6px rgba(0,0,0,0.1); min-height: 160px;">
                <div style="display:flex; justify-content: space-between; align-items:flex-start;">
                    <div>
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">${c.name}</h3>
                        <p style="margin: 0; font-size: 0.8rem; opacity: 0.8;">Fechamento: Dia ${c.closing_day} | Venc: Dia ${c.due_day}</p>
                    </div>
                    <button class="btn" style="background:rgba(255,255,255,0.2); color:white; padding: 4px 8px; border:none;" onclick="deleteCreditCard('${c.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                        <p style="margin: 0; font-size: 0.85rem; opacity: 0.8;">Fatura Atual</p>
                        <strong style="font-size: 1.2rem;">R$ ${invoiceTotal.toFixed(2)}</strong>
                        <p style="margin: 0; font-size: 0.75rem; opacity: 0.7; margin-top: 2px;">Limite: R$ ${c.limit_amount.toFixed(2)}</p>
                    </div>
                    <i class="fa-brands fa-cc-visa" style="font-size: 2rem; opacity: 0.7;"></i>
                </div>
            </div>`;
        });
    } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; color: red;">Erro ao carregar cartões.</div>`;
    }
}

window.saveCreditCard = async function(e) {
    e.preventDefault();
    const name = document.getElementById('cardName').value;
    const limit_amount = parseFloat(document.getElementById('cardLimit').value);
    const closing_day = parseInt(document.getElementById('cardClosing').value);
    const due_day = parseInt(document.getElementById('cardDue').value);
    const color = document.getElementById('cardColor').value;
    
    try {
        const res = await apiFetch(`${API_URL}/credit_cards`, {
            method: 'POST',
            body: JSON.stringify({name, limit_amount, closing_day, due_day, color})
        });
        
        if (res.ok) {
            document.getElementById('cardForm').reset();
            loadCreditCards();
        } else alert("Erro ao salvar cartão");
    } catch(err) {
        alert("Erro na rede.");
    }
}

window.deleteCreditCard = async function(id) {
    if(!confirm("Excluir cartão permanentemente?")) return;
    try {
        const res = await apiFetch(`${API_URL}/credit_cards/${id}`, { method: 'DELETE' });
        if(res.ok) loadCreditCards();
        else alert("Erro ao excluir.");
    } catch(er) { alert("Falha na rede.") }
}
window.loadTransactionOptions = async function() {
    const optAccounts = document.getElementById('optAccounts');
    const optCards = document.getElementById('optCards');
    if(!optAccounts && !optCards) return; // Não estamos na tela de gasto/renda
    
    const user_id = getCurrentUserId();
    
    try {
        if(optAccounts) {
            const resA = await apiFetch(`${API_URL}/accounts/${user_id}`);
            if(resA.ok) {
                const accs = await resA.json();
                optAccounts.innerHTML = '';
                if (accs.length === 0) {
                    optAccounts.innerHTML = '<option disabled>Nenhuma conta cadastrada</option>';
                } else {
                    accs.forEach(a => {
                        optAccounts.innerHTML += `<option value="acc_${a.id}">${a.name} (R$ ${a.balance.toFixed(2)})</option>`;
                    });
                }
            }
        }
        
        if(optCards) {
            const resC = await apiFetch(`${API_URL}/credit_cards/${user_id}`);
            if(resC.ok) {
                const cards = await resC.json();
                optCards.innerHTML = '';
                if (cards.length === 0) {
                    optCards.innerHTML = '<option disabled>Nenhum cartão cadastrado</option>';
                } else {
                    cards.forEach(c => {
                        optCards.innerHTML += `<option value="card_${c.id}">${c.name} (L: R$ ${c.limit_amount.toFixed(2)})</option>`;
                    });
                }
            }
        }
    } catch(err) { console.error(err); }
}

// Chamar quando a tela carregar
document.addEventListener('DOMContentLoaded', () => {
    if(window.location.pathname === '/gasto' || window.location.pathname === '/renda') {
        loadTransactionOptions();
    }
});
// =====================================
// SESSÃO DE CATEGORIAS
// =====================================
window.loadCategories = async function() {
    const listEl = document.getElementById('categoriesList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/categories/${user_id}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error(rows.error || "Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<small style="color:var(--text-muted)">Nenhuma categoria customizada.</small>`;
            return;
        }
        
        rows.forEach(c => {
            let tipoLabel = c.type === 'income' ? 'Renda' : 'Gasto';
            listEl.innerHTML += `
            <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; position: relative; overflow: hidden;">
                <div style="position: absolute; top: 0; left: 0; bottom: 0; width: 4px; background: ${c.color}"></div>
                <div style="padding-left: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <strong style="color: var(--text-main); font-size: 1.05rem;">${c.name}</strong>
                    </div>
                    <small style="color: var(--text-muted);">Tipo: ${tipoLabel}</small>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn" style="background:transparent; color:#ef4444; padding: 8px;" onclick="deleteCategory('${c.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
        });
    } catch(err) {}
}

window.loadCategoriesOptions = async function(type) {
    const gridEl = document.querySelector('.category-grid');
    if(!gridEl) return;
    
    const user_id = getCurrentUserId();
    if(!user_id) return;
    
    try {
        const res = await apiFetch(`${API_URL}/categories/${user_id}`);
        if(!res.ok) return;
        const rows = await res.json();
        
        // Mantém as padrão e adiciona as novas
        rows.filter(c => c.type === type).forEach(c => {
            // Verifica se não existe para não duplicar (baseado no nome)
            if(!gridEl.innerHTML.includes(`'${c.name}'`)) {
                gridEl.innerHTML += `
                <div class="category-item" onclick="selectCat('${c.name}', this)">
                    <i class="${c.icon}" style="color:${c.color}"></i>
                    <span>${c.name}</span>
                </div>`;
            }
        });
    } catch(err) {}
}

window.saveCategory = async function(e) {
    e.preventDefault();
    const name = document.getElementById('catName').value;
    const type = document.getElementById('catType').value;
    const color = document.getElementById('catColor').value;
    
    try {
        const res = await apiFetch(`${API_URL}/categories`, {
            method: 'POST',
            body: JSON.stringify({name, type, color})
        });
        if (res.ok) {
            document.getElementById('categoryForm').reset();
            loadCategories();
        }
    } catch(err) {}
}

window.deleteCategory = async function(id) {
    if(!confirm("Excluir categoria?")) return;
    try {
        const res = await apiFetch(`${API_URL}/categories/${id}`, { method: 'DELETE' });
        if(res.ok) loadCategories();
    } catch(er) {}
}

// =====================================
// SESSÃO DE COMPARTILHAMENTO
// =====================================
window.loadSharedAccess = async function() {
    const listEl = document.getElementById('sharedAccessList');
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/shared_access/${user_id}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if(rows.length === 0) {
            listEl.innerHTML = `<small style="color:var(--text-muted)">Nenhum convidado.</small>`;
            return;
        }
        
        rows.forEach(s => {
            listEl.innerHTML += `
            <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="display:block; font-size: 0.9rem;">${s.guest_email}</strong>
                    <small style="color:var(--text-muted)">Status: ${s.status}</small>
                </div>
                <button class="btn" style="background:transparent; color:#fca5a5; padding:0; border:none;" onclick="deleteSharedAccess('${s.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        });
    } catch(err) {}
}

window.saveSharedAccess = async function(e) {
    e.preventDefault();
    const guest_email = document.getElementById('shareEmail').value;
    
    try {
        const res = await apiFetch(`${API_URL}/shared_access`, {
            method: 'POST',
            body: JSON.stringify({guest_email})
        });
        if (res.ok) {
            document.getElementById('sharedAccessForm').reset();
            loadSharedAccess();
            alert("Acesso compartilhado criado! Peça para o convidado criar uma conta com o mesmo e-mail.");
        }
    } catch(err) {}
}

window.deleteSharedAccess = async function(id) {
    if(!confirm("Remover o acesso deste convidado?")) return;
    try {
        const res = await apiFetch(`${API_URL}/shared_access/${id}`, { method: 'DELETE' });
        if(res.ok) loadSharedAccess();
    } catch(er) {}
}
// =====================================
// SESSÃO DE LEITOR DE NOTA FISCAL
// =====================================
let html5QrcodeScanner = null;

window.openInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if(modal) modal.style.display = 'flex';
}

window.closeInvoiceModal = function() {
    const modal = document.getElementById('invoiceModal');
    if(modal) {
        modal.style.display = 'none';
        stopQRScanner();
        document.getElementById('xmlFileInput').value = "";
    }
}

window.startQRScanner = function() {
    const container = document.getElementById('qrReaderContainer');
    if(!container) return;
    
    container.style.display = 'block';
    
    if(!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("qr-reader");
    }
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess)
    .catch(err => {
        alert("Erro ao abrir a câmera: " + err);
        container.style.display = 'none';
    });
}

window.stopQRScanner = function() {
    if(html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            document.getElementById('qrReaderContainer').style.display = 'none';
        }).catch(err => {
            console.error("Falha ao parar scanner", err);
        });
    }
}

function onScanSuccess(decodedText, decodedResult) {
    stopQRScanner();
    document.getElementById('invoiceLoading').style.display = 'block';
    
    apiFetch(`${API_URL}/invoice/qrcode`, {
        method: 'POST',
        body: JSON.stringify({url: decodedText})
    })
    .then(res => res.json())
    .then(data => processInvoiceData(data))
    .catch(err => {
        alert("Erro ao ler QR Code: " + err);
        document.getElementById('invoiceLoading').style.display = 'none';
    });
}

window.handleXMLUpload = function(event) {
    const file = event.target.files[0];
    if(!file) return;
    
    document.getElementById('invoiceLoading').style.display = 'block';
    
    const formData = new FormData();
    formData.append("file", file);
    
    const token = localStorage.getItem('ff_token');
    
    fetch(`${API_URL}/invoice/xml`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    })
    .then(res => res.json())
    .then(data => processInvoiceData(data))
    .catch(err => {
        alert("Erro ao processar arquivo XML: " + err);
        document.getElementById('invoiceLoading').style.display = 'none';
    });
}

function processInvoiceData(data) {
    document.getElementById('invoiceLoading').style.display = 'none';
    
    if(data.error) {
        alert("Falha: " + data.error);
        return;
    }
    
    // Auto preencher o formulário
    if(document.getElementById('amount')) document.getElementById('amount').value = data.amount.toFixed(2);
    if(document.getElementById('desc')) document.getElementById('desc').value = data.description;
    
    // Auto categorizar
    if(data.category && document.getElementById('transCat')) {
        document.getElementById('transCat').value = data.category;
        // Atualizar interface de categoria se existir
        if(typeof updateCatGrid === 'function') updateCatGrid();
    }
    
    closeInvoiceModal();
    alert(`Nota lida com sucesso!\nValor: R$ ${data.amount.toFixed(2)}\nCategoria sugerida: ${data.category}`);
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

// =====================================
// SESSÃO DO ASSISTENTE DE SALÁRIO
// =====================================
window.openSalaryWizard = function() {
    document.getElementById('salaryWizardModal').style.display = 'flex';
    document.getElementById('salaryWizardForm').reset();
    updateWizardFields();
}

window.closeSalaryWizard = function() {
    document.getElementById('salaryWizardModal').style.display = 'none';
}

window.updateWizardFields = function() {
    const type = document.getElementById('wizSalaryType').value;
    const day1Container = document.getElementById('wizDay1Container');
    const day2Container = document.getElementById('wizDay2Container');
    const labelDay1 = document.getElementById('wizDay1Label');
    
    if (type === 'Fixo') {
        day1Container.style.display = 'block';
        labelDay1.innerText = 'Dia do Pagamento';
        day2Container.style.display = 'none';
    } else if (type === 'Quinzenal') {
        day1Container.style.display = 'block';
        labelDay1.innerText = 'Dia da 1ª Parte (A 2ª será calculada +15 dias)';
        day2Container.style.display = 'none';
    } else if (type === 'DuasDatas') {
        day1Container.style.display = 'block';
        labelDay1.innerText = 'Dia da 1ª Parte';
        day2Container.style.display = 'block';
        toggleWizDay2Input();
    }
}

window.toggleWizDay2Input = function() {
    const isLastDay = document.getElementById('wizIsLastDay').checked;
    const day2InputGroup = document.getElementById('wizDay2InputGroup');
    const day2Input = document.getElementById('wizDay2');
    
    if (isLastDay) {
        day2InputGroup.style.display = 'none';
        day2Input.removeAttribute('required');
    } else {
        day2InputGroup.style.display = 'block';
        day2Input.setAttribute('required', 'true');
    }
}

window.submitSalaryWizard = async function(e) {
    e.preventDefault();
    const user_id = getCurrentUserId();
    const amount = parseFloat(document.getElementById('wizSalaryAmnt').value);
    const type = document.getElementById('wizSalaryType').value;
    const day1 = parseInt(document.getElementById('wizDay1').value);
    
    let parts = [];
    
    if (type === 'Fixo') {
        parts.push({ day: day1, amount: amount, desc: 'Salário' });
    } else if (type === 'Quinzenal') {
        let day2 = day1 + 15;
        if (day2 > 30) day2 = day2 - 30; // Aproximação segura
        parts.push({ day: day1, amount: amount / 2, desc: 'Salário - 1ª Quinzena' });
        parts.push({ day: day2, amount: amount / 2, desc: 'Salário - 2ª Quinzena' });
    } else if (type === 'DuasDatas') {
        const isLastDay = document.getElementById('wizIsLastDay').checked;
        const day2 = isLastDay ? 31 : parseInt(document.getElementById('wizDay2').value);
        parts.push({ day: day1, amount: amount / 2, desc: 'Salário - Adiantamento' });
        parts.push({ day: day2, amount: amount / 2, desc: 'Salário - Pagamento Final' });
    }
    
    try {
        for (let p of parts) {
            await apiFetch(`${API_URL}/transactions`, {
                method: 'POST',
                body: JSON.stringify({
                    user_id: user_id,
                    type: 'income',
                    description: p.desc,
                    amount: p.amount,
                    category: 'Renda',
                    frequency: 'Mensal',
                    payment_day: p.day
                })
            });
        }
        
        alert('Salário configurado com sucesso!');
        closeSalaryWizard();
        if (typeof loadTransactions === 'function') loadTransactions('income');
    } catch (err) {
        alert('Erro ao configurar salário automático.');
    }
}


// =====================================
// CARROSSEL DO DASHBOARD
// =====================================
window.toggleDashboardSlider = function(direction) {
    const cards = document.querySelectorAll('.stats-grid .stat-card');
    if(cards.length < 5) return;
    if(direction === 'next') {
        cards[0].style.display = 'none';
        cards[4].style.display = 'block';
        document.getElementById('btnNextDashboard').style.display = 'none';
        document.getElementById('btnPrevDashboard').style.display = 'block';
    } else {
        cards[0].style.display = 'block';
        cards[4].style.display = 'none';
        document.getElementById('btnNextDashboard').style.display = 'block';
        document.getElementById('btnPrevDashboard').style.display = 'none';
    }
}


// =====================================
// SESSO DE CATEGORIAS CUSTOMIZADAS
// =====================================

async function loadCategories() {
    const listEl = document.getElementById("categoriesList");
    if(!listEl) return;
    const user_id = getCurrentUserId();
    
    try {
        const res = await apiFetch(`${API_URL}/categories/${user_id}`);
        const rows = await res.json();
        
        listEl.innerHTML = "";
        if (!res.ok) throw new Error("Erro ao carregar");
        if(rows.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color: var(--text-muted); padding: 2rem;">Voc ainda no criou categorias customizadas.</div>`;
            return;
        }
        
        rows.forEach(c => {
            const iconColor = c.type === "expense" ? "var(--danger-red)" : "var(--primary-green)";
            listEl.innerHTML += `
            <div style="background: var(--card-bg); border-radius: 8px; padding: 1rem; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: ${c.color}20; color: ${c.color}; font-size: 1.2rem;">
                        <i class="fa-solid ${c.icon}"></i>
                    </div>
                    <div>
                        <strong style="color: var(--text-main); display: block;">${c.name}</strong>
                        <small style="color: var(--text-muted);">${c.type === "expense" ? "Gasto" : "Renda"}</small>
                    </div>
                </div>
                <button class="btn" style="background: rgba(244, 63, 94, 0.1); color: var(--danger-red); width: auto; padding: 6px 12px;" onclick="deleteCategory(${c.id})"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        });
    } catch(err) {
        listEl.innerHTML = `<div style="text-align:center; color: red;">Erro ao carregar categorias.</div>`;
    }
}

async function saveCategory(e) {
    e.preventDefault();
    const user_id = getCurrentUserId();
    const name = document.getElementById("catName").value;
    const type = document.getElementById("catType").value;
    const color = document.getElementById("catColor").value;
    
    try {
        const res = await apiFetch(`${API_URL}/categories`, {
            method: "POST",
            body: JSON.stringify({ name, type, color, icon: "fa-tag" })
        });
        if (res.ok) {
            alert("Categoria cadastrada com sucesso!");
            e.target.reset();
            loadCategories();
        } else {
            alert("Erro ao cadastrar.");
        }
    } catch (err) {
        alert("Falha na rede.");
    }
}

async function deleteCategory(id) {
    if(!confirm("Excluir categoria permanentemente? (Isso no altera transaes j salvas com esse nome)")) return;
    try {
        const res = await apiFetch(`${API_URL}/categories/${id}`, { method: "DELETE" });
        if(res.ok) loadCategories();
        else alert("Erro ao excluir.");
    } catch(er) { alert("Falha na rede."); }
}

async function loadCategoriesOptions(type = "expense") {
    const user_id = getCurrentUserId();
    try {
        const res = await apiFetch(`${API_URL}/categories/${user_id}`);
        if(res.ok) {
            const rows = await res.json();
            const filtered = rows.filter(r => r.type === type);
            
            const selectEl = document.getElementById("transCat");
            const gridEl = document.getElementById("catGrid");
            
            if(selectEl) {
                // Remove existing custom options before "Outros" to avoid duplicates if re-rendered
                const currentOptions = Array.from(selectEl.options);
                const defaultVals = ["Alimentao", "Transporte", "Moradia", "Lazer", "Contas", "Compras", "Outros"];
                currentOptions.forEach(opt => {
                    if(!defaultVals.includes(opt.value)) opt.remove();
                });
                
                // Insert before the last element (Outros)
                const lastOption = selectEl.options[selectEl.options.length - 1];
                filtered.forEach(c => {
                    const opt = document.createElement("option");
                    opt.value = c.name;
                    opt.text = c.name;
                    selectEl.insertBefore(opt, lastOption);
                });
            }
            
            if(gridEl) {
                // Remove custom items before appending
                const currentItems = Array.from(gridEl.querySelectorAll(".category-item.custom-cat"));
                currentItems.forEach(i => i.remove());
                
                // Get the "Outros" item
                const outrosItem = gridEl.lastElementChild;
                
                filtered.forEach(c => {
                    const div = document.createElement("div");
                    div.className = "category-item custom-cat";
                    div.dataset.val = c.name;
                    div.onclick = function() { selectCat(c.name, this); };
                    div.innerHTML = `<i class="fa-solid ${c.icon}" style="color:${c.color}"></i><span>${c.name}</span>`;
                    gridEl.insertBefore(div, outrosItem);
                });
            }
        }
    } catch(e) {}
}

