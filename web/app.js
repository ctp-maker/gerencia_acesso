// Aplicação Principal - Gerenciador de E-mails
import {
    clearAllData,
    deleteSingleEmail,
    getFirebaseDebugInfo,
    loadEmailAccounts,
    loadUserData,
    saveSingleEmail,
    saveUserData,
    testConnection
} from './firebase-config.js';

class EmailManager {
    constructor() {
        this.isAuthenticated = false;
        this.user = null;
        this.emailAccounts = [];
        this.lastSync = null;
        this.isSyncing = false;
        this.selectedEmail = null;
        this.syncErrors = [];
        
        this.initializeApp();
        this.setupEventListeners();
    }

    async initializeApp() {
        try {
            console.log('🚀 Inicializando aplicação...');
            
            // Testar conexão com Firebase
            console.log('🔍 Testando conexão com Firebase...');
            const connectionTest = await testConnection();
            if (!connectionTest) {
                throw new Error('Não foi possível conectar ao Firebase');
            }
            
            await this.loadData();
            this.updateUI();
            console.log('✅ Aplicação inicializada com sucesso');
        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
            this.showError('Erro ao inicializar aplicação: ' + error.message);
        }
    }

    setupEventListeners() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Botões principais
        document.getElementById('fabButton').addEventListener('click', () => {
            this.showAddEmailModal();
        });

        document.getElementById('syncButton').addEventListener('click', () => {
            this.handleSync();
        });

        document.getElementById('clearButton').addEventListener('click', () => {
            this.handleClearData();
        });

        document.getElementById('logoutButton').addEventListener('click', () => {
            this.handleLogout();
        });

