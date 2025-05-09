require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, doc, query, where, setDoc } = require('firebase/firestore');
const CryptoJS = require('crypto-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Chave de criptografia
const ENCRYPTION_KEY = "CTPJESUSATEULALALA";

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
app.get('/' , (req, res) => {
  res.json({ message: 'recomendo nao usar' });
});
// Test endpoint
app.get('/test', (req, res) => {
  console.log('GET /test - Testando conexão');
  res.json({ message: 'Servidor está rodando' });
});

// Store encrypted key
app.post('/keys', async (req, res) => {
  console.log('POST /keys - Recebendo nova chave');
  try {
    const { key, name } = req.body;
    if (!key || !name) {
      console.log('Erro: key ou name não fornecidos');
      return res.status(400).json({ error: 'Chave e nome são obrigatórios' });
    }

    const encryptedKey = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString();
    const keyDoc = {
      name,
      encryptedKey,
      createdAt: new Date()
    };

    console.log(`Armazenando chave: ${name}`);
    const docRef = await addDoc(collection(db, 'encrypted_keys'), keyDoc);
    console.log(`Chave armazenada com sucesso. ID: ${docRef.id}`);
    
    res.status(201).json({ message: 'Chave armazenada com sucesso', id: docRef.id });
  } catch (error) {
    console.error('Erro ao armazenar chave:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get keys (with optional name filter)
app.get('/keys', async (req, res) => {
  console.log('GET /keys - Listando chaves');
  try {
    const { name } = req.query;
    let querySnapshot;

    if (name) {
      console.log(`Buscando chaves com nome: ${name}`);
      const q = query(collection(db, 'encrypted_keys'), where('name', '==', name));
      querySnapshot = await getDocs(q);
    } else {
      console.log('Buscando todas as chaves');
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
    console.log(`Encontradas ${keys.length} chaves`);
    res.json(keys);
  } catch (error) {
    console.error('Erro ao buscar chaves:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Update key
app.put('/keys/:id', async (req, res) => {
  console.log(`PUT /keys/${req.params.id} - Atualizando chave`);
  try {
    const { key, name } = req.body;
    console.log('Dados recebidos:', { key: key ? 'Sim' : 'Não', name });
    
    if (!key || !name) {
      console.log('Erro: key ou name não fornecidos');
      return res.status(400).json({ error: 'Chave e nome são obrigatórios' });
    }

    const docRef = doc(db, 'encrypted_keys', req.params.id);
    console.log('Referência do documento criada');
    
    const docSnap = await getDoc(docRef);
    console.log('Documento encontrado:', docSnap.exists());

    if (!docSnap.exists()) {
      console.log(`Chave não encontrada: ${req.params.id}`);
      return res.status(404).json({ error: 'Chave não encontrada' });
    }

    const encryptedKey = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString();
    console.log('Chave criptografada com sucesso');

    const updateData = {
      name,
      encryptedKey,
      updatedAt: new Date()
    };
    console.log('Dados para atualização:', updateData);

    await setDoc(docRef, updateData, { merge: true });
    console.log(`Chave atualizada com sucesso: ${req.params.id}`);
    
    res.json({ 
      message: 'Chave atualizada com sucesso', 
      id: req.params.id,
      name: name,
      updatedAt: updateData.updatedAt
    });
  } catch (error) {
    console.error('Erro ao atualizar chave:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message,
      stack: error.stack
    });
  }
});

// Delete key
app.delete('/keys/:id', async (req, res) => {
  console.log(`DELETE /keys/${req.params.id} - Deletando chave`);
  try {
    const docRef = doc(db, 'encrypted_keys', req.params.id);
    console.log('Referência do documento criada');
    
    const docSnap = await getDoc(docRef);
    console.log('Documento encontrado:', docSnap.exists());

    if (!docSnap.exists()) {
      console.log(`Chave não encontrada: ${req.params.id}`);
      return res.status(404).json({ error: 'Chave não encontrada' });
    }

    // Obtém os dados do documento antes de deletar
    const keyData = docSnap.data();
    console.log('Dados da chave a ser deletada:', keyData);

    await deleteDoc(docRef);
    console.log(`Chave deletada com sucesso: ${req.params.id}`);
    
    res.json({ 
      message: 'Chave deletada com sucesso',
      id: req.params.id,
      name: keyData.name,
      deletedAt: new Date()
    });
  } catch (error) {
    console.error('Erro ao deletar chave:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message,
      stack: error.stack
    });
  }
});

// Decrypt endpoint (with optional name filter)
app.post('/decrypt', async (req, res) => {
  console.log('POST /decrypt - Iniciando descriptografia');
  try {
    const { secretKey, name } = req.body;
    console.log('Secret key recebida:', secretKey ? 'Sim' : 'Não');
    console.log('Nome para filtrar:', name || 'Todos');
    
    if (!secretKey) {
      console.log('Erro: secretKey não fornecida');
      return res.status(400).json({ error: 'Chave secreta é obrigatória' });
    }

    let querySnapshot;
    if (name) {
      console.log(`Buscando chaves com nome: ${name}`);
      const q = query(collection(db, 'encrypted_keys'), where('name', '==', name));
      querySnapshot = await getDocs(q);
    } else {
      console.log('Buscando todas as chaves');
      querySnapshot = await getDocs(collection(db, 'encrypted_keys'));
    }

    const keys = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      try {
        console.log(`Tentando descriptografar chave: ${data.name}`);
        const decryptedKey = CryptoJS.AES.decrypt(data.encryptedKey, secretKey).toString(CryptoJS.enc.Utf8);
        keys.push({
          id: doc.id,
          name: data.name,
          key: decryptedKey,
          createdAt: data.createdAt
        });
        console.log(`Chave ${data.name} descriptografada com sucesso`);
      } catch (error) {
        console.error(`Erro ao descriptografar chave ${data.name}:`, error);
        keys.push({
          id: doc.id,
          name: data.name,
          error: 'Falha ao descriptografar com a chave fornecida',
          createdAt: data.createdAt
        });
      }
    });
    
    console.log(`Processadas ${keys.length} chaves`);
    res.json(keys);
  } catch (error) {
    console.error('Erro ao descriptografar chaves:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log('Endpoints disponíveis:');
  console.log('- GET    /test');
  console.log('- POST   /keys');
  console.log('- GET    /keys?name=nome_da_chave');
  console.log('- PUT    /keys/:id');
  console.log('- DELETE /keys/:id');
  console.log('- POST   /decrypt');
}); 