require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const si = require('systeminformation');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const bodyParser = require('body-parser');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Objeto para gerenciar múltiplas sessões de terminal
const terminalSessions = {};

// Função para limpar sessões inativas (ex: a cada 1 hora)
setInterval(() => {
  const now = Date.now();
  for (const sessionId in terminalSessions) {
    if (now - terminalSessions[sessionId].lastActivity > 3600000) {
      delete terminalSessions[sessionId];
      console.log(`Sessão de terminal inativa ${sessionId} foi limpa.`);
    }
  }
}, 3600000);

// Helper para a resposta do /api/exec
const getEnhancedResponse = (sessionId, output = '') => {
  const session = terminalSessions[sessionId];
  if (!session) {
    return { output: 'Erro: Sessão não encontrada.', cwd: '~', directoryContents: [] };
  }
  try {
    const directoryContents = fs.readdirSync(session.cwd).map(item => {
      try {
        return fs.statSync(path.join(session.cwd, item)).isDirectory() ? item + '/' : item;
      } catch { return item; }
    });
    return { output, cwd: session.cwd, directoryContents };
  } catch (e) {
    return { output: `Erro ao ler diretório: ${e.message}`, cwd: session.cwd, directoryContents: [] };
  }
};

// Endpoint para criar um novo terminal
app.post('/api/terminal', (req, res) => {
  const sessionId = uuidv4();
  terminalSessions[sessionId] = {
    cwd: __dirname,
    lastActivity: Date.now()
  };
  console.log(`Nova sessão de terminal criada: ${sessionId}`);
  res.json({ sessionId, cwd: __dirname, directoryContents: fs.readdirSync(__dirname) });
});

// Endpoint para fechar um terminal
app.delete('/api/terminal/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (terminalSessions[sessionId]) {
        delete terminalSessions[sessionId];
        console.log(`Sessão de terminal fechada: ${sessionId}`);
        res.status(200).send();
    } else {
        res.status(404).send();
    }
});

app.post('/api/exec', async (req, res) => {
  const { cmd, sessionId } = req.body; // Agora recebe o sessionId
  console.log(`POST /api/exec - Executando comando: ${cmd} na sessão: ${sessionId}`);
  if (!terminalSessions[sessionId]) {
    return res.status(404).json({ error: 'Sessão de terminal inválida.' });
  }
  
  // Atualiza a atividade da sessão
  terminalSessions[sessionId].lastActivity = Date.now();
  const session = terminalSessions[sessionId];

  if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
    return res.json(getEnhancedResponse(sessionId));
  }

  const trimmedCmd = cmd.trim();

  if (trimmedCmd.startsWith('cd ')) {
    const targetDir = trimmedCmd.substring(3).trim();
    const newPath = path.resolve(session.cwd, targetDir || (process.env.HOME || process.env.USERPROFILE));
    
    try {
      if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
        session.cwd = newPath;
        return res.json(getEnhancedResponse(sessionId, `Novo diretório: ${newPath}`));
      } else {
        return res.status(400).json(getEnhancedResponse(sessionId, `cd: diretório não encontrado: ${targetDir}`));
      }
    } catch (e) {
      return res.status(500).json(getEnhancedResponse(sessionId, `Erro ao acessar diretório: ${e.message}`));
    }
  }

  exec(cmd, { cwd: session.cwd, timeout: 10000 }, (err, stdout, stderr) => {
    const output = (stdout || '') + (stderr || '');
    console.log(`POST /api/exec - Resposta: ${output}`);
    res.json(getEnhancedResponse(sessionId, output));
  });
});

// ----- ROTAS PARA MONITORES DE SERVIÇO -----
const MONITORS_FILE_PATH = path.join(__dirname, 'monitors.json');

// ----- ROTAS PARA ATALHOS DE COMANDOS -----
const SHORTCUTS_FILE_PATH = path.join(__dirname, 'shortcuts.json');

