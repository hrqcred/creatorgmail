const express = require('express');
const crypto = require('crypto');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const SYNCPAY_BASE = 'https://api.syncpayments.com.br';
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const DELIVERABLE_URL = process.env.DELIVERABLE_URL || 'https://youtube.com/SEU_LINK_AQUI';
const WEBHOOK_BASE = process.env.WEBHOOK_BASE || '';

const orders = new Map();
let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/auth-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth falhou (${res.status}): ${err}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// ── Criar cobrança PIX via SyncPay ─────────────────────
app.post('/api/create-pix', async (req, res) => {
  try {
    const { email, cpf } = req.body;
    if (!email || !cpf) {
      return res.status(400).json({ error: 'Email e CPF são obrigatórios' });
    }

    const cleanCpf = cpf.replace(/\D/g, '');
    const token = await getToken();
    const name = randomName();
    const phone = randomPhone();

    const webhookUrl = WEBHOOK_BASE ? `${WEBHOOK_BASE}/api/webhook` : undefined;

    const body = {
      amount: 19.90,
      description: 'Ads Automações - Gmail Creator',
      client: { name, cpf: cleanCpf, email, phone },
    };
    if (webhookUrl) body.webhook_url = webhookUrl;

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

    if (!pixRes.ok || !pixData.pix_code) {
      console.error('SyncPay erro:', pixData);
      return res.status(500).json({ error: pixData.message || 'Erro ao gerar PIX' });
    }

    const identifier = pixData.identifier;

    orders.set(identifier, {
      email,
      cpf: cleanCpf,
      status: 'pending',
      createdAt: new Date(),
    });

    res.json({
      success: true,
      orderId: identifier,
      pixCode: pixData.pix_code,
    });
  } catch (err) {
    console.error('Erro ao criar PIX:', err.message);
    res.status(500).json({ error: 'Erro ao gerar pagamento' });
  }
});

// ── Webhook SyncPay ────────────────────────────────────
app.post('/api/webhook', (req, res) => {
  console.log('[webhook]', JSON.stringify(req.body, null, 2));

  const identifier = req.body.identifier || req.body.id;
  const status = req.body.status;

  if (identifier && orders.has(identifier)) {
    const isPaid = ['PAID', 'paid', 'COMPLETED', 'completed', 'APPROVED', 'approved'].includes(status);
    if (isPaid) {
      orders.get(identifier).status = 'paid';
      console.log(`Pagamento confirmado: ${identifier}`);
    }
  }

  res.status(200).json({ received: true });
});

// ── Checar status ──────────────────────────────────────
app.get('/api/status/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const response = { status: order.status };
  if (order.status === 'paid') {
    response.deliverableUrl = DELIVERABLE_URL;
  }
  res.json(response);
});

function randomName() {
  const f = ['João', 'Maria', 'Pedro', 'Ana', 'Lucas', 'Julia', 'Carlos', 'Fernanda', 'Rafael', 'Camila'];
  const l = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Ferreira', 'Costa', 'Pereira', 'Almeida', 'Rocha'];
  return `${f[Math.floor(Math.random() * f.length)]} ${l[Math.floor(Math.random() * l.length)]}`;
}

function randomPhone() {
  const ddd = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '92'];
  return ddd[Math.floor(Math.random() * ddd.length)] + '9' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Webhook URL: https://<SEU_DOMINIO>/api/webhook`);
});