        // Modais
        this.setupModalListeners();
    }

    setupModalListeners() {
        // Modal Adicionar E-mail
        document.getElementById('addEmailForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddEmail();
        });

        document.getElementById('closeAddEmailModal').addEventListener('click', () => {
            this.hideAddEmailModal();
        });

        document.getElementById('cancelAddEmail').addEventListener('click', () => {
            this.hideAddEmailModal();
        });

        // Modal Adicionar Uso
        document.getElementById('addUseForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddUse();
        });

        document.getElementById('closeAddUseModal').addEventListener('click', () => {
            this.hideAddUseModal();
        });

        document.getElementById('cancelAddUse').addEventListener('click', () => {
            this.hideAddUseModal();
        });

        // Modal de Confirmação
        document.getElementById('closeConfirmModal').addEventListener('click', () => {
            this.hideConfirmModal();
        });

        document.getElementById('cancelConfirm').addEventListener('click', () => {
            this.hideConfirmModal();
        });

        // Overlay dos modais
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'modalOverlay') {
                this.hideAllModals();
            }
        });
    }

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        console.log('🔐 Tentando login...');

        if (username === 'admin' && password === '123456') {
            this.user = {
                id: 'admin',
                username: username,
                password: password
            };
            this.isAuthenticated = true;

            try {
                console.log('💾 Salvando dados do usuário...');
                await saveUserData(this.user.id, this.user);
                console.log('✅ Login realizado com sucesso');
                this.showMainScreen();
            } catch (error) {
                console.error('❌ Erro ao salvar dados do usuário:', error);
                this.showError('Erro ao salvar dados: ' + error.message);
                // Mesmo com erro, permitir o login
                this.showMainScreen();
            }
        } else {
            console.log('❌ Credenciais inválidas');
            this.showError('Usuário ou senha incorretos!');
        }
    }

    async handleLogout() {
        console.log('🚪 Fazendo logout...');
        this.isAuthenticated = false;
        this.user = null;
        this.emailAccounts = [];
        this.showLoginScreen();
    }

    async loadData() {
        try {
            console.log('📥 Carregando dados...');
            
            // Tentar carregar dados do usuário admin
            const userId = 'admin';
            
            console.log('👤 Carregando dados do usuário...');
            const savedUser = await loadUserData(userId);
            
            console.log('📧 Carregando e-mails...');
            const savedEmailAccounts = await loadEmailAccounts(userId);
            
            console.log('📊 Dados carregados:', { 
                user: savedUser ? 'Encontrado' : 'Não encontrado',
                emails: savedEmailAccounts ? savedEmailAccounts.length : 0 
            });
            
            if (savedUser) {
                this.user = savedUser;
                this.isAuthenticated = true;
                console.log('✅ Usuário carregado:', savedUser.username);
            }
            
            if (savedEmailAccounts && savedEmailAccounts.length > 0) {
                this.emailAccounts = savedEmailAccounts;
                console.log(`✅ ${savedEmailAccounts.length} e-mails carregados`);
            } else {
                console.log('ℹ️ Nenhum e-mail encontrado');
            }
            
            this.lastSync = new Date();
            console.log('✅ Carregamento concluído');
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            this.syncErrors.push({
                timestamp: new Date(),
                error: error.message,
                type: 'load'
            });
            this.showError('Erro ao carregar dados: ' + error.message);
        }
    }

    async handleSync() {
        if (this.isSyncing) {
            console.log('⏳ Sincronização já em andamento...');
            return;
        }

        this.isSyncing = true;
        this.updateSyncStatus();
        
        try {
            console.log('🔄 Iniciando sincronização manual...');
            
            // Testar conexão antes de sincronizar
            const connectionTest = await testConnection();
            if (!connectionTest) {
                throw new Error('Sem conexão com Firebase');
            }
            
            await this.loadData();
            this.lastSync = new Date();
            console.log('✅ Sincronização concluída com sucesso');
            this.showSuccess('Sincronização concluída!');
        } catch (error) {
            console.error('❌ Erro durante sincronização:', error);
            this.syncErrors.push({
                timestamp: new Date(),
                error: error.message,
                type: 'sync'
            });
            this.showError('Erro durante sincronização: ' + error.message);
        } finally {
            this.isSyncing = false;
            this.updateSyncStatus();
            this.updateUI();
        }
    }

    async handleAddEmail() {
        const email = document.getElementById('emailInput').value;
        const password = document.getElementById('passwordInput').value;
        const usesText = document.getElementById('usesInput').value;
        
        console.log('➕ Adicionando novo e-mail:', email);
        
        const uses = usesText.split(',').map(use => use.trim()).filter(use => use.length > 0);
        
        const newAccount = {
            id: Date.now().toString(),
            email: email,
            password: password,
            uses: uses,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        this.emailAccounts.push(newAccount);
        
        // Salvar no Firebase
        if (this.user) {
            try {
                console.log('💾 Salvando e-mail no Firebase...');
                await saveSingleEmail(this.user.id, newAccount);
                console.log('✅ E-mail adicionado e salvo no Firebase');
                this.showSuccess('E-mail adicionado com sucesso!');
            } catch (error) {
                console.error('❌ Erro ao salvar e-mail no Firebase:', error);
                this.showError('Erro ao salvar e-mail: ' + error.message);
            }
        }
        
        this.hideAddEmailModal();
        this.updateUI();
        this.lastSync = new Date();
        this.updateSyncStatus();
    }

    async handleAddUse() {
        const use = document.getElementById('useInput').value;
        
        console.log('➕ Adicionando uso:', use);
        
        if (this.selectedEmail) {
            this.selectedEmail.uses.push(use);
            this.selectedEmail.updatedAt = new Date();
            
            // Salvar no Firebase
            if (this.user) {
                try {
                    console.log('💾 Salvando uso no Firebase...');
                    await saveSingleEmail(this.user.id, this.selectedEmail);
                    console.log('✅ Uso adicionado e salvo no Firebase');
                    this.showSuccess('Uso adicionado com sucesso!');
                } catch (error) {
                    console.error('❌ Erro ao salvar uso no Firebase:', error);
                    this.showError('Erro ao salvar uso: ' + error.message);
                }
            }
            
            this.hideAddUseModal();
            this.updateUI();
            this.lastSync = new Date();
            this.updateSyncStatus();
        }
    }

    async handleDeleteEmail(emailAccount) {
        const confirmed = await this.showConfirmModal(
            'Confirmar Exclusão',
            `Deseja realmente excluir o e-mail ${emailAccount.email}?`
        );
        
        if (confirmed) {
            console.log('🗑️ Deletando e-mail:', emailAccount.email);
            
            this.emailAccounts = this.emailAccounts.filter(acc => acc.id !== emailAccount.id);
            
            // Deletar do Firebase
            if (this.user) {
                try {
                    console.log('💾 Deletando e-mail do Firebase...');
                    await deleteSingleEmail(this.user.id, emailAccount.id);
                    console.log('✅ E-mail deletado do Firebase');
                    this.showSuccess('E-mail deletado com sucesso!');
                } catch (error) {
                    console.error('❌ Erro ao deletar e-mail do Firebase:', error);
                    this.showError('Erro ao deletar e-mail: ' + error.message);
                }
            }
            
            this.updateUI();
            this.lastSync = new Date();
            this.updateSyncStatus();
        }
    }

    async handleRemoveUse(emailAccount, use) {
        const confirmed = await this.showConfirmModal(
            'Confirmar Remoção',
            `Deseja remover "${use}" dos usos do e-mail ${emailAccount.email}?`
        );
        
        if (confirmed) {
            console.log('🗑️ Removendo uso:', use);
            
            emailAccount.uses = emailAccount.uses.filter(u => u !== use);
            emailAccount.updatedAt = new Date();
            
            // Salvar no Firebase
            if (this.user) {
                try {
                    console.log('💾 Salvando alteração no Firebase...');
                    await saveSingleEmail(this.user.id, emailAccount);
                    console.log('✅ Uso removido e salvo no Firebase');
                    this.showSuccess('Uso removido com sucesso!');
                } catch (error) {
                    console.error('❌ Erro ao remover uso no Firebase:', error);
                    this.showError('Erro ao remover uso: ' + error.message);
                }
            }
            
            this.updateUI();
            this.lastSync = new Date();
            this.updateSyncStatus();
        }
    }

    async handleClearData() {
        const confirmed = await this.showConfirmModal(
            'Limpar Todos os Dados',
            'Isso irá apagar todos os e-mails salvos. Tem certeza?'
        );
        
        if (confirmed) {
            try {
                console.log('🗑️ Limpando todos os dados...');
                await clearAllData();
                this.user = null;
                this.isAuthenticated = false;
                this.emailAccounts = [];
                console.log('✅ Todos os dados foram limpos');
                this.showSuccess('Todos os dados foram limpos!');
                this.showLoginScreen();
            } catch (error) {
                console.error('❌ Erro ao limpar dados:', error);
                this.showError('Erro ao limpar dados: ' + error.message);
            }
        }
    }

    // Funções de UI
    showLoginScreen() {
        document.getElementById('loginScreen').classList.add('active');
        document.getElementById('mainScreen').classList.remove('active');
    }

    showMainScreen() {
        document.getElementById('loginScreen').classList.remove('active');
        document.getElementById('mainScreen').classList.add('active');
        this.updateUI();
    }

    updateUI() {
        if (!this.isAuthenticated) {
            this.showLoginScreen();
            return;
        }

        this.renderEmailList();
        this.updateSyncStatus();
    }

    renderEmailList() {
        const emailList = document.getElementById('emailList');
        const emptyState = document.getElementById('emptyState');

        if (this.emailAccounts.length === 0) {
            emailList.style.display = 'none';
            emptyState.style.display = 'flex';
            return;
        }

        emailList.style.display = 'block';
        emptyState.style.display = 'none';

        emailList.innerHTML = this.emailAccounts.map(email => this.createEmailCard(email)).join('');
    }

    createEmailCard(emailAccount) {
        const usesHtml = emailAccount.uses.length > 0 
            ? emailAccount.uses.map(use => `
                <div class="use-tag" onclick="window.app.handleRemoveUseClick('${emailAccount.id}', '${use}')">
                    <span class="use-tag-text">${use}</span>
                    <div class="remove-use-icon">×</div>
                </div>
            `).join('')
            : '<span class="no-uses-text">Nenhum uso cadastrado</span>';

        return `
            <div class="email-card">
                <div class="email-header">
                    <div class="email-info">
                        <div class="email-address">${emailAccount.email}</div>
                        <div class="email-password">${emailAccount.password}</div>
                    </div>
                    <div class="email-actions">
                        <button class="action-button" onclick="window.app.handleAddUseClick('${emailAccount.id}')">+</button>
                        <button class="action-button delete" onclick="window.app.handleDeleteEmailClick('${emailAccount.id}')">×</button>
                    </div>
                </div>
                <div class="uses-container">
                    <div class="uses-header">
                        <span class="uses-title">Usos:</span>
                        <span class="uses-hint">Clique para remover</span>
                    </div>
                    <div class="uses-list">
                        ${usesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    updateSyncStatus() {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const lastSyncText = document.getElementById('lastSyncText');
        const syncButton = document.getElementById('syncButton');
        const syncText = document.getElementById('syncText');

        if (this.isSyncing) {
            statusDot.className = 'status-dot syncing';
            statusText.textContent = 'Sincronizando...';
            syncButton.disabled = true;
            syncText.textContent = 'Sinc...';
        } else {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Sincronizado';
            syncButton.disabled = false;
            syncText.textContent = 'Sinc';
        }

        if (this.lastSync && !this.isSyncing) {
            lastSyncText.textContent = `Última sincronização: ${this.lastSync.toLocaleTimeString()}`;
        } else {
            lastSyncText.textContent = '';
        }
    }

    // Handlers para eventos de clique nos cards
    handleAddUseClick(emailId) {
        this.selectedEmail = this.emailAccounts.find(acc => acc.id === emailId);
        this.showAddUseModal();
    }

    handleDeleteEmailClick(emailId) {
        const emailAccount = this.emailAccounts.find(acc => acc.id === emailId);
        if (emailAccount) {
            this.handleDeleteEmail(emailAccount);
        }
    }

    handleRemoveUseClick(emailId, use) {
        const emailAccount = this.emailAccounts.find(acc => acc.id === emailId);
        if (emailAccount) {
            this.handleRemoveUse(emailAccount, use);
        }
    }

    // Funções de Modal
    showAddEmailModal() {
        // Esconder outros modais primeiro
        this.hideAllModals();
        
        // Mostrar overlay e modal
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('addEmailModal').classList.add('active');
        
        // Focar no primeiro input após um pequeno delay
        setTimeout(() => {
            document.getElementById('emailInput').focus();
        }, 100);
    }

    hideAddEmailModal() {
        document.getElementById('addEmailModal').classList.remove('active');
        // Só esconder o overlay se não há outros modais ativos
        if (!this.hasActiveModals()) {
            document.getElementById('modalOverlay').classList.remove('active');
        }
        document.getElementById('addEmailForm').reset();
    }

    showAddUseModal() {
        // Esconder outros modais primeiro
        this.hideAllModals();
        
        // Mostrar overlay e modal
        document.getElementById('modalOverlay').classList.add('active');
        document.getElementById('addUseModal').classList.add('active');
        
        // Focar no input após um pequeno delay
        setTimeout(() => {
            document.getElementById('useInput').focus();
        }, 100);
    }

    hideAddUseModal() {
        document.getElementById('addUseModal').classList.remove('active');
        // Só esconder o overlay se não há outros modais ativos
        if (!this.hasActiveModals()) {
            document.getElementById('modalOverlay').classList.remove('active');
        }
        document.getElementById('addUseForm').reset();
        this.selectedEmail = null;
    }

    async showConfirmModal(title, message) {
        return new Promise((resolve) => {
            // Esconder outros modais primeiro
            this.hideAllModals();
            
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            
            // Mostrar overlay e modal
            document.getElementById('modalOverlay').classList.add('active');
            document.getElementById('confirmModal').classList.add('active');
            
            const handleConfirm = () => {
                this.hideConfirmModal();
                document.getElementById('confirmAction').removeEventListener('click', handleConfirm);
                document.getElementById('cancelConfirm').removeEventListener('click', handleCancel);
                resolve(true);
            };
            
            const handleCancel = () => {
                this.hideConfirmModal();
                document.getElementById('confirmAction').removeEventListener('click', handleConfirm);
                document.getElementById('cancelConfirm').removeEventListener('click', handleCancel);
                resolve(false);
            };
            
            document.getElementById('confirmAction').addEventListener('click', handleConfirm);
            document.getElementById('cancelConfirm').addEventListener('click', handleCancel);
        });
    }

    hideConfirmModal() {
        document.getElementById('confirmModal').classList.remove('active');
        // Só esconder o overlay se não há outros modais ativos
        if (!this.hasActiveModals()) {
            document.getElementById('modalOverlay').classList.remove('active');
        }
    }

    hideAllModals() {
        document.getElementById('addEmailModal').classList.remove('active');
        document.getElementById('addUseModal').classList.remove('active');
        document.getElementById('confirmModal').classList.remove('active');
        document.getElementById('modalOverlay').classList.remove('active');
    }

    // Função para verificar se há modais ativos
    hasActiveModals() {
        return document.getElementById('addEmailModal').classList.contains('active') ||
               document.getElementById('addUseModal').classList.contains('active') ||
               document.getElementById('confirmModal').classList.contains('active');
    }

    // Funções de notificação
    showError(message) {
        console.error('❌ Erro:', message);
        alert('Erro: ' + message);
    }

    showSuccess(message) {
        console.log('✅ Sucesso:', message);
        alert('Sucesso: ' + message);
    }

    // Função para debug
    getDebugInfo() {
        return {
            isAuthenticated: this.isAuthenticated,
            user: this.user,
            emailCount: this.emailAccounts.length,
            lastSync: this.lastSync,
            isSyncing: this.isSyncing,
            syncErrors: this.syncErrors,
            firebaseInfo: getFirebaseDebugInfo()
        };
    }

    // Função para testar conexão
    async testFirebaseConnection() {
        try {
            const result = await testConnection();
            console.log('🔍 Teste de conexão:', result ? '✅ Sucesso' : '❌ Falha');
            return result;
        } catch (error) {
            console.error('❌ Erro no teste de conexão:', error);
            return false;
        }
    }
}

// Inicializar aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    // Aguardar o carregamento do Firebase
    setTimeout(() => {
        window.app = new EmailManager();
        console.log('🎯 Aplicação carregada. Para debug, use: window.app.getDebugInfo()');
        console.log('🔍 Para testar conexão, use: window.app.testFirebaseConnection()');
    }, 1000);
}); 