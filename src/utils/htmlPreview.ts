export function prepareHtmlSrcDoc(content: string, _isDark: boolean): string {
  const scrollbarCss = `
    html, body {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    *::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
  `;

  const linkInterceptor = `
    <script data-te-preview-artifact="1">
      (function(){
        document.addEventListener('click', function(e){
          var a = e.target.closest('a');
          if (!a) return;
          var href = a.getAttribute('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            e.preventDefault();
          }
        });
      })();
    </script>
  `;
  const artifacts = `<style data-te-preview-artifact="1">${scrollbarCss}</style>${linkInterceptor}`;

  // If content already looks like a full HTML document, inject non-visual helpers into <head>.
  if (/<html[\s\S]*?>|<!DOCTYPE[\s\S]*?>/i.test(content)) {
    if (/<\/head>/i.test(content)) {
      return content.replace(/<\/head>/i, `${artifacts}</head>`);
    }
    if (/<html[\s\S]*?>/i.test(content)) {
      if (/<body/i.test(content)) {
        return content.replace(/<body/i, `<head>${artifacts}</head><body`);
      }
      return content.replace(/<html[\s\S]*?>/i, (htmlTag) => `${htmlTag}<head>${artifacts}</head>`);
    }

    const doctypeMatch = content.match(/^\s*<!DOCTYPE[^>]*>/i);
    const doctype = doctypeMatch?.[0] ?? '<!DOCTYPE html>';
    const bodyContent = doctypeMatch ? content.slice(doctypeMatch[0].length) : content;
    if (/<body/i.test(bodyContent)) {
      return `${doctype}<html>${bodyContent.replace(/<body/i, `<head>${artifacts}</head><body`)}</html>`;
    }
    return `${doctype}<html><head>${artifacts}</head><body>${bodyContent}</body></html>`;
  }

  // Fragment: wrap into a full document
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${artifacts}
</head>
<body>
${content}
</body>
</html>`;
}