const readMonitors = () => {
    try {
        if (fs.existsSync(MONITORS_FILE_PATH)) {
            const data = fs.readFileSync(MONITORS_FILE_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Erro ao ler monitors.json:", e);
    }
    return [];
};

const writeMonitors = (data) => {
    try {
        fs.writeFileSync(MONITORS_FILE_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Erro ao escrever em monitors.json:", e);
    }
};

const readShortcuts = () => {
    try {
        if (fs.existsSync(SHORTCUTS_FILE_PATH)) {
            const data = fs.readFileSync(SHORTCUTS_FILE_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Erro ao ler shortcuts.json:", e);
    }
    return [];
};

const writeShortcuts = (data) => {
    try {
        fs.writeFileSync(SHORTCUTS_FILE_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Erro ao escrever em shortcuts.json:", e);
    }
};

// Obter todos os monitores
app.get('/api/monitors', (req, res) => {
    res.json(readMonitors());
});

// Adicionar ou atualizar um monitor
app.post('/api/monitors', (req, res) => {
    const monitors = readMonitors();
    const newMonitor = req.body;
    
    if (!newMonitor.id) {
        newMonitor.id = uuidv4();
    }

    const index = monitors.findIndex(m => m.id === newMonitor.id);
    if (index !== -1) {
        monitors[index] = newMonitor; // Atualiza
    } else {
        monitors.push(newMonitor); // Adiciona
    }
    
    writeMonitors(monitors);
    res.status(201).json(newMonitor);
});

// Deletar um monitor
app.delete('/api/monitors/:id', (req, res) => {
    let monitors = readMonitors();
    monitors = monitors.filter(m => m.id !== req.params.id);
    writeMonitors(monitors);
    res.status(204).send();
});

// Iniciar um serviço de um monitor
app.post('/api/monitors/start', async (req, res) => {
    const { monitorId } = req.body;
    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === monitorId);

    if (!monitor) {
        return res.status(404).json({ error: 'Monitor não encontrado.' });
    }

    const commands = Array.isArray(monitor.startCmd) ? monitor.startCmd.filter(cmd => cmd.trim() !== '') : [];
    
    if (commands.length === 0) {
        return res.status(400).json({ error: 'Nenhum comando de início configurado.' });
    }

    console.log(`Iniciando monitor '${monitor.name}' com os comandos:`, commands);

    try {
        let currentMonitorCwd = __dirname; // Começa no diretório do projeto
        let combinedOutput = '';

        for (const command of commands) {
            if (command.trim().startsWith('cd ')) {
                const targetDir = command.trim().substring(3).trim();
                const newPath = path.resolve(currentMonitorCwd, targetDir);

                if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                    currentMonitorCwd = newPath;
                    console.log(`Diretório de trabalho do monitor alterado para: ${currentMonitorCwd}`);
                } else {
                    throw new Error(`Diretório não encontrado: ${newPath}`);
                }
            } else {
                // Executa outros comandos no diretório de trabalho atual do monitor
                const { stdout, stderr } = await execPromise(command, { cwd: currentMonitorCwd });
                if (stdout) combinedOutput += stdout;
                if (stderr) combinedOutput += stderr;
            }
        }
        console.log(`Monitor '${monitor.name}' iniciado com sucesso. Saída:`, combinedOutput);
        res.json({ message: `Serviço ${monitor.name} iniciado com sucesso.` });
    } catch (error) {
        console.error(`Falha ao iniciar monitor '${monitor.name}'.`, error);
        res.status(500).json({ 
            error: `Falha ao executar o script de início para ${monitor.name}.`,
            details: error.stderr || error.stdout || error.message
        });
    }
});

// Parar um processo pela porta
app.post('/api/monitors/stop', (req, res) => {
    const { port } = req.body;
    if (!port) {
        return res.status(400).json({ error: 'A porta não foi fornecida.' });
    }

    // Comando para encontrar o PID usando a porta
    const findPidCmd = `lsof -t -i TCP:${port}`;

    exec(findPidCmd, (err, stdout, stderr) => {
        if (err || !stdout) {
            console.error(`Nenhum processo encontrado na porta ${port}:`, stderr);
            return res.status(404).json({ error: `Nenhum processo encontrado na porta ${port}` });
        }
        
        const pid = stdout.trim();
        const killCmd = `kill -9 ${pid}`;

        exec(killCmd, (killErr, killStdout, killStderr) => {
            if (killErr) {
                console.error(`Falha ao encerrar o processo ${pid}:`, killStderr);
                return res.status(500).json({ error: `Falha ao encerrar o processo ${pid}: ${killStderr}` });
            }
            console.log(`Processo ${pid} na porta ${port} encerrado com sucesso.`);
            res.json({ message: `Processo ${pid} na porta ${port} encerrado.` });
        });
    });
});

// Verificar status de uma porta
app.get('/api/monitors/status/:port', (req, res) => {
    const { port } = req.params;
    // O comando lsof (List Open Files) é ideal para isso em Linux/macOS.
    // '-i TCP:${port}' filtra por conexões TCP na porta especificada.
    exec(`lsof -i TCP:${port}`, (err, stdout, stderr) => {
        if (stdout && stdout.length > 0) {
            res.json({ status: 'online' });
        } else {
            res.json({ status: 'offline' });
        }
    });
});

// ... ATENÇÃO: Endpoint Inseguro ---
// Este endpoint permite execução de comandos arbitrários e só deve ser usado
// em ambiente estritamente local e controlado.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'superadmin'; // Senha da variável de ambiente

app.post('/api/exec-admin', (req, res) => {
  const { cmd, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Senha incorreta.' });
  }
  if (!cmd) {
    return res.status(400).json({ error: 'Comando não fornecido.' });
  }

  exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: stderr || err.message });
    }
    res.json({ output: stdout });
  });
});


