import os
import glob

html_dir = r"c:\Users\dayvid.santos\Documents\FF\frontend\html"
html_files = glob.glob(os.path.join(html_dir, "*.html"))

for filepath in html_files:
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Se já tem Investimentos, pula
    if '<a href="/investimentos"' in content:
        continue

    # Adiciona os links depois de Projetos Futuros
    old_proj = '<a href="/projetos" class="nav-item"><i class="fa-solid fa-rocket"></i> Projetos Futuros</a>'
    new_proj = '<a href="/projetos" class="nav-item"><i class="fa-solid fa-rocket"></i> Projetos Futuros</a>\n                <a href="/investimentos" class="nav-item"><i class="fa-solid fa-chart-line"></i> Investimentos</a>'
    
    old_proj_active = '<a href="/projetos" class="nav-item active"><i class="fa-solid fa-rocket"></i> Projetos Futuros</a>'
    new_proj_active = '<a href="/projetos" class="nav-item active"><i class="fa-solid fa-rocket"></i> Projetos Futuros</a>\n                <a href="/investimentos" class="nav-item"><i class="fa-solid fa-chart-line"></i> Investimentos</a>'

    if '<a href="/investimentos"' not in content:
        content = content.replace(old_proj, new_proj)
        content = content.replace(old_proj_active, new_proj_active)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

print("Sidebar patched successfully!")
