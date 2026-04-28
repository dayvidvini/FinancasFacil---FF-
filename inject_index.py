import sys

with open('frontend/html/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

btn_str = '<button type="submit" class="btn btn-primary" style="width: 100%;">Entrar na Conta</button>'
new_btn = btn_str + '\n                <div style="text-align:center; margin-top:15px;">\n                    <a href="#" onclick="handleForgotPassword(event)" style="color: var(--primary-color); text-decoration: none; font-size: 0.9rem;">Esqueci minha senha</a>\n                </div>'
c = c.replace(btn_str, new_btn)

with open('frontend/html/index.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('Added forgot password link to index.html')
