const orders = global.__orders || (global.__orders = new Map());
const DELIVERABLE_URL = process.env.DELIVERABLE_URL || 'https://youtube.com/SEU_LINK_AQUI';

module.exports = async function handler(req, res) {
  const { orderId } = req.query;
  const order = orders.get(orderId);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const response = { status: order.status };
  if (order.status === 'paid') response.deliverableUrl = DELIVERABLE_URL;

  res.json(response);
};
