import os
import glob

html_files = glob.glob('frontend/html/*.html')
search_str = '<a href="/configuracoes" class="nav-item"><i class="fa-solid fa-gear"></i> Configurações</a>'
replace_str = '<a href="/categorias" class="nav-item"><i class="fa-solid fa-tags"></i> Categorias</a>\n                <a href="/configuracoes" class="nav-item"><i class="fa-solid fa-gear"></i> Configurações</a>'

active_search_str = '<a href="/configuracoes" class="nav-item active"><i class="fa-solid fa-gear"></i> Configurações</a>'
active_replace_str = '<a href="/categorias" class="nav-item"><i class="fa-solid fa-tags"></i> Categorias</a>\n                <a href="/configuracoes" class="nav-item active"><i class="fa-solid fa-gear"></i> Configurações</a>'

for file in html_files:
    if "categorias.html" in file:
        continue # we already wrote this with the correct sidebar
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace(search_str, replace_str)
    new_content = new_content.replace(active_search_str, active_replace_str)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
print("Sidebar atualizada com sucesso.")
