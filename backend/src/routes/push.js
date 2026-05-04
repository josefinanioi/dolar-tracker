const router = require('express').Router();
const storage = require('../storage');

router.get('/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY)
    return res.status(503).json({ error: 'VAPID no configurado en el servidor' });
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription || !userId)
    return res.status(400).json({ error: 'Se requieren subscription y userId' });
  storage.upsertSubscription(userId, subscription);
  res.json({ success: true });
});

router.delete('/subscribe/:userId', (req, res) => {
  storage.removeSubscription(req.params.userId);
  res.json({ success: true });
});

module.exports = router;
