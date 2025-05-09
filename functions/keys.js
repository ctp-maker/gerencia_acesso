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

// Helper function to handle CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

// GET /keys
exports.handler = async function(event, context) {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // GET request
    if (event.httpMethod === 'GET') {
      const { name } = event.queryStringParameters || {};
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

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(keys)
      };
    }

    // POST request
    if (event.httpMethod === 'POST') {
      const { key, name } = JSON.parse(event.body);
      
      if (!key || !name) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Chave e nome são obrigatórios' })
        };
      }

      const encryptedKey = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString();
      const keyDoc = {
        name,
        encryptedKey,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(db, 'encrypted_keys'), keyDoc);
      
      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Chave armazenada com sucesso', id: docRef.id })
      };
    }

    // DELETE request
    if (event.httpMethod === 'DELETE') {
      const id = event.path.split('/').pop();
      const docRef = doc(db, 'encrypted_keys', id);
      
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Chave não encontrada' })
        };
      }

      const keyData = docSnap.data();
      await deleteDoc(docRef);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'Chave deletada com sucesso',
          id: id,
          name: keyData.name,
          deletedAt: new Date()
        })
      };
    }

    // PUT request
    if (event.httpMethod === 'PUT') {
      const id = event.path.split('/').pop();
      const { key, name } = JSON.parse(event.body);
      
      if (!key || !name) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Chave e nome são obrigatórios' })
        };
      }

      const docRef = doc(db, 'encrypted_keys', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Chave não encontrada' })
        };
      }

      const encryptedKey = CryptoJS.AES.encrypt(key, ENCRYPTION_KEY).toString();
      const updateData = {
        name,
        encryptedKey,
        updatedAt: new Date()
      };

      await setDoc(docRef, updateData, { merge: true });
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'Chave atualizada com sucesso', 
          id: id,
          name: name,
          updatedAt: updateData.updatedAt
        })
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido' })
    };

  } catch (error) {
    console.error('Erro:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: 'Erro interno do servidor',
        details: error.message
      })
    };
  }
}; 