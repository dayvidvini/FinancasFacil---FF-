import os, glob

html_files = glob.glob('frontend/html/*.html')
for f in html_files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    if '<link rel="manifest"' not in content:
        # PWA Tags
        pwa_tags = '''
    <!-- PWA Manifest -->
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#4f46e5">
'''
        content = content.replace('</head>', pwa_tags + '</head>')
        
        # PWA Service Worker Registration
        sw_script = '''
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registered!', reg);
          }).catch(err => console.log('SW registration failed', err));
        });
      }
    </script>
'''
        content = content.replace('</body>', sw_script + '</body>')

        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
print('PWA tags injected in HTML files.')
