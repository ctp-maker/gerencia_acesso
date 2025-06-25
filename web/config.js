// Configuração do Firebase - EDITE ESTE ARQUIVO COM SUAS CREDENCIAIS
export const firebaseConfig = {
  apiKey: "AIzaSyCpdJK1PJ9oTbZj6pvpJxozV0BwVi0eVIY",
  authDomain: "gerenciador-dados.firebaseapp.com",
  databaseURL: "https://gerenciador-dados-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "gerenciador-dados",
  storageBucket: "gerenciador-dados.firebasestorage.app",
  messagingSenderId: "964632484627",
  appId: "1:964632484627:web:31b295cd5956889bb218e6",
  measurementId: "G-CSG8YMHEZ9"
};
// Chave de criptografia (mantenha a mesma para compatibilidade com React Native)
export const ENCRYPTION_KEY = 'CTPJESUSATEULALALA';

// Configurações da aplicação
export const APP_CONFIG = {
  // Credenciais de login padrão
  DEFAULT_USERNAME: 'admin',
  DEFAULT_PASSWORD: '123456',
  
  // Configurações de sincronização
  SYNC_INTERVAL: 30000, // 30 segundos
  
  // Configurações de UI
  ANIMATION_DURATION: 300,
  
  // Configurações de segurança
  MAX_LOGIN_ATTEMPTS: 3,
  LOCKOUT_DURATION: 300000 // 5 minutos
}; 