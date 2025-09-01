# 🦙 Llama-Swap Manager

> ⚠️ **PROOF OF CONCEPT - WORK IN PROGRESS**
> 
> This is an experimental web interface and should be considered a proof of concept with potential bugs and limitations. It has only been tested with the current [llama-swap](https://github.com/mostlygeek/llama-swap) Docker image which contains llama.cpp and NVIDIA GPU support. Use at your own discretion and expect breaking changes.

A modern web interface for managing [llama-swap](https://github.com/mostlygeek/llama-swap) configurations, models, and monitoring. Provides an intuitive GUI for configuring llama.cpp parameters, downloading models, and monitoring system performance.

## ✨ Features

- 📥 **Smart Model Downloads**: Direct download to your models directory or shell commands if browser permissions don't allow
- ⚙️ **Visual Configuration Builder**: Generate llama-swap YAML configs with form-based interface
- 📊 **System Monitoring**: Real-time connection status, performance metrics, and health checks
- 🎨 **Modern UI**: Dark/light theme with responsive design
- 📋 **Activity Logging**: Live logs with export functionality
- 🔧 **Flexible Settings**: Configurable paths, timeouts, and preferences

## 🚀 Quick Start

### Prerequisites

- [llama-swap](https://github.com/mostlygeek/llama-swap) Docker container running
- Modern web browser (Chrome 86+ or Edge 86+ recommended for direct downloads)
- Docker and docker-compose installed

### Installation

1. **Clone this repository**:
   ```bash
   git clone https://github.com/pkeffect/llama-swap_ui
   cd llama-swap-manager
   ```

2. **Set up your environment**:
   ```bash
   cp example.env .env
   # Edit .env with your preferred settings
   ```

3. **Start the services**:
   ```bash
   docker-compose up -d
   ```

4. **Access the interface**:
   - Manager UI: `http://localhost:3001`
   - Llama-swap API: `http://localhost:8090`

## 📁 File Structure

```
llama-swap-manager/
├── compose.yaml          # Docker compose configuration
├── config.yaml          # Llama-swap model configurations
├── settings.yaml         # Manager-specific settings
├── .env                 # Environment variables
├── example.env          # Example environment file
├── nginx.conf           # Nginx configuration
├── static/              # Web interface files
│   ├── index.html      # Main interface
│   ├── style.css       # Styling
│   └── ui.js           # JavaScript functionality
└── README.md
```

## 🔧 Configuration

### Environment Variables

Key settings in `.env`:

```bash
# Ports
LLAMA_SWAP_PORT=8090    # Llama-swap API port
UI_PORT=3001            # Manager UI port

# Paths
MODELS_PATH=./models    # Local models directory
CONFIG_PATH=./config.yaml

# GPU Settings
NVIDIA_VISIBLE_DEVICES=all
GPU_COUNT=1
```

### Model Configuration

The interface helps you generate configurations like:

```yaml
models:
  "my-model":
    cmd: >
      /app/llama-server
      -m /models/my-model.gguf
      -ngl 99
      -c 4096
      --port ${PORT}
      --host 0.0.0.0
    aliases:
      - "gpt-4"
      - "gpt-3.5-turbo"
```

## 💡 Usage

### Downloading Models

1. Navigate to the **Models** tab
2. Paste a Hugging Face model URL (e.g., `https://huggingface.co/user/model/resolve/main/model.gguf`)
3. Optionally specify a filename
4. Click **Download Model**

The system will:
- Try direct download to your models directory (modern browsers)
- Fall back to providing shell commands for manual execution
- Auto-generate filenames from URLs when needed

### Creating Configurations

1. Go to the **Configuration** tab
2. Fill out the model configuration form
3. Adjust GPU layers, context size, sampling parameters
4. Click **Add to Config** to generate YAML
5. Copy the configuration or apply it directly to your config file

### System Monitoring

The **System** tab provides:
- Connection status to llama-swap
- Performance metrics and health checks
- Docker management commands
- Model testing functionality

## 🔍 API Endpoints

The manager interfaces with llama-swap's OpenAI-compatible API:

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat with models
- Health check and status endpoints

## 🔧 Open WebUI Integration

- Go to edit conneciton in admin settings
- Click on Add Connection icon under OpenAI API
- Add your url:port
- API Key can be whatever
- Suggest using tags or prefix id as well

## ⚠️ Known Limitations

- **Browser Security**: Direct file downloads limited by browser permissions
- **File System Access**: Requires modern browser for directory selection
- **Docker Integration**: Some features generate commands rather than direct actions
- **Testing Scope**: Only tested with specific llama-swap Docker image
- **Model Formats**: Currently focuses on GGUF files only

## 🐛 Troubleshooting

### Connection Issues

1. Verify llama-swap is running: `docker logs llama-swap`
2. Check port configuration in `.env`
3. Ensure firewall allows connections on configured ports

### Download Problems

1. **Browser blocks downloads**: Use the generated shell commands instead
2. **Large files timeout**: Use curl/wget commands with progress bars
3. **Permission errors**: Check models directory permissions

### Configuration Issues

1. **YAML syntax errors**: Use the visual form builder
2. **Model not loading**: Check file paths in container
3. **GPU not detected**: Verify NVIDIA drivers and docker runtime

## 🛠️ Development

### Local Development

```bash
# Serve static files locally
cd static
python -m http.server 8080

# Or use any static file server
npx serve static
```

### Docker Development

```bash
# Build and run with development settings
DEV_MODE=true docker-compose up --build
```

## 🤝 Contributing

This is a proof of concept project. Contributions welcome but expect:

- Breaking changes without notice
- Limited backward compatibility
- Experimental features that may be removed

Please test thoroughly and report issues with:
- Browser version
- Docker environment
- llama-swap version
- Error logs

## 📄 License

[MIT]

## 🔗 Related Projects

- [llama-swap](https://github.com/mostlygeek/llama-swap) - The core LLM switching service
- [llama.cpp](https://github.com/ggerganov/llama.cpp) - The underlying inference engine
- [Open WebUI](https://github.com/open-webui/open-webui) - Alternative web interface for LLMs

## 🙏 Acknowledgments

- [mostlygeek](https://github.com/mostlygeek) for llama-swap
- [ggerganov](https://github.com/ggerganov) for llama.cpp
- The broader open source LLM community

---

**Remember**: This is experimental software. Always backup your configurations and test in non-production environments first.
