import os
import glob

html_dir = r'c:\Users\dayvid.V\OneDrive\Documentos\FF\frontend\html'
files = glob.glob(os.path.join(html_dir, '*.html'))

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if '/boletos' not in content and 'nav-menu' in content:
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            new_lines.append(line)
            if 'href="/contas"' in line or "href='/contas'" in line:
                spaces = len(line) - len(line.lstrip())
                new_line = ' ' * spaces + '<a href="/boletos" class="nav-item"><i class="fa-solid fa-barcode"></i> Boletos</a>'
                new_lines.append(new_line)
        
        with open(file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(new_lines))
