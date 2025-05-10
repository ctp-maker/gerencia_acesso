const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');
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

// Helper function to handle CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async function(event, context) {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const { secretKey, name } = JSON.parse(event.body);
    
    if (!secretKey) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Chave secreta é obrigatória' })
      };
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
        if (!decryptedKey) {
          throw new Error('Chave inválida');
        }
        keys.push({
          id: doc.id,
          name: data.name,
          key: decryptedKey,
          createdAt: data.createdAt
        });
      } catch (error) {
        console.error('Erro ao descriptografar chave:', error);
        keys.push({
          id: doc.id,
          name: data.name,
          error: 'Não foi possível descriptografar. Verifique se a chave secreta está correta.',
          createdAt: data.createdAt
        });
      }
    });
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(keys)
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