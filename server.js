
require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// --- SECURITY MIDDLEWARES ---
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate Limiter - 1 minute me 100 request se zyada nahi
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: "Bohat zyada requests, 1 minute ruk jao" }
});
app.use(limiter);

// API KEY Security
const verifyApiKey = (req, res, next) => {
  // id verify wala route public rakhna hai to usko skip kar denge
  if (req.path === '/' && req.method === 'GET') {
    return next();
  }
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: "Unauthorized - API KEY galat hai" });
  }
  next();
};
app.use(verifyApiKey);

// --- FIREBASE INIT ---
// Option 1: Agar serviceAccountKey.json file hai
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.DATABASE_URL
  });
} catch (e) {
  // Option 2: Agar env me hai to
  console.log("serviceAccountKey.json nahi mila, env check kar raha hun...");
  // admin.initializeApp({ ... }) yahan apna logic lagao
  // Testing ke liye bina admin ke bhi chal jayega neeche REST se
}

const db = admin.apps.length ? admin.database() : null;

// --- ROUTES ---

// 1. ID VERIFY API - Jo tumne manga tha: /?id={id} => F / NO
app.get('/', async (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).send("NO");
  }

  try {
    // Agar admin SDK connected hai to
    if (db) {
      const snapshot = await db.ref(`users/${id}`).once('value');
      if (snapshot.exists()) {
        return res.send("F");
      } else {
        return res.send("NO");
      }
    } else {
      // Bina Admin SDK ke direct REST se (quick test)
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${process.env.DATABASE_URL}/users/${id}.json`);
      const data = await response.json();
      return res.send(data ? "F" : "NO");
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("NO");
  }
});

// 2. USER ADD API
app.post('/user/add', async (req, res) => {
  const { id, name, email } = req.body;
  if (!id) return res.status(400).json({ error: "id dena zaroori hai" });

  try {
    await db.ref(`users/${id}`).set({
      name: name || "Unknown",
      email: email || "",
      createdAt: Date.now(),
      verified: true
    });
    res.json({ success: true, message: `User ${id} add ho gaya`, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. USER REMOVE API
app.delete('/user/remove', async (req, res) => {
  const { id } = req.body; // ya req.query.id se bhi le sakte ho
  if (!id) return res.status(400).json({ error: "id dena zaroori hai" });

  try {
    await db.ref(`users/${id}`).remove();
    res.json({ success: true, message: `User ${id} remove ho gaya` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API chal rahi hai http://localhost:${PORT} par`);
});
