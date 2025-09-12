set -e

echo "ðŸ¦™ Llama-Swap Manager Setup"
echo "=========================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "âŒ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose > /dev/null 2>&1 && ! docker compose version > /dev/null 2>&1; then
    echo "âŒ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "ðŸ“ Creating .env file from template..."
    cp .env.example .env
    echo "âœ… Created .env file. You can edit it to customize your setup."
fi

# Create necessary directories
echo "ðŸ“ Creating necessary directories..."
mkdir -p models data/backups data/logs static

# Copy your existing static files to the static directory
if [ -d "static" ] && [ -f "static/index.html" ]; then
    echo "âœ… Static files found"
else
    echo "âš ï¸  Warning: Make sure to copy your existing static files (index.html, style.css, ui.js) to the ./static/ directory"
fi

# Create a basic config.yaml if it doesn't exist
if [ ! -f config.yaml ]; then
    echo "ðŸ“ Creating basic config.yaml..."
    cat > config.yaml << EOF
models:
  # Add your model configurations here
  # Example:
  # "my-model":
  #   cmd: >
  #     /app/llama-server
  #     -m /models/my-model.gguf
  #     -ngl 99
  #     -c 4096
  #     --port \${PORT}
  #     --host 0.0.0.0
EOF
    echo "âœ… Created basic config.yaml"
fi

# Check if NVIDIA GPU support is needed
if command -v nvidia-smi > /dev/null 2>&1; then
    echo "ðŸŽ® NVIDIA GPU detected"
    
    # Check if nvidia-docker is properly set up
    if docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi > /dev/null 2>&1; then
        echo "âœ… NVIDIA Docker support is working"
    else
        echo "âš ï¸  Warning: NVIDIA Docker support may not be properly configured"
        echo "   Please install nvidia-container-toolkit if you plan to use GPU acceleration"
    fi
else
    echo "ðŸ’¡ No NVIDIA GPU detected - will run in CPU mode"
fi

echo ""
echo "ðŸš€ Starting services..."
echo ""

# Use docker-compose or docker compose based on what's available
if command -v docker-compose > /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Build and start services
$COMPOSE_CMD up --build -d

echo ""
echo "â³ Waiting for services to start..."
sleep 10

# Check if services are running
if $COMPOSE_CMD ps | grep -q "llama-swap-manager.*Up"; then
    echo "âœ… Llama-Swap Manager is running"
else
    echo "âŒ Llama-Swap Manager failed to start"
    echo "ðŸ“‹ Checking logs..."
    $COMPOSE_CMD logs llama-swap-manager
    exit 1
fi

if $COMPOSE_CMD ps | grep -q "llama-swap.*Up"; then
    echo "âœ… Llama-Swap service is running"
else
    echo "âš ï¸  Llama-Swap service may not be running properly"
    echo "ðŸ“‹ Checking logs..."
    $COMPOSE_CMD logs llama-swap
fi

echo ""
echo "ðŸŽ‰ Setup complete!"
echo ""
echo "ðŸ“± Access your Llama-Swap Manager at:"
echo "   http://localhost:8000"
echo ""
echo "ðŸ”§ Llama-Swap API is available at:"
echo "   http://localhost:8090"
echo ""
echo "ðŸ“š API Documentation:"
echo "   http://localhost:8000/api/docs"
echo ""
echo "ðŸ› ï¸  Useful commands:"
echo "   View logs:    $COMPOSE_CMD logs -f"
echo "   Stop:         $COMPOSE_CMD down"
echo "   Restart:      $COMPOSE_CMD restart"
echo "   Update:       $COMPOSE_CMD pull && $COMPOSE_CMD up --build -d"
echo ""