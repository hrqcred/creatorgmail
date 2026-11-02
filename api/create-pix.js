const crypto = require('crypto');

const SYNCPAY_BASE = 'https://api.syncpayments.com.br';
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE || '';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/auth-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });

  if (!res.ok) throw new Error(`Auth falhou (${res.status})`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

function randomName() {
  const f = ['Joao', 'Maria', 'Pedro', 'Ana', 'Lucas', 'Julia', 'Carlos', 'Fernanda', 'Rafael', 'Camila'];
  const l = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Ferreira', 'Costa', 'Pereira', 'Almeida', 'Rocha'];
  return `${f[Math.floor(Math.random() * f.length)]} ${l[Math.floor(Math.random() * l.length)]}`;
}

function randomPhone() {
  const ddd = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '92'];
  return ddd[Math.floor(Math.random() * ddd.length)] + '9' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

// In-memory store (resets on cold start — works for short-lived polling)
const orders = global.__orders || (global.__orders = new Map());

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, cpf } = req.body;
    if (!email || !cpf) return res.status(400).json({ error: 'Email e CPF são obrigatórios' });

    const cleanCpf = cpf.replace(/\D/g, '');
    const token = await getToken();

    const body = {
      amount: 19.90,
      description: 'Ads Automações - Gmail Creator',
      client: { name: randomName(), cpf: cleanCpf, email, phone: randomPhone() },
    };
    if (WEBHOOK_BASE) body.webhook_url = `${WEBHOOK_BASE}/api/webhook`;

    const pixRes = await fetch(`${SYNCPAY_BASE}/api/partner/v1/cash-in`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const pixData = await pixRes.json();
    console.log('SyncPay response:', pixRes.status, JSON.stringify(pixData));
    if (!pixRes.ok || !pixData.pix_code) {
      const errorDetail = pixData.errors ? JSON.stringify(pixData.errors) : pixData.message;
      return res.status(500).json({ error: errorDetail || 'Erro ao gerar PIX' });
    }

    orders.set(pixData.identifier, { email, cpf: cleanCpf, status: 'pending', createdAt: new Date() });

    res.json({ success: true, orderId: pixData.identifier, pixCode: pixData.pix_code });
  } catch (err) {
    console.error('Erro:', err.message);
    res.status(500).json({ error: 'Erro ao gerar pagamento' });
  }
};
