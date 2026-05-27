#!/usr/bin/env node
// SMTP-to-Resend relay. Listens on :1025, forwards via Resend HTTP API.
// No external dependencies — pure Node.js built-ins only.

const net = require('net');
const https = require('https');

const API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDR = process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME || '';
const PORT = 1025;

if (!API_KEY) {
  console.error('RESEND_API_KEY not set — relay will accept but not send');
}

function parseEmail(raw) {
  const nlnl = raw.search(/\r?\n\r?\n/);
  const headerBlock = nlnl >= 0 ? raw.slice(0, nlnl) : raw;
  const bodyBlock = nlnl >= 0 ? raw.slice(nlnl).replace(/^\r?\n/, '') : '';

  const headers = {};
  let current = '';
  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^\s/.test(line) && current) {
      headers[current] += ' ' + line.trim();
    } else {
      const m = line.match(/^([^:]+):\s*(.*)/);
      if (m) { current = m[1].toLowerCase(); headers[current] = m[2]; }
    }
  }

  const subject = headers['subject'] || '(no subject)';
  const ct = headers['content-type'] || '';
  let html = '';
  let text = '';

  const boundaryMatch = ct.match(/boundary=["']?([^"';\s]+)["']?/i);
  if (boundaryMatch) {
    const b = boundaryMatch[1];
    const parts = raw.split(new RegExp('--' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const part of parts) {
      const pnl = part.search(/\r?\n\r?\n/);
      if (pnl < 0) continue;
      const pHeaders = part.slice(0, pnl).toLowerCase();
      const pBody = part.slice(pnl).replace(/^\r?\n/, '').replace(/\r?\n$/, '').replace(/--$/, '').trim();
      if (pHeaders.includes('text/html')) html = pBody;
      else if (pHeaders.includes('text/plain') && !html) text = pBody;
    }
  } else if (ct.includes('text/html')) {
    html = bodyBlock;
  } else {
    text = bodyBlock;
  }

  return { subject, html: html || `<pre>${text}</pre>`, text };
}

function resendSend(from, to, rawData) {
  if (!API_KEY) { console.warn('No RESEND_API_KEY — dropping email to', to); return; }
  const { subject, html, text } = parseEmail(rawData);
  const fromField = FROM_NAME ? `${FROM_NAME} <${FROM_ADDR}>` : FROM_ADDR;
  const payload = JSON.stringify({ from: fromField, to, subject, html, text: text || undefined });

  const req = https.request({
    hostname: 'api.resend.com',
    port: 443,
    path: '/emails',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  }, res => {
    let body = '';
    res.on('data', c => (body += c));
    res.on('end', () => console.log(`[relay] Resend ${res.statusCode} → ${to}: ${body}`));
  });
  req.on('error', e => console.error('[relay] Resend request error:', e.message));
  req.write(payload);
  req.end();
}

const server = net.createServer(socket => {
  let from = '';
  let to = [];
  let rawData = '';
  let inData = false;
  let buf = '';

  socket.write('220 relay ESMTP\r\n');

  socket.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\r\n');
    buf = lines.pop();

    for (const line of lines) {
      if (inData) {
        if (line === '.') {
          inData = false;
          socket.write('250 OK\r\n');
          resendSend(from, to, rawData);
          from = ''; to = []; rawData = '';
        } else {
          rawData += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
        }
      } else {
        const cmd = line.toUpperCase().trimStart();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) {
          socket.write('250-relay\r\n250-AUTH PLAIN LOGIN\r\n250-PIPELINING\r\n250 OK\r\n');
        } else if (cmd.startsWith('AUTH')) {
          socket.write('235 OK\r\n');
        } else if (cmd.startsWith('MAIL FROM:')) {
          from = line.match(/<([^>]+)>/)?.[1] || FROM_ADDR;
          socket.write('250 OK\r\n');
        } else if (cmd.startsWith('RCPT TO:')) {
          const r = line.match(/<([^>]+)>/)?.[1];
          if (r) to.push(r);
          socket.write('250 OK\r\n');
        } else if (cmd === 'DATA') {
          inData = true;
          socket.write('354 Go ahead\r\n');
        } else if (cmd === 'QUIT') {
          socket.write('221 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    }
  });

  socket.on('error', () => {});
});

server.listen(PORT, '127.0.0.1', () => console.log(`[relay] SMTP relay listening on 127.0.0.1:${PORT}`));
