const sass = require('./node_modules/sass');
const fs = require('fs');
const path = require('path');
const result = sass.compile(path.join(__dirname, 'src/webview/styles/main.scss'));
fs.writeFileSync(path.join(__dirname, 'resources/webview/style.css'), result.css);
console.log('SCSS compiled OK');
