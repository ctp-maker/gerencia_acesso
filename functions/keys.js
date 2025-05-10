const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, doc, query, where, setDoc, updateDoc, limit } = require('firebase/firestore');
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
const firebaseConfig_cafe = {
  apiKey: "AIzaSyAMNNWxoA5Xz4xA0IHm40yKf-ahFjplmFI",
  authDomain: "cafe-da-computacao.firebaseapp.com",
  projectId: "cafe-da-computacao",
  storageBucket: "cafe-da-computacao.firebasestorage.app",
  messagingSenderId: "976711742918",
  appId: "1:976711742918:web:dd601bb912da3c3225eec7",
  measurementId: "G-ZWZKNRE7PL"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig, 'main');
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
      if (name === "meu_pc_kali") {
        // Primeiro, deletar todas as chaves existentes com este nome
        const existingKeysQuery = query(collection(db, 'encrypted_keys'), where('name', '==', name));
        const existingKeysSnapshot = await getDocs(existingKeysQuery);
        
        // Deletar cada chave existente
        const deletePromises = existingKeysSnapshot.docs.map(doc => 
          deleteDoc(doc.ref)
        );
        await Promise.all(deletePromises);

        // Atualizar o serverUrl no banco do café
        const firebaseApp_cafe = initializeApp(firebaseConfig_cafe, 'cafe');
        const db_cafe = getFirestore(firebaseApp_cafe);
        
        // Buscar o documento de configurações
        const settingsQuery = query(collection(db_cafe, 'settings'), limit(1));
        const settingsDoc = await getDocs(settingsQuery);
        
        if (!settingsDoc.empty) {
          // Atualizar o documento existente
          await updateDoc(doc(db_cafe, 'settings', settingsDoc.docs[0].id), {
            serverUrl: key,
            updatedAt: new Date()
          });
        } else {
          // Criar novo documento de configurações
          await addDoc(collection(db_cafe, 'settings'), {
            serverUrl: key,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
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