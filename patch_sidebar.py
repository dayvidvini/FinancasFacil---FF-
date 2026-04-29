import os
import glob

html_dir = r"c:\Users\dayvid.santos\Documents\FF\frontend\html"
html_files = glob.glob(os.path.join(html_dir, "*.html"))

for filepath in html_files:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Se já tem Orçamentos, pula
    if '<a href="/orcamentos"' in content:
        continue

    # Adiciona o link do Orçamentos depois de Relatórios
    old_rel = '<a href="/relatorios" class="nav-item"><i class="fa-solid fa-chart-bar"></i> Relatórios</a>'
    new_rel = '<a href="/relatorios" class="nav-item"><i class="fa-solid fa-chart-bar"></i> Relatórios</a>\n                <a href="/orcamentos" class="nav-item"><i class="fa-solid fa-bullseye"></i> Orçamentos</a>'
    
    # Mas em alguns arquivos a classe pode estar "nav-item active"
    old_rel_active = '<a href="/relatorios" class="nav-item active"><i class="fa-solid fa-chart-bar"></i> Relatórios</a>'
    new_rel_active = '<a href="/relatorios" class="nav-item active"><i class="fa-solid fa-chart-bar"></i> Relatórios</a>\n                <a href="/orcamentos" class="nav-item"><i class="fa-solid fa-bullseye"></i> Orçamentos</a>'

    content = content.replace(old_rel, new_rel)
    content = content.replace(old_rel_active, new_rel_active)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

print("Sidebar patched successfully!")
