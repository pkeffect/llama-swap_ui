"""
Llama-Swap Manager FastAPI Backend
Complete backend implementation for the existing frontend
"""

from fastapi import FastAPI, HTTPException, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import yaml
import json
import os
import asyncio
import aiofiles
import aiohttp
import subprocess
from pathlib import Path
from datetime import datetime
import logging
import shutil
from urllib.parse import urlparse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Llama-Swap Manager API",
    description="Backend API for Llama-Swap model management",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
class Settings:
    def __init__(self):
        self.llama_swap_url = os.getenv("LLAMA_SWAP_URL", "http://localhost:8090")
        self.models_path = Path(os.getenv("MODELS_PATH", "./models"))
        self.config_path = Path(os.getenv("CONFIG_PATH", "./config.yaml"))
        self.data_dir = Path(os.getenv("DATA_DIR", "./data"))
        self.max_file_size = int(os.getenv("MAX_FILE_SIZE", "50000000000"))  # 50GB
        
        # Ensure directories exist
        self.models_path.mkdir(exist_ok=True)
        self.data_dir.mkdir(exist_ok=True)
        (self.data_dir / "backups").mkdir(exist_ok=True)
        (self.data_dir / "logs").mkdir(exist_ok=True)

settings = Settings()

# Pydantic models
class ModelConfig(BaseModel):
    name: str
    file_path: str
    ngl: int = 99
    ctx: int = 4096
    batch: int = 2048
    threads: Optional[int] = None
    temp: float = 0.7
    top_p: float = 0.95
    top_k: int = 40
    repeat_penalty: float = 1.10
    ubatch: int = 512
    mlock: bool = False
    numa: Optional[str] = None
    flash_attn: bool = False
    aliases: Optional[List[str]] = None
    advanced: Optional[str] = None

class DownloadRequest(BaseModel):
    url: str
    filename: Optional[str] = None

class SettingsUpdate(BaseModel):
    llama_swap_url: str
    models_path: str
    config_file_path: str
    connection_timeout: int = 30
    refresh_interval: int = 30
    max_log_entries: int = 1000
    auto_detect_models: bool = True
    backup_on_change: bool = True

class LlamaSwapConfig(BaseModel):
    models: Dict[str, Any]

class SystemStats(BaseModel):
    connection_status: str
    active_models: int
    total_requests: int
    memory_usage: str
    gpu_usage: str
    avg_response_time: Optional[int] = None

# In-memory storage for stats and logs
system_stats = {
    "total_requests": 0,
    "response_times": [],
    "memory_usage": "N/A",
    "gpu_usage": "N/A"
}

activity_logs = []

