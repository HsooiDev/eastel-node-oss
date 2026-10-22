const fs = require('fs');
const path = require('path');

const replacements = [
  { from: /\btext-foreground-muted\b/g, to: 'text-on-surface-variant' },
  { from: /\btext-foreground\b/g, to: 'text-on-surface' },
  { from: /\bbg-surface-hover\b/g, to: 'bg-surface-container-high' },
  { from: /\bbg-surface\b/g, to: 'bg-surface-container' },
  { from: /\bborder-border\b/g, to: 'border-outline-variant' },
  { from: /\bborder-border-strong\b/g, to: 'border-outline' },
  { from: /\bbg-accent\b/g, to: 'bg-primary' },
  { from: /\btext-accent\b/g, to: 'text-primary' },
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      for (const { from, to } of replacements) {
        content = content.replace(from, to);
      }
      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Migrated:', fullPath);
      }
    }
  }
}

processDir(path.join(__dirname, 'app', 'hs'));
processDir(path.join(__dirname, 'components', 'admin'));
