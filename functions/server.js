require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, doc, query, where, setDoc } = require('firebase/firestore');
const CryptoJS = require('crypto-js');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDyNqXm5ip2tBQDHTDpOFspLZgTWdtZxXU",
  authDomain: "gerenciaacessos.firebaseapp.com",
  projectId: "gerenciaacessos",
  storageBucket: "gerenciaacessos.firebasestorage.app",
  messagingSenderId: "326464596569",
  appId: "1:326464596569:web:480124eda7b8fac9449f48",
  measurementId: "G-WTTPKPTXF4"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Chave de criptografia
const ENCRYPTION_KEY = "CTPJESUSATEULALALA";

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Servidor está rodando' });
});

// Store encrypted key
app.post('/keys', async (req, res) => {
  try {
    const { key, name } = req.body;
    if (!key || !name) {
      return res.status(400).json({ error: 'Chave e nome são obrigatórios' });
    }

    const encryptedKey = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString();
    const keyDoc = {
      name,
      encryptedKey,
      createdAt: new Date()
    };

    const docRef = await addDoc(collection(db, 'encrypted_keys'), keyDoc);
    res.status(201).json({ message: 'Chave armazenada com sucesso', id: docRef.id });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get keys
app.get('/keys', async (req, res) => {
  try {
    const { name } = req.query;
    let querySnapshot;

    if (name) {
      const q = query(collection(db, 'encrypted_keys'), where('name', '==', name));
      querySnapshot = await getDocs(q);
    } else {
      querySnapshot = await getDocs(collection(db, 'encrypted_keys'));
    }

    const keys = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      keys.push({
        id: doc.id,
        name: data.name,
        encryptedKey: data.encryptedKey,
        createdAt: data.createdAt
      });
    });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Update key
app.put('/keys/:id', async (req, res) => {
  try {
    const { key, name } = req.body;
    if (!key || !name) {
      return res.status(400).json({ error: 'Chave e nome são obrigatórios' });
    }

    const docRef = doc(db, 'encrypted_keys', req.params.id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Chave não encontrada' });
    }

    const encryptedKey = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString();
    const updateData = {
      name,
      encryptedKey,
      updatedAt: new Date()
    };

    await setDoc(docRef, updateData, { merge: true });
    res.json({ 
      message: 'Chave atualizada com sucesso', 
      id: req.params.id,
      name: name,
      updatedAt: updateData.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Delete key
app.delete('/keys/:id', async (req, res) => {
  try {
    const docRef = doc(db, 'encrypted_keys', req.params.id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ error: 'Chave não encontrada' });
    }

    const keyData = docSnap.data();
    await deleteDoc(docRef);
    
    res.json({ 
      message: 'Chave deletada com sucesso',
      id: req.params.id,
      name: keyData.name,
      deletedAt: new Date()
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Decrypt endpoint
app.post('/decrypt', async (req, res) => {
  try {
    const { secretKey, name } = req.body;
    if (!secretKey) {
      return res.status(400).json({ error: 'Chave secreta é obrigatória' });
    }

    let querySnapshot;
    if (name) {
      const q = query(collection(db, 'encrypted_keys'), where('name', '==', name));
      querySnapshot = await getDocs(q);
    } else {
      querySnapshot = await getDocs(collection(db, 'encrypted_keys'));
    }

    const keys = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      try {
        const decryptedKey = CryptoJS.AES.decrypt(data.encryptedKey, secretKey).toString(CryptoJS.enc.Utf8);
        keys.push({
          id: doc.id,
          name: data.name,
          key: decryptedKey,
          createdAt: data.createdAt
        });
      } catch (error) {
        keys.push({
          id: doc.id,
          name: data.name,
          error: 'Falha ao descriptografar com a chave fornecida',
          createdAt: data.createdAt
        });
      }
    });
    
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Netlify serverless function handler
exports.handler = async function(event, context) {
  // Parse the event body if it exists
  if (event.body) {
    try {
      event.body = JSON.parse(event.body);
    } catch (e) {
      // If parsing fails, keep the body as is
    }
  }

  // Create a mock request object
  const req = {
    method: event.httpMethod,
    path: event.path.replace('/.netlify/functions/server', ''),
    query: event.queryStringParameters || {},
    body: event.body,
    params: event.pathParameters || {}
  };

  // Create a mock response object
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      return {
        statusCode: this.statusCode || 200,
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json'
        }
      };
    }
  };

  // Handle the request using Express
  try {
    const result = await new Promise((resolve, reject) => {
      app(req, res, (err) => {
        if (err) reject(err);
        resolve(res.json());
      });
    });
    return result;
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro interno do servidor' }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
}; 