app.get('/', (req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 15966;
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log('Endpoints disponíveis:');
  console.log('- GET    /acc');
});

// WebSocket Server for real-time stats
const wss = new WebSocketServer({ server });

const MAX_HISTORY_POINTS = 100; // Reduzido para 100
const HISTORY_FILE_PATH = path.join(__dirname, 'stats-history.json');
let statsHistory = [];

try {
  if (fs.existsSync(HISTORY_FILE_PATH)) {
    const data = fs.readFileSync(HISTORY_FILE_PATH, 'utf8');
    const parsedData = JSON.parse(data);
    if (Array.isArray(parsedData)) {
      statsHistory = parsedData;
      // Garante que o histórico não exceda o limite máximo
      if (statsHistory.length > MAX_HISTORY_POINTS) {
        statsHistory = statsHistory.slice(statsHistory.length - MAX_HISTORY_POINTS);
      }
      console.log(`Histórico carregado com ${statsHistory.length} registros.`);
    }
  }
} catch (e) {
  console.error("Erro ao ler arquivo de histórico, iniciando com um novo:", e);
  statsHistory = [];
}

// Função para coletar dados e atualizar o histórico
const collectSystemStats = async () => {
  try {
    // Coleta todas as informações em paralelo para mais eficiência
    const [cpu, mem, fsData, processes] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.processes()
    ]);
    
    const actualUsedMem = mem.total - mem.available;

    // Recupera a lista de processos (corrigido)
    const topProcs = processes.list
      .sort((a, b) => (b.memRss || 0) - (a.memRss || 0))
      .slice(0, 5)
      .map(p => ({
        pid: p.pid,
        name: p.name,
        cpu: (p.pcpu || 0).toFixed(1),
        mem: ((p.memRss || 0) / 1024 / 1024).toFixed(2) // MB
      }));

    const stats = {
      cpu: cpu.currentLoad.toFixed(2),
      mem: {
        total: (mem.total / 1024**3).toFixed(2),
        used: (actualUsedMem / 1024**3).toFixed(2),
        percent: ((actualUsedMem / mem.total) * 100).toFixed(2)
      },
      disk: {
        total: (fsData[0].size / 1024**3).toFixed(2),
        used: (fsData[0].used / 1024**3).toFixed(2),
        percent: (fsData[0].use || 0).toFixed(2)
      },
      processes: topProcs, // Adicionado de volta
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false })
    };
    
    // Adiciona ao histórico e remove o mais antigo se necessário
    statsHistory.push(stats);
    if (statsHistory.length > MAX_HISTORY_POINTS) {
      statsHistory.shift();
    }
    
    // Escreve o histórico no arquivo de forma assíncrona
    fs.writeFile(HISTORY_FILE_PATH, JSON.stringify(statsHistory, null, 2), (err) => {
        if (err) console.error('Erro ao escrever no arquivo de histórico:', err);
    });
    
    // Envia para todos os clientes conectados
    const dataToSend = JSON.stringify(stats);
    wss.clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(dataToSend);
      }
    });

  } catch (e) {
    console.error('Erro ao obter estatísticas do sistema:', e);
  }
};

