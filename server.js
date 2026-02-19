const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
const MONGO_URI     = process.env.MONGO_URI;

webpush.setVapidDetails('mailto:parts@southvalleyequipment.com', VAPID_PUBLIC, VAPID_PRIVATE);

let db;
let subscriptions = [];

async function connectDB() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db('sve_parts');
  console.log('MongoDB connected');
}

// ---- HEALTH ----
app.get('/', (req, res) => res.send('SVE Push Server Running'));

// ---- PUSH ----
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

// ---- REQUESTS ----
// Get all requests
app.get('/requests', async (req, res) => {
  try {
    const requests = await db.collection('requests').find({}).sort({ updatedAt: -1 }).toArray();
    res.json(requests);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Create new request
app.post('/requests', async (req, res) => {
  try {
    const doc = { ...req.body, createdAt: Date.now(), updatedAt: Date.now() };
    const result = await db.collection('requests').insertOne(doc);
    res.json({ ok: true, id: result.insertedId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update request by id field (our custom string id)
app.put('/requests/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updatedAt: Date.now() };
    await db.collection('requests').updateOne(
      { id: req.params.id },
      { $set: updates },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete request
app.delete('/requests/:id', async (req, res) => {
  try {
    await db.collection('requests').deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- BANNERS ----
app.get('/banners', async (req, res) => {
  try {
    const banners = await db.collection('banners').find({}).toArray();
    res.json(banners);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/banners', async (req, res) => {
  try {
    await db.collection('banners').insertOne(req.body);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/banners/:bid', async (req, res) => {
  try {
    await db.collection('banners').deleteOne({ bid: req.params.bid });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ---- START ----
connectDB().then(() => {
  app.listen(process.env.PORT || 3000, () => console.log('Push server live'));
}).catch(e => {
  console.error('DB connection failed:', e);
  process.exit(1);
});
