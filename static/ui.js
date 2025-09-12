class LlamaSwapManager {
    constructor() {
        // FastAPI backend URL
        this.apiBaseUrl = 'http://localhost:8000/api';
        
        this.settings = {
            llamaSwapUrl: 'http://localhost:8090',
            modelsPath: './models',
            configFilePath: './config.yaml',
            connectionTimeout: 30,
            refreshInterval: 30,
            maxLogEntries: 1000,
            autoDetectModels: true,
            backupOnChange: true
        };
        this.generatedConfig = { models: {} };
        this.currentConfig = {};
        this.logs = [];
        this.autoScroll = true;
        this.stats = { 
            totalRequests: 0, 
            avgResponseTime: 0, 
            memoryUsage: 'N/A', 
            gpuUsage: 'N/A' 
        };
        this.init();
    }

    // API request helper
    async apiRequest(endpoint, options = {}) {
        try {
            const url = `${this.apiBaseUrl}${endpoint}`;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    async init() {
        this.setupTheme();
        this.setupTabs();
        this.setupEventListeners();
        this.setupDragDrop();
        await this.loadSettings();
        this.loadFromStorage();
        await this.loadCurrentConfig();
        await this.checkConnection();
        this.startPeriodicUpdates();
        this.logActivity('Llama-Swap Manager initialized with FastAPI backend');
    }

    async loadSettings() {
        try {
            const settings = await this.apiRequest('/settings');
            Object.assign(this.settings, settings);
            this.applySettingsToUI();
        } catch (error) {
            console.error('Failed to load settings from backend:', error);
            const saved = localStorage.getItem('llama-swap-settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
            this.applySettingsToUI();
        }
    }

    applySettingsToUI() {
        document.getElementById('llama-swap-url').value = this.settings.llamaSwapUrl || this.settings.llama_swap_url || 'http://localhost:8090';
        document.getElementById('models-path').value = this.settings.modelsPath || this.settings.models_path || './models';
        document.getElementById('config-file-path').value = this.settings.configFilePath || this.settings.config_file_path || './config.yaml';
        document.getElementById('connection-timeout').value = this.settings.connectionTimeout || this.settings.connection_timeout || 30;
        document.getElementById('refresh-interval').value = this.settings.refreshInterval || this.settings.refresh_interval || 30;
        document.getElementById('max-log-entries').value = this.settings.maxLogEntries || this.settings.max_log_entries || 1000;
        document.getElementById('auto-detect-models').checked = this.settings.autoDetectModels !== false;
        document.getElementById('backup-on-change').checked = this.settings.backupOnChange !== false;
        
        const llamaSwapUrl = this.settings.llamaSwapUrl || this.settings.llama_swap_url || 'http://localhost:8090';
        document.getElementById('current-endpoint').textContent = `${llamaSwapUrl}/v1`;
    }

    async saveSettings() {
        try {
            const settingsData = {
                llama_swap_url: document.getElementById('llama-swap-url').value.trim(),
                models_path: document.getElementById('models-path').value.trim(),
                config_file_path: document.getElementById('config-file-path').value.trim(),
                connection_timeout: parseInt(document.getElementById('connection-timeout').value),
                refresh_interval: parseInt(document.getElementById('refresh-interval').value),
                max_log_entries: parseInt(document.getElementById('max-log-entries').value),
                auto_detect_models: document.getElementById('auto-detect-models').checked,
                backup_on_change: document.getElementById('backup-on-change').checked
            };

            await this.apiRequest('/settings', {
                method: 'POST',
                body: JSON.stringify(settingsData)
            });

            Object.assign(this.settings, settingsData);
            document.getElementById('settings-status').textContent = '✅';
            
            this.showAlert('Settings saved successfully!', 'success');
            this.logActivity('Settings updated and saved');
            this.startPeriodicUpdates();
        } catch (error) {
            document.getElementById('settings-status').textContent = '❌';
            this.showAlert(`Failed to save settings: ${error.message}`, 'danger');
            this.logActivity(`Settings save failed: ${error.message}`);
        }
    }

    resetSettings() {
        if (confirm('Reset all settings to defaults?')) {
            this.settings = {
                llamaSwapUrl: 'http://localhost:8090',
                modelsPath: './models',
                configFilePath: './config.yaml',
                connectionTimeout: 30,
                refreshInterval: 30,
                maxLogEntries: 1000,
                autoDetectModels: true,
                backupOnChange: true
            };
            localStorage.removeItem('llama-swap-settings');
            this.applySettingsToUI();
            this.showAlert('Settings reset to defaults', 'success');
            this.logActivity('Settings reset to defaults');
        }
    }

    async loadCurrentConfig() {
        try {
            const response = await this.apiRequest('/config/current');
            const configYaml = this.generateYAML({ models: response.models });
            document.getElementById('current-config-viewer').textContent = configYaml;
            document.getElementById('config-file-status').textContent = '✅';
            this.logActivity('Config file loaded successfully');
        } catch (error) {
            document.getElementById('current-config-viewer').textContent = `Error loading config: ${error.message}`;
            document.getElementById('config-file-status').textContent = '❌';
            this.logActivity(`Failed to load config: ${error.message}`);
        }
    }

    async applyConfigToFile() {
        if (confirm('Apply generated configuration to config file? This will overwrite the current file.')) {
            try {
                await this.apiRequest('/config/apply', {
                    method: 'POST',
                    body: JSON.stringify(this.generatedConfig)
                });
                
                await this.loadCurrentConfig();
                this.showAlert('Configuration applied to file successfully!', 'success');
                this.logActivity('Generated configuration applied to config file');
            } catch (error) {
                this.showAlert(`Failed to apply config: ${error.message}`, 'danger');
                this.logActivity(`Config application failed: ${error.message}`);
            }
        }
    }

    get baseUrl() {
        return this.settings.llamaSwapUrl || this.settings.llama_swap_url || 'http://localhost:8090';
    }

    setupTheme() {
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = themeToggle.querySelector('.theme-icon');
        const themeText = themeToggle.querySelector('.theme-text');

        const applyTheme = (theme) => {
            if (theme === 'light') {
                document.body.classList.add('light-theme');
                themeIcon.textContent = '🌙';
                themeText.textContent = 'Dark';
            } else {
                document.body.classList.remove('light-theme');
                themeIcon.textContent = '☀️';
                themeText.textContent = 'Light';
            }
        };

        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-theme');
            const newTheme = isLight ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        const contents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
            });
        });
    }

    setupDragDrop() {
        const uploadZone = document.getElementById('upload-zone');
        const fileInput = document.getElementById('file-input');

        uploadZone.addEventListener('click', (e) => {
            if (e.target === uploadZone || e.target.textContent === 'Browse Files' || e.target.closest('button')) {
                fileInput.click();
            }
        });
        
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
    }

    setupEventListeners() {
        // Model management
        document.getElementById('download-btn').addEventListener('click', () => this.downloadModel());
        document.getElementById('refresh-models').addEventListener('click', () => this.renderModels());
        
        // Configuration
        document.getElementById('model-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addModelToConfig();
        });
        document.getElementById('reload-config').addEventListener('click', () => this.loadCurrentConfig());
        document.getElementById('copy-current-config').addEventListener('click', () => this.copyCurrentConfig());
        document.getElementById('backup-config').addEventListener('click', () => this.backupConfig());
        document.getElementById('apply-to-file').addEventListener('click', () => this.applyConfigToFile());
        document.getElementById('clear-form-btn').addEventListener('click', () => this.clearForm());
        document.getElementById('copy-config').addEventListener('click', () => this.copyConfig());
        document.getElementById('clear-config').addEventListener('click', () => this.clearConfig());
        document.getElementById('export-config').addEventListener('click', () => this.exportConfig());
        document.getElementById('test-config').addEventListener('click', () => this.checkConnection(true));
        
        // Settings
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());
        document.getElementById('test-connection').addEventListener('click', () => this.testConnectionFromSettings());
        
        // System
        document.getElementById('check-status').addEventListener('click', () => this.checkConnection(true));
        document.getElementById('test-model').addEventListener('click', () => this.testModel());
        document.getElementById('open-gui').addEventListener('click', () => this.openGUI());
        document.getElementById('view-logs-cmd').addEventListener('click', () => this.showDockerCommands());
        document.getElementById('restart-service').addEventListener('click', () => this.showRestartCommands());
        document.getElementById('clear-cache').addEventListener('click', () => this.showClearCacheCommands());
        document.getElementById('stop-all').addEventListener('click', () => this.stopAllModels());
        document.getElementById('refresh-stats').addEventListener('click', () => this.refreshStats());
        document.getElementById('quick-test').addEventListener('click', () => this.quickTest());
        document.getElementById('health-check').addEventListener('click', () => this.healthCheck());
        
        // Logs
        document.getElementById('clear-logs').addEventListener('click', () => this.clearLogs());
        document.getElementById('download-logs').addEventListener('click', () => this.downloadLogs());
        document.getElementById('auto-scroll-toggle').addEventListener('click', () => this.toggleAutoScroll());
    }

    async downloadModel() {
        const url = document.getElementById('model-url').value.trim();
        let filename = document.getElementById('model-filename').value.trim();
        
        if (!url) {
            this.showAlert('Please provide a model URL', 'warning');
            return;
        }
        
        try {
            this.showProgress(0, 'Starting download...');
            
            const response = await this.apiRequest('/models/download', {
                method: 'POST',
                body: JSON.stringify({ url, filename: filename || null })
            });
            
            this.hideProgress();
            this.showAlert(response.message, 'success');
            this.logActivity(`Download started: ${response.filename}`);
            
            document.getElementById('model-url').value = '';
            document.getElementById('model-filename').value = '';
            
            setTimeout(() => this.renderModels(), 2000);
            
        } catch (error) {
            this.hideProgress();
            this.showAlert(`Download failed: ${error.message}`, 'danger');
            this.logActivity(`Download failed: ${error.message}`);
        }
    }

    async testConnectionFromSettings() {
        const originalUrl = this.settings.llamaSwapUrl;
        const testUrl = document.getElementById('llama-swap-url').value.trim();
        
        if (testUrl !== originalUrl) {
            this.settings.llamaSwapUrl = testUrl;
        }
        
        try {
            const success = await this.checkConnection(true);
            document.getElementById('connection-test-result').textContent = success ? '✅' : '❌';
        } catch (error) {
            document.getElementById('connection-test-result').textContent = '❌';
        } finally {
            if (testUrl !== originalUrl) {
                this.settings.llamaSwapUrl = originalUrl;
            }
        }
    }

    copyCurrentConfig() {
        const configText = document.getElementById('current-config-viewer').textContent;
        navigator.clipboard.writeText(configText).then(() => {
            this.showAlert('Current configuration copied to clipboard!', 'success');
            this.logActivity('Current configuration copied to clipboard');
        }).catch(() => {
            this.showAlert('Failed to copy to clipboard', 'danger');
        });
    }

    async backupConfig() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/config/backup`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'config-backup.yaml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showAlert('Configuration backup downloaded', 'success');
            this.logActivity('Configuration backup created and downloaded');
            
        } catch (error) {
            this.showAlert(`Backup failed: ${error.message}`, 'danger');
            this.logActivity(`Config backup failed: ${error.message}`);
        }
    }

    async handleFiles(files) {
        for (const file of files) {
            if (file.name.endsWith('.gguf')) {
                await this.uploadFile(file);
            } else {
                this.showAlert(`${file.name} is not a GGUF file`, 'warning');
                this.logActivity(`Rejected non-GGUF file: ${file.name}`);
            }
        }
    }

    async uploadFile(file) {
        try {
            this.logActivity(`Starting upload: ${file.name} (${this.formatFileSize(file.size)})`);
            this.showProgress(0, `Uploading ${file.name}...`);
            
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${this.apiBaseUrl}/models/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            
            const result = await response.json();
            
            this.hideProgress();
            this.showAlert(result.message, 'success');
            this.logActivity(`Upload completed: ${file.name}`);
            await this.renderModels();
            
        } catch (error) {
            this.hideProgress();
            this.showAlert(`Failed to upload ${file.name}: ${error.message}`, 'danger');
            this.logActivity(`Upload failed: ${file.name} - ${error.message}`);
        }
    }

    async checkConnection(showAlerts = false) {
        const statusEl = document.getElementById('connection-status');
        const activeModelsEl = document.getElementById('active-models-count');
        
        try {
            const systemStatus = await this.apiRequest('/system/status');
            
            if (systemStatus.connection_status === 'connected') {
                statusEl.innerHTML = '<div class="status-indicator"><div class="status-dot connected"></div>Connected</div>';
                if (activeModelsEl) activeModelsEl.textContent = systemStatus.active_models;
                
                if (showAlerts) {
                    this.showAlert('Connection successful!', 'success');
                    this.logActivity(`Connected to llama-swap - ${systemStatus.active_models} models available`);
                }
                await this.renderModels();
                return true;
            } else {
                throw new Error('Disconnected');
            }
        } catch (error) {
            statusEl.innerHTML = '<div class="status-indicator"><div class="status-dot disconnected"></div>Disconnected</div>';
            if (activeModelsEl) activeModelsEl.textContent = '-';
            
            if (showAlerts) {
                this.showAlert(`Cannot connect to llama-swap: ${error.message}`, 'danger');
                this.logActivity(`Connection failed: ${error.message}`);
            }
            await this.renderModels();
            return false;
        }
    }

    async renderModels() {
        try {
            const modelsData = await this.apiRequest('/models');
            const { active_models, configured_models, local_files } = modelsData;
            
            const activeModelMap = new Map(active_models.map(m => [m.id, m]));
            
            const allModelIds = [...new Set([
                ...activeModelMap.keys(),
                ...configured_models,
                ...local_files.map(f => f.replace('.gguf', ''))
            ])];

            document.getElementById('model-count').textContent = 
                `${active_models.length} active | ${configured_models.length} configured | ${local_files.length} local files`;

            const container = document.getElementById('models-list');
            if (allModelIds.length === 0) {
                container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem;">No models found. Add a model to your configuration or ensure llama-swap is running with models loaded.</p>';
                return;
            }

            container.innerHTML = allModelIds.sort().map(modelId => {
                const isActive = activeModelMap.has(modelId);
                const isConfigured = configured_models.includes(modelId);
                const hasLocalFile = local_files.some(f => f.replace('.gguf', '') === modelId);
                const modelData = activeModelMap.get(modelId);

                const statusBadge = isActive
                    ? `<span class="status-badge status-active">🟢 Active</span>`
                    : `<span class="status-badge status-inactive">⚪ Inactive</span>`;
                
                let details = '';
                if (isActive && modelData) {
                    details = `<p style="color: var(--text-secondary); margin: 0; font-size: 0.875rem;">
                                Owner: ${modelData.owned_by} • Created: ${new Date(modelData.created * 1000).toLocaleString()}
                            </p>`;
                } else if (hasLocalFile) {
                    details = `<p style="color: var(--text-secondary); margin: 0; font-size: 0.875rem;">
                                Local file available • Ready for configuration
                            </p>`;
                }

                return `
                    <div class="model-card">
                        <div class="model-header">
                            <div>
                                <h3 class="model-name">${modelId}</h3>
                                ${details}
                            </div>
                            <div class="model-actions">
                                ${statusBadge}
                                ${isConfigured ? `
                                    <button class="btn btn-secondary" onclick="manager.editModelConfig('${modelId}')">
                                        ✍️ Edit
                                    </button>
                                    <button class="btn btn-danger" onclick="manager.removeModelFromConfig('${modelId}')">
                                        🗑️ Remove
                                    </button>
                                ` : `
                                    <button class="btn btn-secondary" onclick="manager.useModel('${modelId}')">
                                        ➕ Add Config
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error rendering models:', error);
            document.getElementById('models-list').innerHTML = 
                `<p style="color: var(--danger); text-align: center; padding: 2rem;">Error loading models: ${error.message}</p>`;
        }
    }

    useModel(modelId) {
        document.getElementById('config-name').value = modelId;
        document.getElementById('config-file').value = `/models/${modelId}.gguf`;
        document.querySelector('[data-tab="config"]').click();
        this.showAlert(`Pre-filled form with model: ${modelId}`, 'success');
        this.logActivity(`Pre-filled configuration for model: ${modelId}`);
    }

    async addModelToConfig() {
        const formData = this.getFormData();
        if (!formData.name || !formData.file) {
            this.showAlert('Model name and file path are required', 'warning');
            return;
        }

        try {
            const modelConfig = {
                name: formData.name,
                file_path: formData.file,
                ngl: parseInt(formData.ngl),
                ctx: parseInt(formData.ctx),
                batch: parseInt(formData.batch),
                threads: formData.threads ? parseInt(formData.threads) : null,
                temp: parseFloat(formData.temp),
                top_p: parseFloat(formData.topP),
                top_k: parseInt(formData.topK),
                repeat_penalty: parseFloat(formData.repeatPenalty),
                ubatch: parseInt(formData.ubatch),
                mlock: formData.mlock === '--mlock',
                numa: formData.numa || null,
                flash_attn: formData.flashAttn === '--flash-attn',
                aliases: formData.aliases ? formData.aliases.split(',').map(a => a.trim()).filter(a => a) : null,
                advanced: formData.advanced || null
            };

            const response = await this.apiRequest('/config/models', {
                method: 'POST',
                body: JSON.stringify(modelConfig)
            });

            this.generatedConfig.models[formData.name] = response.config;
            this.updateConfigDisplay();
            this.saveToStorage();
            
            this.showAlert(`Added "${formData.name}" to configuration`, 'success');
            this.logActivity(`Added model configuration: ${formData.name}`);
            this.renderModels();
            this.clearForm();
            
        } catch (error) {
            this.showAlert(`Failed to add model: ${error.message}`, 'danger');
            this.logActivity(`Failed to add model configuration: ${error.message}`);
        }
    }

    getFormData() {
        return {
            name: document.getElementById('config-name').value.trim(),
            file: document.getElementById('config-file').value.trim(),
            ngl: document.getElementById('config-ngl').value || '99',
            ctx: document.getElementById('config-ctx').value || '4096',
            batch: document.getElementById('config-batch').value || '2048',
            threads: document.getElementById('config-threads').value,
            temp: document.getElementById('config-temp').value || '0.7',
            topP: document.getElementById('config-top-p').value || '0.95',
            topK: document.getElementById('config-top-k').value || '40',
            repeatPenalty: document.getElementById('config-repeat-penalty').value || '1.10',
            ubatch: document.getElementById('config-ubatch').value || '512',
            mlock: document.getElementById('config-mlock').value,
            numa: document.getElementById('config-numa').value,
            flashAttn: document.getElementById('config-flash-attn').value,
            aliases: document.getElementById('config-aliases').value,
            advanced: document.getElementById('config-advanced').value
        };
    }

    async removeModelFromConfig(modelId) {
        if (confirm(`Are you sure you want to remove "${modelId}" from your configuration?`)) {
            try {
                await this.apiRequest(`/config/models/${encodeURIComponent(modelId)}`, {
                    method: 'DELETE'
                });
                
                delete this.generatedConfig.models[modelId];
                this.saveToStorage();
                this.updateConfigDisplay();
                this.renderModels();
                
                this.showAlert(`Removed "${modelId}" from configuration`, 'success');
                this.logActivity(`Removed model configuration: ${modelId}`);
                
            } catch (error) {
                this.showAlert(`Failed to remove model: ${error.message}`, 'danger');
                this.logActivity(`Failed to remove model: ${error.message}`);
            }
        }
    }

    clearForm() {
        document.getElementById('model-form').reset();
        document.getElementById('config-ngl').value = '99';
        document.getElementById('config-ctx').value = '4096';
        document.getElementById('config-batch').value = '2048';
        document.getElementById('config-ubatch').value = '512';
        document.getElementById('config-temp').value = '0.7';
        document.getElementById('config-top-p').value = '0.95';
        document.getElementById('config-top-k').value = '40';
        document.getElementById('config-repeat-penalty').value = '1.10';
        document.getElementById('config-name').focus();
    }

    updateConfigDisplay() {
        const configYaml = this.generateYAML(this.generatedConfig);
        document.getElementById('generated-config').textContent = configYaml;
    }

    generateYAML(obj, indent = 0) {
        let yaml = '';
        const spaces = '  '.repeat(indent);
        
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && !Array.isArray(value)) {
                if (Object.keys(value).length === 0) {
                    yaml += `${spaces}${key}:\n`;
                } else {
                    yaml += `${spaces}${key}:\n`;
                    yaml += this.generateYAML(value, indent + 1);
                }
            } else if (Array.isArray(value)) {
                yaml += `${spaces}${key}:\n`;
                value.forEach(item => yaml += `${spaces}  - ${item}\n`);
            } else if (key === 'cmd') {
                yaml += `${spaces}${key}: >\n${spaces}  ${value}\n`;
            } else {
                yaml += `${spaces}${key}: ${value}\n`;
            }
        }
        
        if (yaml.trim() === 'models:') {
            yaml = 'models:\n  # Add models using the configuration form above\n  # They will appear here ready to copy to your config.yaml';
        }
        
        return yaml;
    }
    
    copyConfig() {
        const configText = document.getElementById('generated-config').textContent;
        navigator.clipboard.writeText(configText).then(() => {
            this.showAlert('Configuration copied to clipboard!', 'success');
            this.logActivity('Configuration copied to clipboard');
        }).catch(() => {
            this.showAlert('Failed to copy to clipboard', 'danger');
        });
    }

    exportConfig() {
        const configText = document.getElementById('generated-config').textContent;
        const blob = new Blob([configText], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'llama-swap-config.yaml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showAlert('Configuration exported as YAML file', 'success');
        this.logActivity('Configuration exported to file');
    }

    clearConfig() {
        if (confirm('Are you sure you want to clear the entire generated configuration?')) {
            this.generatedConfig = { models: {} };
            this.updateConfigDisplay();
            this.saveToStorage();
            this.renderModels();
            this.showAlert('Configuration cleared', 'success');
            this.logActivity('All configuration cleared');
        }
    }

    async testModel() {
        try {
            this.logActivity('Starting model test...');
            
            const response = await this.apiRequest('/system/test', {
                method: 'POST'
            });
            
            this.showAlert(`Test successful! Model: ${response.model}, Response: "${response.response}" (${response.response_time}ms)`, 'success');
            this.logActivity(`Model test successful - ${response.model}: ${response.response} (${response.response_time}ms)`);
            
            this.stats.totalRequests++;
            this.stats.avgResponseTime = response.response_time;
            this.updateStatsDisplay();
            
        } catch (error) {
            this.showAlert(`Model test failed: ${error.message}`, 'danger');
            this.logActivity(`Model test failed: ${error.message}`);
        }
    }

    showDockerCommands() {
        const commands = [
            '# View llama-swap container logs:',
            'docker logs llama-swap -f',
            '',
            '# View recent logs (last 100 lines):',
            'docker logs llama-swap --tail 100',
            '',
            '# Save logs to file:',
            'docker logs llama-swap > llama-swap-logs.txt'
        ].join('\n');
        
        this.showCommandsModal('Docker Log Commands', commands);
        this.logActivity('Generated Docker log commands');
    }

    showRestartCommands() {
        const commands = [
            '# Restart llama-swap container:',
            'docker restart llama-swap',
            '',
            '# Or using docker-compose:',
            'docker-compose restart llama-swap',
            '',
            '# Force restart (stop then start):',
            'docker stop llama-swap && docker start llama-swap'
        ].join('\n');
        
        this.showCommandsModal('Restart Commands', commands);
        this.logActivity('Generated restart commands');
    }

    showClearCacheCommands() {
        const commands = [
            '# Clear Docker system cache:',
            'docker system prune -f',
            '',
            '# Clear model cache (if mounted volume):',
            'docker exec llama-swap rm -rf /tmp/llama-cache/*',
            '',
            '# Restart container to clear memory:',
            'docker restart llama-swap'
        ].join('\n');
        
        this.showCommandsModal('Clear Cache Commands', commands);
        this.logActivity('Generated cache clear commands');
    }

    showCommandsModal(title, commands) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            backdrop-filter: blur(5px);
        `;
        
        overlay.innerHTML = `
            <div style="
                background: var(--surface-primary);
                border: 1px solid var(--border-primary);
                border-radius: 12px;
                padding: 2rem;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: var(--shadow-lg);
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0; color: var(--text-primary); font-weight: 600;">${title}</h3>
                    <button style="
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: var(--text-secondary);
                        padding: 0.25rem;
                        border-radius: 4px;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='var(--surface-secondary)'" 
                       onmouseout="this.style.background='none'"
                       onclick="this.closest('[style*=position]').remove()">×</button>
                </div>
                <pre style="
                    background: var(--code-bg);
                    border: 1px solid var(--border-primary);
                    border-radius: 8px;
                    padding: 1rem;
                    margin: 1rem 0;
                    white-space: pre-wrap;
                    font-family: 'SF Mono', Monaco, monospace;
                    font-size: 0.875rem;
                    color: var(--text-secondary);
                    line-height: 1.4;
                ">${commands}</pre>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="
                        navigator.clipboard.writeText(\`${commands.replace(/`/g, '\\`')}\`).then(() => {
                            this.innerHTML = '✓ Copied!';
                            setTimeout(() => this.innerHTML = '📋 Copy Commands', 2000);
                        });
                    ">📋 Copy Commands</button>
                    <button class="btn btn-secondary" onclick="this.closest('[style*=position]').remove()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
        
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    async stopAllModels() {
        if (confirm('Are you sure you want to stop all running models?')) {
            this.showAlert('Stop all models logged - implement via backend API', 'warning');
            this.logActivity('Stop all models requested (requires backend implementation)');
        }
    }

    openGUI() {
        window.open(`${this.baseUrl}`, '_blank');
        this.logActivity('Opened llama-swap GUI in new window');
    }

    refreshStats() {
        this.updateStatsDisplay();
        this.logActivity('System statistics refreshed');
    }

    async quickTest() {
        try {
            this.logActivity('Starting quick diagnostic test...');
            
            const response = await this.apiRequest('/system/test', {
                method: 'POST'
            });
            
            const responseTime = response.response_time;
            document.getElementById('last-response-time').textContent = `${responseTime}ms`;
            document.getElementById('api-status').innerHTML = responseTime > 5000 ? 
                '<span style="color: var(--warning)">⚠️ Slow</span>' : 
                '<span style="color: var(--success)">✅ Good</span>';
            
            document.getElementById('api-status-metric').textContent = responseTime > 5000 ? '⚠️' : '✅';
            
            const status = responseTime > 10000 ? 'Very slow' : responseTime > 5000 ? 'Slow' : 'Good';
            this.showAlert(`Quick test: ${responseTime}ms - ${status}`, responseTime > 5000 ? 'warning' : 'success');
            this.logActivity(`Quick test completed - ${responseTime}ms (${status})`);
        } catch (error) {
            this.showAlert(`Quick test failed: ${error.message}`, 'danger');
            this.logActivity(`Quick test failed: ${error.message}`);
            document.getElementById('api-status').innerHTML = '<span style="color: var(--danger)">❌ Error</span>';
            document.getElementById('api-status-metric').textContent = '❌';
        }
    }

    async healthCheck() {
        this.logActivity('Running comprehensive health check...');
        const results = [];
        
        try {
            const systemStatus = await this.apiRequest('/system/status');
            
            if (systemStatus.connection_status === 'connected') {
                results.push(`✅ API responding`);
                results.push(`✅ ${systemStatus.active_models} models loaded`);
                
                if (systemStatus.active_models > 0) {
                    try {
                        const testResponse = await this.apiRequest('/system/test', { method: 'POST' });
                        const inferenceTime = testResponse.response_time;
                        
                        const status = inferenceTime > 10000 ? '⚠️ Very slow' : 
                                     inferenceTime > 5000 ? '⚠️ Slow' : '✅ Good';
                        results.push(`${status} Inference: ${inferenceTime}ms`);
                        
                        if (inferenceTime > 10000) {
                            results.push(`💡 Suggestion: Check GPU usage (-ngl setting)`);
                        }
                    } catch (error) {
                        results.push(`❌ Inference error: ${error.message}`);
                    }
                }
            } else {
                results.push(`❌ API error: ${systemStatus.connection_status}`);
            }
            
            try {
                if (performance.memory) {
                    const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                    results.push(`📊 Browser memory: ${usedMB}MB`);
                }
            } catch (e) {
                results.push(`📊 Memory info not available`);
            }
            
        } catch (error) {
            results.push(`❌ Health check failed: ${error.message}`);
        }
        
        const resultText = results.join('\n');
        this.showCommandsModal('Health Check Results', resultText);
        this.logActivity('Health check completed');
    }

    updateStatsDisplay() {
        const totalReqEl = document.getElementById('total-requests');
        const avgRespEl = document.getElementById('avg-response-time');
        const lastRespEl = document.getElementById('last-response-time');
        const memUsageEl = document.getElementById('memory-usage');
        const gpuUsageEl = document.getElementById('gpu-usage');
        const apiStatusEl = document.getElementById('api-status');

        // Update metric cards
        document.getElementById('memory-usage-metric').textContent = this.stats.memoryUsage;
        document.getElementById('gpu-usage-metric').textContent = this.stats.gpuUsage;
        document.getElementById('avg-response-metric').textContent = 
            this.stats.avgResponseTime ? `${this.stats.avgResponseTime}ms` : '-';

        if (totalReqEl) totalReqEl.textContent = this.stats.totalRequests;
        if (avgRespEl) {
            const avgTime = this.stats.avgResponseTime;
            avgRespEl.textContent = avgTime ? `${avgTime}ms` : '-';
            if (avgTime > 10000) {
                avgRespEl.style.color = 'var(--danger)';
            } else if (avgTime > 5000) {
                avgRespEl.style.color = 'var(--warning)';
            } else {
                avgRespEl.style.color = 'var(--success)';
            }
        }
        if (lastRespEl && this.stats.lastResponseTime) {
            lastRespEl.textContent = `${this.stats.lastResponseTime}ms`;
        }
        if (memUsageEl) memUsageEl.textContent = this.stats.memoryUsage;
        if (gpuUsageEl) gpuUsageEl.textContent = this.stats.gpuUsage;
    }

    logActivity(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `${timestamp} ${message}`;
        this.logs.push(logEntry);
        
        const logContainer = document.getElementById('logs-container');
        if (logContainer) {
            logContainer.textContent += logEntry + '\n';
            if (this.autoScroll) {
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        }
        
        if (this.logs.length > this.settings.maxLogEntries) {
            this.logs = this.logs.slice(-this.settings.maxLogEntries);
            logContainer.textContent = this.logs.join('\n') + '\n';
        }
    }

    async clearLogs() {
        try {
            await this.apiRequest('/logs', { method: 'DELETE' });
            this.logs = [];
            const logContainer = document.getElementById('logs-container');
            if (logContainer) {
                logContainer.textContent = 'Logs cleared.\n';
            }
            this.showAlert('Logs cleared successfully', 'success');
        } catch (error) {
            this.showAlert(`Failed to clear logs: ${error.message}`, 'danger');
        }
    }

    async downloadLogs() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/logs/download`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'logs.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showAlert('Logs downloaded', 'success');
            this.logActivity('Logs exported to file');
            
        } catch (error) {
            this.showAlert(`Download failed: ${error.message}`, 'danger');
        }
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        const button = document.getElementById('auto-scroll-toggle');
        if (button) {
            button.textContent = `📜 Auto-scroll: ${this.autoScroll ? 'ON' : 'OFF'}`;
            if (this.autoScroll) {
                const logContainer = document.getElementById('logs-container');
                if (logContainer) {
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            }
        }
        this.logActivity(`Auto-scroll ${this.autoScroll ? 'enabled' : 'disabled'}`);
    }

    showProgress(percent, text) {
        const container = document.getElementById('progress-container');
        const fill = document.getElementById('progress-fill');
        const textEl = document.getElementById('progress-text');
        
        if (container && fill && textEl) {
            container.style.display = 'block';
            fill.style.width = `${percent}%`;
            textEl.textContent = text;
        }
    }

    hideProgress() {
        const container = document.getElementById('progress-container');
        if (container) {
            container.style.display = 'none';
        }
    }

    showAlert(message, type = 'success') {
        const existing = document.querySelector('.alert');
        if (existing) existing.remove();

        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        
        let icon = '✓';
        switch(type) {
            case 'warning': icon = '⚠️'; break;
            case 'danger': icon = '❌'; break;
            case 'info': icon = 'ℹ️'; break;
            default: icon = '✅';
        }
        
        alert.innerHTML = `
            <span>${icon} ${message}</span>
            <button style="background: none; border: none; color: inherit; cursor: pointer; margin-left: auto; font-size: 18px; padding: 0.25rem;" onclick="this.parentElement.remove()">✖️</button>
        `;
        
        document.body.appendChild(alert);
        setTimeout(() => alert.classList.add('show'), 10);
        setTimeout(() => {
            if (alert.parentElement) {
                alert.classList.remove('show');
                setTimeout(() => alert.remove(), 300);
            }
        }, 7000);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    saveToStorage() {
        try {
            localStorage.setItem('llama-swap-config', JSON.stringify(this.generatedConfig));
            localStorage.setItem('llama-swap-stats', JSON.stringify(this.stats));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    loadFromStorage() {
        try {
            const savedConfig = localStorage.getItem('llama-swap-config');
            if (savedConfig) {
                this.generatedConfig = JSON.parse(savedConfig);
                this.updateConfigDisplay();
            }

            const savedStats = localStorage.getItem('llama-swap-stats');
            if (savedStats) {
                this.stats = { ...this.stats, ...JSON.parse(savedStats) };
                this.updateStatsDisplay();
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }

    startPeriodicUpdates() {
        // Clear existing intervals
        if (this.intervals) {
            this.intervals.forEach(clearInterval);
        }
        
        this.intervals = [
            setInterval(() => this.checkConnection(false), this.settings.refreshInterval * 1000),
            setInterval(() => this.refreshStats(), 60000),
            setInterval(() => this.saveToStorage(), 300000)
        ];
    }
}

// Initialize the manager when the page loads
const manager = new LlamaSwapManager();
window.manager = manager;

setTimeout(() => {
    manager.showAlert('🦙 Welcome to Llama-Swap Manager! Now with FastAPI backend.', 'success');
}, 1000);