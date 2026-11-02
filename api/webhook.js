const orders = global.__orders || (global.__orders = new Map());

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
};
