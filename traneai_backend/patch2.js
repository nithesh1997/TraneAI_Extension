const fs = require('fs');
const file = '/home/finsurge.local/godwinjoseph.devabal/Documents/Extention/TraneAI_Extension/traneai_backend/src/controllers/workspaceController.ts';
let content = fs.readFileSync(file, 'utf8');

const replacement = `  const fs = require('fs');
  const path = require('path');
  
  const viewsDir = path.join(__dirname, '..', 'views', 'admin-grid');
  const htmlTemplate = fs.readFileSync(path.join(viewsDir, 'index.html'), 'utf8');
  const styleCss = fs.readFileSync(path.join(viewsDir, 'style.css'), 'utf8');
  const appJs = fs.readFileSync(path.join(viewsDir, 'app.js'), 'utf8');
  
  const finalHtml = htmlTemplate
    .replace(/\\$\\{nonce\\}/g, nonce)
    .replace(/\\$\\{projectName\\}/g, projectName)
    .replace(/\\$\\{styleCss\\}/g, styleCss)
    .replace(/\\$\\{appJs\\}/g, appJs);
    
  res.send(finalHtml);`;

content = content.substring(0, content.indexOf('  const template = "<!DOCTYPE html>')) + replacement + content.substring(content.indexOf('  res.send(finalHtml);\n}') + 23);

fs.writeFileSync(file, content, 'utf8');
console.log('Replaced');
