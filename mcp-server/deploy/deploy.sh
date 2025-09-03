#!/bin/bash

# Minecraft MCP Server Deployment Script
# This script sets up the MCP SSE server as a systemd service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Minecraft MCP Server Deployment${NC}"
echo "=================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   exit 1
fi

# Configuration
MCP_USER="minecraft-mcp"
MCP_DIR="/opt/minecraft-mcp"
CONFIG_DIR="/etc/minecraft-mcp"
LOG_DIR="/var/log/minecraft-mcp"
SERVICE_FILE="/etc/systemd/system/minecraft-mcp.service"

echo -e "${YELLOW}Step 1: Creating user and directories${NC}"

# Create user if doesn't exist
if ! id "$MCP_USER" &>/dev/null; then
    useradd -r -s /bin/false $MCP_USER
    echo "Created user: $MCP_USER"
fi

# Create directories
mkdir -p $MCP_DIR
mkdir -p $CONFIG_DIR
mkdir -p $LOG_DIR

echo -e "${YELLOW}Step 2: Copying application files${NC}"

# Copy the built application
cp -r dist package.json node_modules $MCP_DIR/
chown -R $MCP_USER:$MCP_USER $MCP_DIR

echo -e "${YELLOW}Step 3: Setting up configuration${NC}"

# Generate API key if not exists
API_KEY_FILE="$CONFIG_DIR/api-key"
if [ ! -f "$API_KEY_FILE" ]; then
    openssl rand -hex 32 > "$API_KEY_FILE"
    chmod 600 "$API_KEY_FILE"
    chown $MCP_USER:$MCP_USER "$API_KEY_FILE"
    echo -e "${GREEN}Generated API key in $API_KEY_FILE${NC}"
    echo -e "${YELLOW}SAVE THIS KEY:${NC} $(cat $API_KEY_FILE)"
else
    echo "API key already exists"
fi

# Create environment file
ENV_FILE="$CONFIG_DIR/server.env"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << EOF
# Minecraft MCP Server Configuration
PORT=3000
BIND_ADDRESS=0.0.0.0

# SSL certificates (optional)
#SSL_CERT_FILE=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
#SSL_KEY_FILE=/etc/letsencrypt/live/yourdomain.com/privkey.pem

# Default Minecraft server (optional)
#DEFAULT_MC_HOST=play.example.com
#DEFAULT_MC_PORT=25565
EOF
    echo "Created environment file: $ENV_FILE"
else
    echo "Environment file already exists"
fi

chown $MCP_USER:$MCP_USER $CONFIG_DIR/*
chmod 600 $CONFIG_DIR/*

echo -e "${YELLOW}Step 4: Installing systemd service${NC}"

# Copy service file
cp deploy/minecraft-mcp.service $SERVICE_FILE

# Set correct permissions for logs
chown -R $MCP_USER:$MCP_USER $LOG_DIR

echo -e "${YELLOW}Step 5: Enabling and starting service${NC}"

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable minecraft-mcp.service

# Start service
systemctl start minecraft-mcp.service

echo -e "${YELLOW}Step 6: Setting up firewall (ufw)${NC}"

# Check if ufw is available
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp comment 'Minecraft MCP SSE Server'
    echo "Firewall rule added for port 3000"
else
    echo "UFW not found, skipping firewall configuration"
fi

echo
echo -e "${GREEN}Deployment complete!${NC}"
echo
echo "Service status:"
systemctl status minecraft-mcp.service --no-pager

echo
echo -e "${YELLOW}Important information:${NC}"
echo "- API Key: $(cat $API_KEY_FILE)"
echo "- Service: minecraft-mcp.service"
echo "- Logs: journalctl -u minecraft-mcp -f"
echo "- Config: $CONFIG_DIR/"
echo "- Server URL: https://$(hostname -I | cut -d' ' -f1):3000/sse"
echo
echo -e "${YELLOW}To test the server:${NC}"
echo "curl -H 'X-API-Key: $(cat $API_KEY_FILE)' https://$(hostname -I | cut -d' ' -f1):3000/health"
echo
echo -e "${YELLOW}SSL/TLS Setup:${NC}"
echo "1. Install certbot: apt install certbot"
echo "2. Get certificate: certbot certonly --standalone -d yourdomain.com"
echo "3. Update $ENV_FILE with certificate paths"
echo "4. Restart service: systemctl restart minecraft-mcp"