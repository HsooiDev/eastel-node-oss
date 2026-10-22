const fs = require('fs');
const path = require('path');

const phpDir = path.join(__dirname, '../eastel-website_php');
const nextDir = path.join(__dirname, 'app/[locale]');

function convertHtmlToJsx(html) {
  return html
    .replace(/class=/g, 'className=')
    .replace(/style="([^"]+)"/g, (match, styleStr) => {
      const styleObj = {};
      styleStr.split(';').forEach(rule => {
        if (!rule.trim()) return;
        const [key, value] = rule.split(':').map(s => s.trim());
        if (!key || !value) return;
        const camelKey = key.replace(/-([a-z])/g, g => g[1].toUpperCase());
        styleObj[camelKey] = value;
      });
      return `style={${JSON.stringify(styleObj)}}`;
    })
    .replace(/<br>/g, '<br />')
    .replace(/<hr>/g, '<hr />')
    .replace(/<img([^>]*[^\/])>/g, '<img$1 />')
    .replace(/<input([^>]*[^\/])>/g, '<input$1 />')
    .replace(/&nbsp;/g, '{" "}')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function processPage(phpFile, nextFolder, headingTitle) {
  const phpPath = path.join(phpDir, phpFile);
  const nextPath = path.join(nextDir, nextFolder, 'page.tsx');
  
  if (!fs.existsSync(phpPath)) {
    console.error('PHP file not found:', phpPath);
    return;
  }
  
  const content = fs.readFileSync(phpPath, 'utf8');
  const match = content.match(/<div class="terms-content">([\s\S]*?)<\/div>\s*<\/main>/);
  if (!match) {
    console.error('Could not find .terms-content in', phpFile);
    return;
  }
  
  let jsxContent = convertHtmlToJsx(match[1]);
  
  // Clean up any remaining issues that might break React
  jsxContent = jsxContent.replace(/colspan=/gi, 'colSpan=');
  jsxContent = jsxContent.replace(/rowspan=/gi, 'rowSpan=');
  
  // Read current Next.js page
  let nextPageContent = fs.readFileSync(nextPath, 'utf8');
  
  // Replace the .prose div content
  const proseRegex = /<div className="prose[^>]*>([\s\S]*?)<\/div>\s*<\/main>/;
  const newProseContent = `<div className="prose prose-gray mt-10 max-w-none text-text-secondary [&_h2]:text-text-primary [&_h2]:font-bold [&_h2]:tracking-tight">\n${jsxContent}\n</div>\n    </main>`;
  
  if (proseRegex.test(nextPageContent)) {
    nextPageContent = nextPageContent.replace(proseRegex, newProseContent);
    fs.writeFileSync(nextPath, nextPageContent, 'utf8');
    console.log(`Updated ${nextFolder}/page.tsx`);
  } else {
    console.error(`Could not find prose block in ${nextFolder}/page.tsx`);
  }
}

processPage('terms.html', 'terms', 'Terms & Conditions');
processPage('privacy-policy.html', 'privacy', 'Privacy Policy');
processPage('delivery-policy.html', 'delivery', 'Delivery Policy');
