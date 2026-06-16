import { defaultLightColors, defaultDarkColors } from './themeDefaults';

export function prepareHtmlSrcDoc(content: string, isDark: boolean): string {
  const colors = isDark ? defaultDarkColors : defaultLightColors;
  const themeCss = `
    html, body {
      margin: 0;
      padding: 0;
      background-color: ${colors.bgPrimary};
      color: ${colors.textPrimary};
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      user-select: text;
      -webkit-user-select: text;
    }
    a { color: ${colors.primary}; }
    a:visited { color: ${colors.primaryText}; }
    ::selection { background-color: ${colors.editorSelection}; }
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

  // If content already looks like a full HTML document, inject theme style into <head>
  if (/<html[\s\S]*?>|<!DOCTYPE[\s\S]*?>/i.test(content)) {
    if (/<\/head>/i.test(content)) {
      return content.replace(/<\/head>/i, `<style data-te-preview-artifact="1">${themeCss}</style>${linkInterceptor}</head>`);
    }
    if (/<body/i.test(content)) {
      return content.replace(/<body/i, `<head><style data-te-preview-artifact="1">${themeCss}</style>${linkInterceptor}</head><body`);
    }
    if (/<html/i.test(content)) {
      return content.replace(/<html[^>]*>/i, `<html><head><style data-te-preview-artifact="1">${themeCss}</style>${linkInterceptor}</head>`);
    }
    return `<!DOCTYPE html><html><head><style data-te-preview-artifact="1">${themeCss}</style>${linkInterceptor}</head>${content}</html>`;
  }

  // Fragment: wrap into a full document
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style data-te-preview-artifact="1">${themeCss}</style>
${linkInterceptor}
</head>
<body>
${content}
</body>
</html>`;
}
