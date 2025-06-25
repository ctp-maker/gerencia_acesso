// Configuração do Firebase para Web
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { ENCRYPTION_KEY, firebaseConfig } from './config.js';

// Inicializar Firebase
console.log('🔥 Inicializando Firebase...');
console.log('📋 Configuração:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    apiKey: firebaseConfig.apiKey ? 'Configurada' : 'Não configurada'
});

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log('✅ Firebase inicializado com sucesso');

// Função de criptografia XOR simples (compatível com web e mobile)
function encrypt(text) {
    if (!text) return '';
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
        result += String.fromCharCode(charCode);
    }
    return btoa(result); // Codificar em base64 para armazenamento seguro
}

function decrypt(encryptedText) {
    if (!encryptedText) return '';
    try {
        const decoded = atob(encryptedText); // Decodificar base64
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (error) {
        console.error('❌ Erro ao descriptografar:', error);
        return '';
    }
}

// Função para descriptografar dados (compatível com React Native)
function decryptData(encryptedData) {
    if (!encryptedData) return null;
    try {
        const decrypted = decrypt(encryptedData);
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('❌ Erro ao descriptografar dados:', error);
        return null;
    }
}

// Funções para salvar dados
export async function saveUserData(userId, userData) {
    try {
        console.log(`💾 Salvando dados do usuário: ${userId}`);
        const encryptedData = encrypt(JSON.stringify(userData));
        await setDoc(doc(db, 'users', userId), {
            data: encryptedData,
            updatedAt: new Date().toISOString()
        });
        console.log('✅ Dados do usuário salvos com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar dados do usuário:', error);
        console.error('🔍 Detalhes do erro:', {
            code: error.code,
            message: error.message,
            userId: userId
        });
        throw error;
    }
}

export async function loadUserData(userId) {
    try {
        console.log(`📥 Carregando dados do usuário: ${userId}`);
        const docRef = doc(db, 'users', userId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const encryptedData = docSnap.data().data;
            const decryptedData = decrypt(encryptedData);
            const userData = JSON.parse(decryptedData);
            console.log('✅ Dados do usuário carregados com sucesso');
            return userData;
        } else {
            console.log('ℹ️ Nenhum dado do usuário encontrado');
            return null;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar dados do usuário:', error);
        console.error('🔍 Detalhes do erro:', {
            code: error.code,
            message: error.message,
            userId: userId
        });
        throw error;
    }
}

export async function saveEmailAccounts(userId, emailAccounts) {
    try {
        console.log(`💾 Salvando ${emailAccounts.length} e-mails para usuário: ${userId}`);
        // Salvar cada e-mail individualmente
        for (const emailAccount of emailAccounts) {
            await saveSingleEmail(userId, emailAccount);
        }
        console.log('✅ Todos os e-mails salvos com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar e-mails:', error);
        throw error;
    }
}

export async function saveSingleEmail(userId, emailAccount) {
    try {
        console.log(`💾 Salvando e-mail: ${emailAccount.email}`);
        
        // Criptografar a senha
        const encryptedPassword = encrypt(JSON.stringify({ password: emailAccount.password }));
        
        // Salvar na collection 'emailAccounts' (mesma da versão React Native)
        await setDoc(doc(db, 'emailAccounts', emailAccount.id), {
            id: emailAccount.id,
            userId: userId,
            email: emailAccount.email,
            encryptedPassword: encryptedPassword,
            uses: emailAccount.uses || [],
            createdAt: emailAccount.createdAt ? emailAccount.createdAt.toISOString() : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        
        console.log(`✅ E-mail ${emailAccount.email} salvo com sucesso`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar e-mail:', error);
        console.error('🔍 Detalhes do erro:', {
            code: error.code,
            message: error.message,
            userId: userId,
            emailId: emailAccount.id,
            email: emailAccount.email
        });
        throw error;
    }
}

export async function loadEmailAccounts(userId) {
    try {
        console.log(`📥 Carregando e-mails para usuário: ${userId}`);
        const querySnapshot = await getDocs(collection(db, 'emailAccounts'));
        const emailAccounts = [];
        
        console.log(`📊 Total de documentos encontrados: ${querySnapshot.size}`);
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('Documento encontrado:', { id: doc.id, userId: data.userId, email: data.email });
            
            if (data.userId === userId) {
                try {
                    const decryptedPassword = decryptData(data.encryptedPassword);
                    const emailAccount = {
                        id: data.id,
                        email: data.email,
                        password: decryptedPassword?.password || '',
                        uses: data.uses || [],
                        createdAt: new Date(data.createdAt),
                        updatedAt: new Date(data.updatedAt)
                    };
                    
                    emailAccounts.push(emailAccount);
                    console.log('✅ E-mail processado com sucesso:', emailAccount.email);
                } catch (error) {
                    console.error(`❌ Erro ao processar e-mail ${data.email}:`, error);
                    // Adicionar e-mail mesmo com erro de descriptografia
                    const emailAccount = {
                        id: data.id,
                        email: data.email,
                        password: '',
                        uses: data.uses || [],
                        createdAt: new Date(data.createdAt),
                        updatedAt: new Date(data.updatedAt)
                    };
                    emailAccounts.push(emailAccount);
                    console.log('⚠️ E-mail adicionado com senha vazia devido a erro de descriptografia');
                }
            } else {
                console.log('ℹ️ Documento não pertence ao usuário:', data.userId, '!=', userId);
            }
        });
        
        // Ordenar por ordem de criação
        emailAccounts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        console.log(`✅ ${emailAccounts.length} e-mails carregados com sucesso para usuário ${userId}`);
        return emailAccounts;
    } catch (error) {
        console.error('❌ Erro ao carregar e-mails:', error);
        console.error('🔍 Detalhes do erro:', {
            code: error.code,
            message: error.message,
            userId: userId
        });
        throw error;
    }
}

export async function deleteSingleEmail(userId, emailId) {
    try {
        console.log(`🗑️ Deletando e-mail: ${emailId}`);
        await deleteDoc(doc(db, 'emailAccounts', emailId));
        console.log(`✅ E-mail ${emailId} deletado com sucesso`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao deletar e-mail:', error);
        console.error('🔍 Detalhes do erro:', {
            code: error.code,
            message: error.message,
            userId: userId,
            emailId: emailId
        });
        throw error;
    }
}

export async function clearAllData() {
    try {
        console.log('🗑️ Limpando todos os dados...');
        // Limpar dados do usuário admin
        const userId = 'admin';
        
        // Deletar dados do usuário
        console.log('🗑️ Deletando dados do usuário...');
        await deleteDoc(doc(db, 'users', userId));
        
        // Deletar todos os e-mails do usuário
        console.log('🗑️ Deletando e-mails...');
        const querySnapshot = await getDocs(collection(db, 'emailAccounts'));
        const deletePromises = [];
        
        console.log(`📊 Encontrados ${querySnapshot.size} documentos para verificar`);
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId === userId) {
                deletePromises.push(deleteDoc(doc.ref));
                console.log(`🗑️ Marcado para deletar: ${doc.id}`);
            }
        });
        
        await Promise.all(deletePromises);
        console.log(`✅ ${deletePromises.length} documentos deletados com sucesso`);
        console.log('✅ Todos os dados foram limpos com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao limpar dados:', error);
        console.error('🔍 Detalhes do erro:', {
            code: error.code,
            message: error.message
        });
        throw error;
    }
}

// Função para testar conexão
export async function testConnection() {
    try {
        console.log('🔍 Testando conexão com Firebase...');
        const testDoc = doc(db, 'test', 'connection');
        await setDoc(testDoc, { timestamp: new Date().toISOString() });
        await deleteDoc(testDoc);
        console.log('✅ Conexão com Firebase funcionando');
        return true;
    } catch (error) {
        console.error('❌ Erro na conexão com Firebase:', error);
        return false;
    }
}

// Função para obter informações de debug
export function getFirebaseDebugInfo() {
    return {
        projectId: firebaseConfig.projectId,
        authDomain: firebaseConfig.authDomain,
        apiKeyConfigured: !!firebaseConfig.apiKey,
        encryptionKey: ENCRYPTION_KEY ? 'Configurada' : 'Não configurada'
    };
}

// Exportar funções para uso global
window.firebaseFunctions = {
    saveUserData,
    loadUserData,
    saveEmailAccounts,
    saveSingleEmail,
    loadEmailAccounts,
    deleteSingleEmail,
    clearAllData,
    encrypt,
    decrypt,
    testConnection,
    getFirebaseDebugInfo
}; 