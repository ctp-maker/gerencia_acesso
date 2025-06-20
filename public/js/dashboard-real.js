document.addEventListener('DOMContentLoaded', () => {
  // Força o registro do plugin de zoom para garantir compatibilidade
  if (window.ChartZoom) {
    Chart.register(window.ChartZoom);
  }

  // Configuração dos gráficos
  const createChart = (ctx, label) => {
    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [0, 100],
          backgroundColor: ['#0d6efd', '#e9ecef'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  };

  const cpuChart = createChart(document.getElementById('cpuChart'));
  const memChart = createChart(document.getElementById('memChart'));
  const diskChart = createChart(document.getElementById('diskChart'));

  // Conexão WebSocket
  const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketURL = `${socketProtocol}//${window.location.host}`;
  const socket = new WebSocket(socketURL);

  socket.onopen = () => console.log('Conectado ao servidor WebSocket.');
  socket.onclose = () => console.log('Desconectado do servidor WebSocket.');
  socket.onerror = (error) => console.error('Erro no WebSocket:', error);

  socket.onmessage = (event) => {
    const stats = JSON.parse(event.data);

    // Atualizar CPU
    cpuChart.data.datasets[0].data = [stats.cpu, 100 - stats.cpu];
    cpuChart.update();
    document.getElementById('cpuText').textContent = `${stats.cpu}%`;

    // Atualizar Memória
    memChart.data.datasets[0].data = [stats.mem.percent, 100 - stats.mem.percent];
    memChart.update();
    document.getElementById('memText').textContent = `${stats.mem.percent}% (${stats.mem.used} / ${stats.mem.total} GB)`;
    
    // Atualizar Disco
    diskChart.data.datasets[0].data = [stats.disk.percent, 100 - stats.disk.percent];
    diskChart.update();
    document.getElementById('diskText').textContent = `${stats.disk.percent}% (${stats.disk.used} / ${stats.disk.total} GB)`;

    // Atualizar tabela de processos
    const procBody = document.getElementById('procTableBody');
    if (stats.processes && stats.processes.length > 0) {
      procBody.innerHTML = '';
      stats.processes.forEach(proc => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${proc.pid}</td><td>${proc.name}</td><td>${proc.cpu}</td><td>${proc.mem}</td>`;
        procBody.appendChild(tr);
      });
    } else {
      procBody.innerHTML = '<tr><td colspan="4" class="text-center">Nenhum processo encontrado</td></tr>';
    }

    // Atualizar gráfico de histórico
    const now = new Date();
    const label = stats.timestamp || `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
    
    // Adiciona o novo dado
    historyChart.data.labels.push(label);
    historyChart.data.datasets[0].data.push(stats.cpu);
    historyChart.data.datasets[1].data.push(stats.mem.percent);
    historyChart.data.datasets[2].data.push(stats.disk.percent);

    // Limita o número de pontos no gráfico para manter a performance
    const maxDataPoints = 100; // Sincronizado com o backend
    if (historyChart.data.labels.length > maxDataPoints) {
      historyChart.data.labels.shift();
      historyChart.data.datasets.forEach(dataset => {
        dataset.data.shift();
      });
    }

    historyChart.update();
  };

  // ----- NOVA LÓGICA DO TERMINAL COM ABAS -----
  const terminalTabsContainer = document.getElementById('terminalTabs');
  const terminalContentContainer = document.getElementById('terminalContent');
  const newTabBtn = document.getElementById('newTabBtn');
  let activeSessionId = null;

  const terminalTemplate = (sessionId) => `
    <h3 class="card-title text-center mb-4">Terminal Seguro #${sessionId.substring(0, 4)}</h3>
    <form id="cmdForm-${sessionId}" class="mb-3">
        <div id="cwdDisplay-${sessionId}" class="terminal-cwd-path"></div>
        <div class="terminal-input-group">
            <span class="terminal-prompt">$</span>
            <div class="terminal-input-wrapper">
                <input type="text" class="form-control terminal-input" id="cmdGhostInput-${sessionId}" disabled autocomplete="off">
                <input type="text" class="form-control terminal-input" id="cmdInput-${sessionId}" autocomplete="off">
            </div>
        </div>
        <button class="btn btn-primary w-100 mt-2" type="submit">Executar</button>
    </form>
    <div id="cmdOutput-${sessionId}" class="bg-dark text-light rounded p-3" style="min-height:120px;font-family:monospace;white-space:pre;overflow-x:auto;"></div>
  `;

  const createNewTerminal = async () => {
    try {
        const res = await fetch('/api/terminal', { method: 'POST' });
        const data = await res.json();
        const { sessionId, cwd } = data;

        // Criar a aba
        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.sessionId = sessionId;
        tab.innerHTML = `
            <span>Terminal</span>
            <button class="terminal-tab-close">&times;</button>
        `;
        terminalTabsContainer.appendChild(tab);

        // Criar o conteúdo do terminal
        const content = document.createElement('div');
        content.dataset.sessionId = sessionId;
        content.innerHTML = terminalTemplate(sessionId);
        terminalContentContainer.appendChild(content);

        // Adicionar listeners
        tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            closeTerminal(sessionId);
        });
        tab.addEventListener('click', () => switchTerminal(sessionId));
        
        setupTerminal(sessionId, cwd);
        switchTerminal(sessionId);
    } catch (error) {
        console.error("Erro ao criar novo terminal:", error);
    }
  };

  const setupTerminal = (sessionId, initialCwd) => {
      const form = document.getElementById(`cmdForm-${sessionId}`);
      const input = document.getElementById(`cmdInput-${sessionId}`);
      const ghostInput = document.getElementById(`cmdGhostInput-${sessionId}`);
      const output = document.getElementById(`cmdOutput-${sessionId}`);
      const cwdDisplay = document.getElementById(`cwdDisplay-${sessionId}`);
      let directoryContents = [];

      cwdDisplay.textContent = initialCwd;

      form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const cmd = input.value;
          if (!cmd.trim()) return;

          ghostInput.value = '';
          output.textContent = 'Executando...';

          try {
              const res = await fetch('/api/exec', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ cmd, sessionId })
              });
              const data = await res.json();
              output.textContent = data.output;
              cwdDisplay.textContent = data.cwd;
              directoryContents = data.directoryContents || [];
              input.value = '';
          } catch (err) {
              output.textContent = 'Erro ao executar comando.';
          }
      });
      
      input.addEventListener('input', () => {
          const value = input.value;
          if (!value) { ghostInput.value = ''; return; }
          const parts = value.split(' ');
          const lastPart = parts[parts.length - 1];
          if (!lastPart) { ghostInput.value = ''; return; }
          const suggestion = directoryContents.find(item => 
              item.toLowerCase().startsWith(lastPart.toLowerCase()) && 
              item.toLowerCase() !== lastPart.toLowerCase()
          );
          if (suggestion) {
              const ghostParts = value.split(' ');
              ghostParts[ghostParts.length - 1] = suggestion;
              ghostInput.value = ghostParts.join(' ');
          } else {
              ghostInput.value = '';
          }
      });

      input.addEventListener('keydown', (e) => {
          if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghostInput.value) {
              e.preventDefault();
              input.value = ghostInput.value;
              ghostInput.value = '';
          }
      });
  };

  const switchTerminal = (sessionId) => {
    activeSessionId = sessionId;
    // Abas
    document.querySelectorAll('.terminal-tab').forEach(t => t.classList.toggle('active', t.dataset.sessionId === sessionId));
    // Conteúdo
    document.querySelectorAll('#terminalContent > div').forEach(c => c.classList.toggle('active', c.dataset.sessionId === sessionId));
    // Focar no input correto
    document.getElementById(`cmdInput-${sessionId}`).focus();
  };

  const closeTerminal = async (sessionId) => {
    try {
        await fetch(`/api/terminal/${sessionId}`, { method: 'DELETE' });

        const tab = document.querySelector(`.terminal-tab[data-session-id="${sessionId}"]`);
        const content = document.querySelector(`#terminalContent > div[data-session-id="${sessionId}"]`);
        tab.remove();
        content.remove();

        if (activeSessionId === sessionId) {
            const nextTab = terminalTabsContainer.querySelector('.terminal-tab');
            if (nextTab) {
                switchTerminal(nextTab.dataset.sessionId);
            } else {
                activeSessionId = null;
            }
        }
    } catch (error) {
        console.error("Erro ao fechar terminal:", error);
    }
  };

  newTabBtn.addEventListener('click', createNewTerminal);
  // Inicia o primeiro terminal
  createNewTerminal();

  // ----- FIM DA LÓGICA DO TERMINAL COM ABAS -----

  // ----- LÓGICA DOS MONITORES DE SERVIÇO -----
  const monitorsContainer = document.getElementById('monitorsContainer');
  const monitorModalElement = document.getElementById('monitorModal');
  const monitorModal = new bootstrap.Modal(monitorModalElement);
  const monitorForm = document.getElementById('monitorForm');
  const modalTitle = document.getElementById('monitorModalLabel');
  const startCommandsContainer = document.getElementById('startCommandsContainer');
  let activeMonitorCheckers = {};

  const addCommandInput = (command = '') => {
      const commandGroup = document.createElement('div');
      commandGroup.className = 'input-group mb-2';
      commandGroup.innerHTML = `
          <input type="text" class="form-control" value="${command}" required>
          <button class="btn btn-outline-danger remove-command-btn" type="button">×</button>
      `;
      commandGroup.querySelector('.remove-command-btn').addEventListener('click', () => commandGroup.remove());
      startCommandsContainer.appendChild(commandGroup);
  };

  document.getElementById('addCommandBtn').addEventListener('click', () => addCommandInput());

  const monitorCardTemplate = (monitor) => `
    <div class="col-md-6 col-lg-4 mb-4">
        <div class="card monitor-card" id="monitor-${monitor.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h5 class="card-title mb-1">${monitor.name}</h5>
                        <p class="card-text text-muted">Porta: ${monitor.port}</p>
                    </div>
                    <button class="btn btn-sm btn-outline-secondary edit-monitor-btn" data-id="${monitor.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5L13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175l-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/></svg>
                    </button>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-3">
                    <div id="status-${monitor.id}">
                        <span class="status-indicator status-checking"></span>
                        Verificando...
                    </div>
                    <div id="action-btn-container-${monitor.id}" class="btn-group btn-group-sm">
                        <!-- Botões de ação aqui -->
                    </div>
                </div>
                <div id="message-${monitor.id}" class="monitor-message text-danger small mt-2"></div>
            </div>
        </div>
    </div>
  `;

  const renderMonitors = async () => {
      const monitors = await (await fetch('/api/monitors')).json();
      monitorsContainer.innerHTML = '';
      Object.values(activeMonitorCheckers).forEach(clearInterval);
      activeMonitorCheckers = {};

      for (const monitor of monitors) {
          monitorsContainer.innerHTML += monitorCardTemplate(monitor);
          startStatusChecker(monitor);
      }
  };

  const startStatusChecker = (monitor) => {
    const check = async () => {
        const { status } = await (await fetch(`/api/monitors/status/${monitor.port}`)).json();
        updateMonitorUI(monitor, status);
    };
    
    activeMonitorCheckers[monitor.id] = setInterval(check, 5000); // Verifica a cada 5s
    check(); // Verificação imediata
  };

  const updateMonitorUI = (monitor, status) => {
      const statusDiv = document.getElementById(`status-${monitor.id}`);
      const actionContainer = document.getElementById(`action-btn-container-${monitor.id}`);
      
      if (status === 'online') {
          statusDiv.innerHTML = `<span class="status-indicator status-online"></span>Online`;
          actionContainer.innerHTML = `
            <button class="btn btn-warning restart-monitor-btn" data-id="${monitor.id}">Reiniciar</button>
            <button class="btn btn-danger stop-monitor-btn" data-id="${monitor.id}">Parar</button>
          `;
      } else {
          statusDiv.innerHTML = `<span class="status-indicator status-offline"></span>Offline`;
          actionContainer.innerHTML = `<button class="btn btn-success start-monitor-btn" data-id="${monitor.id}">Iniciar</button>`;
      }
  };

  document.getElementById('addMonitorBtn').addEventListener('click', () => {
      modalTitle.textContent = 'Adicionar Novo Monitor';
      monitorForm.reset();
      document.getElementById('monitorId').value = '';
      document.getElementById('deleteMonitorBtn').style.display = 'none';
  });

  monitorsContainer.addEventListener('click', async (e) => {
    const target = e.target.closest('.edit-monitor-btn, .start-monitor-btn, .stop-monitor-btn, .restart-monitor-btn');
    if (!target) return;

    const id = target.dataset.id;
    const monitor = (await (await fetch('/api/monitors')).json()).find(m => m.id === id);
    const messageDiv = document.getElementById(`message-${id}`);
    messageDiv.textContent = ''; // Limpa mensagens de erro antigas

    if (target.matches('.edit-monitor-btn')) {
        modalTitle.textContent = 'Editar Monitor';
        document.getElementById('monitorId').value = monitor.id;
        document.getElementById('monitorName').value = monitor.name;
        document.getElementById('monitorPort').value = monitor.port;
        
        startCommandsContainer.innerHTML = ''; // Limpa antes de adicionar
        if (Array.isArray(monitor.startCmd) && monitor.startCmd.length > 0) {
            monitor.startCmd.forEach(cmd => addCommandInput(cmd));
        } else {
            addCommandInput(); // Adiciona um campo em branco se não houver comandos
        }

        document.getElementById('deleteMonitorBtn').style.display = 'block';
        monitorModal.show();
    } else if (target.matches('.start-monitor-btn') || target.matches('.restart-monitor-btn')) {
        const isRestart = target.matches('.restart-monitor-btn');
        target.textContent = isRestart ? 'Reiniciando...' : 'Iniciando...';
        target.disabled = true;
        
        const endpoint = isRestart ? '/api/monitors/restart' : '/api/monitors/start';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monitorId: monitor.id })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            messageDiv.textContent = `Erro: ${errData.details || errData.error}`;
        }

    } else if (target.matches('.stop-monitor-btn')) {
        target.textContent = 'Parando...';
        target.disabled = true;
        fetch('/api/monitors/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: monitor.port })
        });
    }
  });

  document.getElementById('saveMonitorBtn').addEventListener('click', async () => {
      if (!monitorForm.checkValidity()) {
          monitorForm.reportValidity();
          return;
      }
      
      const commandInputs = startCommandsContainer.querySelectorAll('input');
      const startCmds = Array.from(commandInputs).map(input => input.value.trim()).filter(cmd => cmd);

      const monitor = {
          id: document.getElementById('monitorId').value,
          name: document.getElementById('monitorName').value,
          port: document.getElementById('monitorPort').value,
          startCmd: startCmds, // Salva como um array
      };

      await fetch('/api/monitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(monitor)
      });

      monitorModal.hide();
      renderMonitors();
  });

  document.getElementById('deleteMonitorBtn').addEventListener('click', async () => {
      const id = document.getElementById('monitorId').value;
      if (confirm('Tem certeza que deseja deletar este monitor?')) {
          await fetch(`/api/monitors/${id}`, { method: 'DELETE' });
          monitorModal.hide();
          renderMonitors();
      }
  });

  // Carrega os monitores ao iniciar
  renderMonitors();

  const historyChartCtx = document.getElementById('historyChart');
  const historyChart = new Chart(historyChartCtx, {
    type: 'line',
    data: {
      labels: [], // Timestamps
      datasets: [
        {
          label: 'CPU (%)',
          data: [],
          borderColor: '#0d6efd',
          backgroundColor: 'rgba(13, 110, 253, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'RAM (%)',
          data: [],
          borderColor: '#198754',
          backgroundColor: 'rgba(25, 135, 84, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Disco (%)',
          data: [],
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: value => `${value}%`
          }
        },
        x: {
          ticks: {
            display: true,
            autoSkip: true,
            maxTicksLimit: 20
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
        },
        zoom: {
          pan: {
            enabled: false,
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'x',
          }
        }
      }
    }
  });

  // Botões de controle de zoom
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const resetZoomBtn = document.getElementById('resetZoomBtn');
  
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => historyChart.zoom(1.1));
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => historyChart.zoom(0.9));
  }
  if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', () => historyChart.resetZoom());
  }

  // Função para carregar o histórico inicial do servidor
  const loadInitialHistory = async () => {
    try {
      const response = await fetch('/api/history');
      if (!response.ok) {
        console.error('Falha ao buscar histórico do servidor.');
        return;
      }
      const historyData = await response.json();

      if (!Array.isArray(historyData) || historyData.length === 0) {
        console.log('Nenhum histórico para carregar.');
        return;
      }

      const labels = [];
      const cpuData = [];
      const memData = [];
      const diskData = [];

      historyData.forEach(stats => {
        labels.push(stats.timestamp || '');
        cpuData.push(stats.cpu);
        memData.push(stats.mem.percent);
        diskData.push(stats.disk.percent);
      });

      historyChart.data.labels = labels;
      historyChart.data.datasets[0].data = cpuData;
      historyChart.data.datasets[1].data = memData;
      historyChart.data.datasets[2].data = diskData;
      historyChart.update('none'); // 'none' para evitar animação na carga inicial
    
    } catch (error) {
      console.error('Erro ao carregar dados históricos:', error);
    }
  };

  // Carrega o histórico assim que o gráfico é criado
  loadInitialHistory();
}); 