def log_activity(message: str):
    """Add activity log entry"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = f"{timestamp} {message}"
    activity_logs.append(log_entry)
    logger.info(message)
    
    # Keep only last 1000 entries
    if len(activity_logs) > 1000:
        activity_logs[:] = activity_logs[-1000:]

# Utility functions
async def make_llama_swap_request(endpoint: str, method: str = "GET", **kwargs):
    """Make request to llama-swap API"""
    url = f"{settings.llama_swap_url}{endpoint}"
    async with aiohttp.ClientSession() as session:
        async with session.request(method, url, **kwargs) as response:
            if response.status == 200:
                return await response.json()
            else:
                raise HTTPException(status_code=response.status, detail=f"Llama-swap API error: {response.status}")

def load_config() -> Dict[str, Any]:
    """Load current llama-swap configuration"""
    try:
        if settings.config_path.exists():
            with open(settings.config_path, 'r') as f:
                return yaml.safe_load(f) or {"models": {}}
        return {"models": {}}
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return {"models": {}}

def save_config(config: Dict[str, Any]):
    """Save configuration to file"""
    try:
        # Backup existing config if enabled
        if settings.config_path.exists():
            backup_name = f"config-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.yaml"
            backup_path = settings.data_dir / "backups" / backup_name
            shutil.copy2(settings.config_path, backup_path)
            log_activity(f"Config backed up to {backup_name}")
        
        with open(settings.config_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)
        log_activity("Configuration saved successfully")
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save config: {str(e)}")

def build_model_command(config: ModelConfig) -> str:
    """Build llama-server command from configuration"""
    cmd_parts = [
        "/app/llama-server",
        f"-m {config.file_path}",
        f"-ngl {config.ngl}",
        f"-c {config.ctx}",
        f"-b {config.batch}"
    ]
    
    if config.threads:
        cmd_parts.append(f"-t {config.threads}")
    
    cmd_parts.extend([
        f"-ub {config.ubatch}",
        f"--temp {config.temp}",
        f"--top-p {config.top_p}",
        f"--top-k {config.top_k}",
        f"--repeat-penalty {config.repeat_penalty}"
    ])
    
    if config.mlock:
        cmd_parts.append("--mlock")
    
    if config.numa:
        cmd_parts.append(config.numa)
    
    if config.flash_attn:
        cmd_parts.append("--flash-attn")
    
    if config.advanced:
        cmd_parts.append(config.advanced.strip())
    
    cmd_parts.extend(["--port ${PORT}", "--host 0.0.0.0"])
    
    return " ".join(cmd_parts)

# API Routes

@app.get("/")
async def read_root():
    """Serve the main UI"""
    return FileResponse("static/index.html")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# Configuration endpoints
@app.get("/api/config/current", response_model=LlamaSwapConfig)
async def get_current_config():
    """Get current llama-swap configuration"""
    config = load_config()
    log_activity("Current configuration requested")
    return LlamaSwapConfig(models=config.get("models", {}))

@app.post("/api/config/models")
async def add_model_config(model: ModelConfig):
    """Add or update model configuration"""
    try:
        config = load_config()
        
        # Build the model configuration
        model_cmd = build_model_command(model)
        model_config = {"cmd": model_cmd}
        
        if model.aliases:
            model_config["aliases"] = model.aliases
        
        config["models"][model.name] = model_config
        save_config(config)
        
        log_activity(f"Added model configuration: {model.name}")
        return {"message": f"Model '{model.name}' added successfully", "config": model_config}
    
    except Exception as e:
        logger.error(f"Error adding model config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/config/models/{model_name}")
async def remove_model_config(model_name: str):
    """Remove model from configuration"""
    try:
        config = load_config()
        
        if model_name not in config.get("models", {}):
            raise HTTPException(status_code=404, detail=f"Model '{model_name}' not found")
        
        del config["models"][model_name]
        save_config(config)
        
        log_activity(f"Removed model configuration: {model_name}")
        return {"message": f"Model '{model_name}' removed successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing model config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/config/apply")
async def apply_config(config: LlamaSwapConfig):
    """Apply entire configuration to file"""
    try:
        save_config({"models": config.models})
        log_activity("Configuration applied to file")
        return {"message": "Configuration applied successfully"}
    except Exception as e:
        logger.error(f"Error applying config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/config/backup")
async def backup_config():
    """Create and download config backup"""
    try:
        if not settings.config_path.exists():
            raise HTTPException(status_code=404, detail="Config file not found")
        
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_name = f"config-backup-{timestamp}.yaml"
        
        def iterfile():
            with open(settings.config_path, 'rb') as f:
                yield from f
        
        return StreamingResponse(
            iterfile(),
            media_type="application/x-yaml",
            headers={"Content-Disposition": f"attachment; filename={backup_name}"}
        )
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Model management endpoints
@app.get("/api/models")
async def get_models():
    """Get list of available models from llama-swap and local config"""
    try:
        # Get active models from llama-swap
        active_models = []
        try:
            response = await make_llama_swap_request("/v1/models")
            active_models = response.get("data", [])
        except:
            log_activity("Could not fetch active models from llama-swap")
        
        # Get configured models
        config = load_config()
        configured_models = list(config.get("models", {}).keys())
        
        # Get local model files
        local_files = []
        if settings.models_path.exists():
            local_files = [f.name for f in settings.models_path.glob("*.gguf")]
        
        return {
            "active_models": active_models,
            "configured_models": configured_models,
            "local_files": local_files,
            "models_path": str(settings.models_path)
        }
    
    except Exception as e:
        logger.error(f"Error getting models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/models/download")
async def download_model(request: DownloadRequest, background_tasks: BackgroundTasks):
    """Download model from URL"""
    try:
        # Generate filename if not provided
        filename = request.filename
        if not filename:
            parsed_url = urlparse(request.url)
            filename = os.path.basename(parsed_url.path)
            if not filename or not filename.endswith('.gguf'):
                filename = f"model-{datetime.now().strftime('%Y%m%d-%H%M%S')}.gguf"
        
        if not filename.endswith('.gguf'):
            filename += '.gguf'
        
        file_path = settings.models_path / filename
        
        # Check if file already exists
        if file_path.exists():
            raise HTTPException(status_code=409, detail=f"File {filename} already exists")
        
        # Start download in background
        background_tasks.add_task(download_file_background, request.url, file_path, filename)
        
        log_activity(f"Started download: {filename}")
        return {
            "message": f"Download started for {filename}",
            "filename": filename,
            "path": str(file_path)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting download: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def download_file_background(url: str, file_path: Path, filename: str):
    """Background task to download file"""
    try:
        log_activity(f"Downloading {filename}...")
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    raise Exception(f"HTTP {response.status}")
                
                total_size = int(response.headers.get('Content-Length', 0))
                downloaded = 0
                
                async with aiofiles.open(file_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(8192):
                        await f.write(chunk)
                        downloaded += len(chunk)
                        
                        # Log progress every 100MB
                        if downloaded % (100 * 1024 * 1024) == 0:
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                log_activity(f"Download progress {filename}: {percent:.1f}%")
        
        log_activity(f"Download completed: {filename} ({downloaded:,} bytes)")
    
    except Exception as e:
        log_activity(f"Download failed: {filename} - {str(e)}")
        # Clean up partial file
        if file_path.exists():
            file_path.unlink()

@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...)):
    """Upload model file"""
    try:
        if not file.filename.endswith('.gguf'):
            raise HTTPException(status_code=400, detail="Only .gguf files are supported")
        
        if file.size > settings.max_file_size:
            raise HTTPException(status_code=413, detail="File too large")
        
        file_path = settings.models_path / file.filename
        
        if file_path.exists():
            raise HTTPException(status_code=409, detail=f"File {file.filename} already exists")
        
        # Save uploaded file
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        log_activity(f"Model uploaded: {file.filename} ({len(content):,} bytes)")
        return {
            "message": f"Model {file.filename} uploaded successfully",
            "filename": file.filename,
            "size": len(content)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading model: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# System endpoints
@app.get("/api/system/status", response_model=SystemStats)
async def get_system_status():
    """Get system status and statistics"""
    try:
        # Test connection to llama-swap
        connection_status = "disconnected"
        active_models_count = 0
        
        try:
            response = await make_llama_swap_request("/v1/models")
            connection_status = "connected"
            active_models_count = len(response.get("data", []))
        except:
            pass
        
        return SystemStats(
            connection_status=connection_status,
            active_models=active_models_count,
            total_requests=system_stats["total_requests"],
            memory_usage=system_stats["memory_usage"],
            gpu_usage=system_stats["gpu_usage"],
            avg_response_time=None if not system_stats["response_times"] else 
                            sum(system_stats["response_times"]) // len(system_stats["response_times"])
        )
    
    except Exception as e:
        logger.error(f"Error getting system status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/system/test")
async def test_model():
    """Test first available model"""
    try:
        # Get available models
        response = await make_llama_swap_request("/v1/models")
        models = response.get("data", [])
        
        if not models:
            raise HTTPException(status_code=404, detail="No active models available")
        
        test_model_id = models[0]["id"]
        
        # Test the model
        start_time = datetime.now()
        
        test_response = await make_llama_swap_request(
            "/v1/chat/completions",
            method="POST",
            json={
                "model": test_model_id,
                "messages": [{"role": "user", "content": "Hello! Please respond with just 'Test successful'."}],
                "max_tokens": 10,
                "temperature": 0.1
            }
        )
        
        response_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        # Update stats
        system_stats["total_requests"] += 1
        system_stats["response_times"].append(response_time)
        if len(system_stats["response_times"]) > 100:
            system_stats["response_times"] = system_stats["response_times"][-100:]
        
        reply = test_response.get("choices", [{}])[0].get("message", {}).get("content", "No response")
        
        log_activity(f"Model test successful - {test_model_id}: {reply} ({response_time}ms)")
        
        return {
            "model": test_model_id,
            "response": reply,
            "response_time": response_time,
            "status": "success"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing model: {e}")
        raise HTTPException(status_code=500, detail=f"Model test failed: {str(e)}")

# Settings endpoints
@app.post("/api/settings")
async def update_settings(settings_update: SettingsUpdate):
    """Update application settings"""
    try:
        # Update settings (in production, save to file/database)
        settings.llama_swap_url = settings_update.llama_swap_url
        settings.models_path = Path(settings_update.models_path)
        settings.config_path = Path(settings_update.config_file_path)
        
        # Ensure directories exist
        settings.models_path.mkdir(exist_ok=True)
        
        log_activity("Settings updated successfully")
        return {"message": "Settings updated successfully"}
    
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settings")
async def get_settings():
    """Get current settings"""
    return {
        "llama_swap_url": settings.llama_swap_url,
        "models_path": str(settings.models_path),
        "config_file_path": str(settings.config_path),
        "connection_timeout": 30,
        "refresh_interval": 30,
        "max_log_entries": 1000,
        "auto_detect_models": True,
        "backup_on_change": True
    }

# Logging endpoints
@app.get("/api/logs")
async def get_logs():
    """Get activity logs"""
    return {"logs": activity_logs}

@app.delete("/api/logs")
async def clear_logs():
    """Clear activity logs"""
    activity_logs.clear()
    log_activity("Logs cleared by user")
    return {"message": "Logs cleared successfully"}

@app.get("/api/logs/download")
async def download_logs():
    """Download activity logs as text file"""
    try:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        filename = f"llama-swap-logs-{timestamp}.txt"
        content = "\n".join(activity_logs)
        
        def iterfile():
            yield content.encode()
        
        return StreamingResponse(
            iterfile(),
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error downloading logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Docker/System command endpoints
@app.get("/api/system/commands/{command_type}")
async def get_system_commands(command_type: str):
    """Get system management commands"""
    commands = {
        "logs": [
            "# View llama-swap container logs:",
            "docker logs llama-swap -f",
            "",
            "# View recent logs (last 100 lines):",
            "docker logs llama-swap --tail 100",
            "",
            "# Save logs to file:",
            "docker logs llama-swap > llama-swap-logs.txt"
        ],
        "restart": [
            "# Restart llama-swap container:",
            "docker restart llama-swap",
            "",
            "# Or using docker-compose:",
            "docker-compose restart llama-swap",
            "",
            "# Force restart (stop then start):",
            "docker stop llama-swap && docker start llama-swap"
        ],
        "cache": [
            "# Clear Docker system cache:",
            "docker system prune -f",
            "",
            "# Clear model cache (if mounted volume):",
            "docker exec llama-swap rm -rf /tmp/llama-cache/*",
            "",
            "# Restart container to clear memory:",
            "docker restart llama-swap"
        ]
    }
    
    if command_type not in commands:
        raise HTTPException(status_code=404, detail="Command type not found")
    
    return {"commands": "\n".join(commands[command_type])}

if __name__ == "__main__":
    import uvicorn
    
    # Initialize logging
    log_activity("Llama-Swap Manager backend starting...")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )