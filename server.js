const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;

webpush.setVapidDetails('mailto:parts@southvalleyequipment.com', VAPID_PUBLIC, VAPID_PRIVATE);

let subscriptions = [];

app.get('/', (req, res) => res.send('SVE Push Server Running'));

app.get('/vapid-public-key', (req, res) => res.json({ key: VAPID_PUBLIC }));

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  const exists = subscriptions.find(s => s.endpoint === sub.endpoint);
  if (!exists) subscriptions.push(sub);
  res.json({ ok: true });
});

app.post('/notify', (req, res) => {
  const { title, body } = req.body;
  const payload = JSON.stringify({ title, body });
  const dead = [];
  Promise.allSettled(subscriptions.map(sub =>
    webpush.sendNotification(sub, payload).catch(e => {
      if (e.statusCode === 410) dead.push(sub.endpoint);
    })
  )).then(() => {
    subscriptions = subscriptions.filter(s => !dead.includes(s.endpoint));
    res.json({ ok: true, sent: subscriptions.length });
  });
});

app.listen(process.env.PORT || 3000, () => console.log('Push server live'));