// Coleta os dados em intervalos regulares
setInterval(collectSystemStats, 2000);

wss.on('connection', (ws) => {
  console.log('Cliente conectado ao WebSocket de estatísticas.');
  ws.on('close', () => console.log('Cliente desconectado do WebSocket.'));
  ws.on('error', (error) => console.error('WebSocket Error:', error));
});

// Endpoint para obter o histórico inicial
app.get('/api/history', (req, res) => {
  res.json(statsHistory);
});

// Endpoint para verificar senha de administrador
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Senha não fornecida' });
  }
  console.log(password);
  console.log(ADMIN_PASSWORD);
  if (password === ADMIN_PASSWORD) {
    console.log('Autenticação bem-sucedida');
    res.json({ success: true, message: 'Autenticação bem-sucedida' });
  } else {
    res.status(401).json({ error: 'Senha incorreta' });
  }
});

// Adicionando a nova rota
app.get('/acc', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-real.html'));
});

app.post('/api/monitors/restart', async (req, res) => {
    const { monitorId } = req.body;
    const monitors = readMonitors();
    const monitor = monitors.find(m => m.id === monitorId);

    if (!monitor) {
        return res.status(404).json({ error: 'Monitor não encontrado.' });
    }

    // 1. Tentar Parar o Processo
    try {
        const findPidCmd = `lsof -t -i TCP:${monitor.port}`;
        const { stdout: pid } = await execPromise(findPidCmd);
        if (pid) {
            await execPromise(`kill -9 ${pid.trim()}`);
            console.log(`Processo ${pid.trim()} na porta ${monitor.port} encerrado para reinicialização.`);
        }
    } catch (e) {
        // Ignora o erro se o processo não for encontrado (já está offline)
        if (!e.stdout && !e.stderr) {
            console.log(`Nenhum processo para parar na porta ${monitor.port}, prosseguindo para o início.`);
        } else {
            return res.status(500).json({ error: 'Falha ao parar o processo existente.', details: e.message });
        }
    }
    
    // Pequena pausa para garantir que a porta foi liberada
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Iniciar o Processo (lógica já existente)
    try {
        const commands = Array.isArray(monitor.startCmd) ? monitor.startCmd.filter(cmd => cmd.trim() !== '') : [];
        if (commands.length === 0) throw new Error('Nenhum comando de início configurado.');
        
        let currentMonitorCwd = __dirname;
        for (const command of commands) {
            if (command.trim().startsWith('cd ')) {
                const targetDir = command.trim().substring(3).trim();
                currentMonitorCwd = path.resolve(currentMonitorCwd, targetDir);
                if (!fs.existsSync(currentMonitorCwd)) throw new Error(`Diretório não encontrado: ${currentMonitorCwd}`);
            } else {
                await execPromise(command, { cwd: currentMonitorCwd });
            }
        }
        res.json({ message: `Serviço ${monitor.name} reiniciado com sucesso.` });
    } catch (error) {
        console.error(`Falha ao reiniciar o monitor '${monitor.name}'.`, error);
        res.status(500).json({ 
            error: `Falha ao executar o script de início para ${monitor.name}.`,
            details: error.stderr || error.stdout || error.message
        });
    }
});

