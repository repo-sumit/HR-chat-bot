// Publish only the landing page, never backend files or the policy index.
const fs = require('node:fs');
const base = (process.env.API_BASE_URL || 'https://hr-chat-bot-jr1z.onrender.com').replace(/\/$/, '');
const url = new URL(base);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('API_BASE_URL must be an HTTP(S) origin without credentials, query or path');
}
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = fs.readFileSync('index.html', 'utf8').replace('https://hr-chat-bot-jr1z.onrender.com/widget.js', escape(base + '/widget.js'));
fs.mkdirSync('dist', {recursive: true});
fs.writeFileSync('dist/index.html', html);
console.log('Built frontend; backend URL:', base);
