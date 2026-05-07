import os
import glob

html_dir = r'c:\Users\dayvid.V\OneDrive\Documentos\FF\frontend\html'
files = glob.glob(os.path.join(html_dir, '*.html'))

for file in files:
    with open(file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    for line in lines:
        if 'href="/boletos"' not in line and "href='/boletos'" not in line:
            new_lines.append(line)
            
    with open(file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
