const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://bikes-dd699-default-rtdb.firebaseio.com/"
});

const db = admin.database();              // Realtime Database
const firestore = admin.firestore();      // Firestore

// Signup Route
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  try {
    const userRef = db.ref('users');
    const snapshot = await userRef.orderByChild('username').equalTo(username).once('value');
    if (snapshot.exists()) {
      return res.send('Username already taken. <a href="/signup.html">Try again</a>');
    }

    const newUserRef = userRef.push();
    await newUserRef.set({ username, password });
    console.log('User created:', username);
    res.redirect('/login.html');
  } catch (error) {
    console.error('Error creating user:', error);
    res.send('Error creating user. <a href="/signup.html">Try again</a>');
  }
});

// Login Route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    let authenticatedUserId = null;

    snapshot.forEach(childSnapshot => {
      const user = childSnapshot.val();
      if (user.username === username && user.password === password) {
        authenticatedUserId = childSnapshot.key;
      }
    });

    if (authenticatedUserId) {
      res.redirect(`/dashboard.html?userId=${authenticatedUserId}`);
    } else {
      res.send('Invalid credentials. <a href="/login.html">Try again</a>');
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.send('Error logging in. <a href="/login.html">Try again</a>');
  }
});

// Search Route for bikes info
app.get('/search', async (req, res) => {
  const name = req.query.name?.toLowerCase() || '';
  const userId = req.query.userId || '';

  try {
    const bikesRef = db.ref('bikes');
    const snapshot = await bikesRef.once('value');
    let foundBike = null;

    snapshot.forEach(childSnapshot => {
      const bike = childSnapshot.val();
      if (bike.name && bike.name.toLowerCase().includes(name)) {
        foundBike = bike;
      }
    });

    // Save search history in Firestore if userId is available
    if (userId && name) {
      await firestore.collection('searchHistory').add({
        userId: userId,
        searchTerm: name,
        result: foundBike ? foundBike.name : 'Not found',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Search term "${name}" stored in Firestore for user: ${userId}`);
    }

    res.json(foundBike || {});
  } catch (error) {
    console.error('Error fetching bike:', error);
    res.status(500).json({ error: 'Failed to fetch bike.' });
  }
});

// GET Search History Route
app.get('/searchHistory', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    const snapshot = await firestore
      .collection('searchHistory')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const history = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        searchTerm: data.searchTerm,
        result: data.result,
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : ''
      });
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching search history:', error);
    res.status(500).json({ error: 'Failed to fetch search history.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