// Endpoint para fornecer informações do sistema para a tela inicial
app.get('/info', (req, res) => {
  const hostname = os.hostname();
  const datetime = new Date().toLocaleString('pt-BR', { hour12: false });
  res.json({ hostname, datetime });
});

// Obter todos os atalhos
app.get('/api/shortcuts', (req, res) => {
    res.json(readShortcuts());
});

// Adicionar ou atualizar um atalho
app.post('/api/shortcuts', (req, res) => {
    const shortcuts = readShortcuts();
    const newShortcut = req.body;
    
    if (!newShortcut.id) {
        newShortcut.id = uuidv4();
    }

    const index = shortcuts.findIndex(s => s.id === newShortcut.id);
    if (index !== -1) {
        shortcuts[index] = newShortcut; // Atualiza
    } else {
        shortcuts.push(newShortcut); // Adiciona
    }
    
    writeShortcuts(shortcuts);
    res.status(201).json(newShortcut);
});

// Deletar um atalho
app.delete('/api/shortcuts/:id', (req, res) => {
    let shortcuts = readShortcuts();
    shortcuts = shortcuts.filter(s => s.id !== req.params.id);
    writeShortcuts(shortcuts);
    res.status(204).send();
});

// Executar um atalho
app.post('/api/shortcuts/execute', async (req, res) => {
    const { shortcutId } = req.body;
    const shortcuts = readShortcuts();
    const shortcut = shortcuts.find(s => s.id === shortcutId);

    if (!shortcut) {
        return res.status(404).json({ error: 'Atalho não encontrado.' });
    }

    console.log(`Executando atalho '${shortcut.name}' com o comando: ${shortcut.command}`);

    try {
        // Separa os comandos por quebra de linha (como nos monitores)
        const commands = shortcut.command.split('\n').map(cmd => cmd.trim()).filter(cmd => cmd !== '');
        
        if (commands.length === 0) {
            throw new Error('Nenhum comando fornecido.');
        }

        let currentWorkingDir = __dirname; // Começa no diretório do projeto

        // Processa comandos cd primeiro para determinar o diretório final
        for (const command of commands) {
            if (command.startsWith('cd ')) {
                const targetDir = command.substring(3).trim();
                const newPath = path.resolve(currentWorkingDir, targetDir);
                
                if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                    currentWorkingDir = newPath;
                    console.log(`Diretório de trabalho alterado para: ${currentWorkingDir}`);
                } else {
                    throw new Error(`Diretório não encontrado: ${newPath}`);
                }
            }
        }

        // Executa o último comando (não-cd) em background
        const lastCommand = commands.filter(cmd => !cmd.startsWith('cd ')).pop();
        
        if (lastCommand) {
            console.log(`Executando comando em background: '${lastCommand}' no diretório: ${currentWorkingDir}`);
            
            // Executa em background sem esperar pela saída
            exec(lastCommand, { 
                cwd: currentWorkingDir,
                detached: true, // Executa em processo separado
                stdio: 'ignore' // Ignora stdin, stdout, stderr
            }, (err) => {
                if (err) {
                    console.error(`Erro ao executar comando em background: ${err.message}`);
                } else {
                    console.log(`Comando '${lastCommand}' iniciado em background com sucesso.`);
                }
            });
            
            // Responde imediatamente sem esperar pela execução
            res.json({ 
                message: `Comando ${shortcut.name} iniciado em background.`,
                output: `Comando executado: ${lastCommand}`
            });
        } else {
            throw new Error('Nenhum comando para executar (apenas comandos cd encontrados).');
        }
        
    } catch (error) {
        console.error(`Falha ao executar atalho '${shortcut.name}'.`, error);
        res.status(500).json({ 
            error: `Falha ao executar o comando ${shortcut.name}.`,
            details: error.message
        });
    }
}); 