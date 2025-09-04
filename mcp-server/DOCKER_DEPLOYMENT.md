# Docker Deployment Guide

## Quick Start with GitHub Container Registry

### 1. Pull the Latest Image

```bash
docker pull ghcr.io/cykonova/minecraft-mcp/mcp-server:latest
```

### 2. Run with Docker Compose

Create a `.env` file:
```env
MCP_PORT=3000
MCP_API_KEY=your-secure-api-key-here
SSL_CERTS_PATH=./certs
DEBUG=false
LOG_LEVEL=info
```

Create a `worlds.json` file for your Minecraft servers:
```json
{
  "worlds": {
    "my-server": {
      "name": "My Minecraft Server",
      "host": "minecraft-server-hostname",
      "port": 19132,
      "edition": "bedrock",
      "version": "1.21.102.1",
      "offline": true,
      "description": "My Minecraft Bedrock server"
    }
  },
  "defaultWorld": "my-server"
}
```

Run the container:
```bash
docker compose up -d
```

## Manual Docker Run

```bash
docker run -d \
  --name minecraft-mcp-server \
  -p 3000:3000 \
  -v $(pwd)/worlds.json:/app/worlds.json:ro \
  -v mcp-config:/app/config \
  -v mcp-logs:/app/logs \
  -e MCP_API_KEY=your-secure-api-key \
  ghcr.io/cykonova/minecraft-mcp/mcp-server:latest
```

## Available Docker Tags

- `latest` - Latest stable release from main branch
- `bedrock-support` - Bedrock support branch builds
- `v*.*.*` - Specific version tags
- `main-<sha>` - Main branch builds with commit SHA
- `pr-<number>` - Pull request builds (not pushed to registry)

## Multi-Architecture Support

The Docker images are built for both AMD64 and ARM64 architectures, supporting:
- Intel/AMD processors (x86_64)
- Apple Silicon (M1/M2/M3)
- ARM servers (Raspberry Pi 4+, AWS Graviton)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PORT` | External port for MCP server | 3010 |
| `MCP_API_KEY` | API key for authentication | (generated) |
| `DEBUG` | Enable debug logging | false |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | info |
| `DEFAULT_MC_HOST` | Default Minecraft server host | (none) |
| `DEFAULT_MC_PORT` | Default Minecraft server port | 25565 |
| `SSL_CERT_FILE` | Path to SSL certificate | (none) |
| `SSL_KEY_FILE` | Path to SSL key | (none) |

## Networking

### Using with Other Docker Containers

If running Minecraft servers in Docker, ensure they're on the same network:

```yaml
networks:
  minecraft-net:
    external: true
    name: minecraft_server_minecraft-net
```

### Host Networking

To access Minecraft servers on the host machine, use:
- Linux: Use the container's gateway IP or host networking
- Mac/Windows: Use `host.docker.internal` as the hostname

## Claude Desktop Configuration

Configure Claude Desktop to use the remote MCP server:

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": ["path/to/mcp-client-proxy.js"],
      "env": {
        "MCP_SERVER_URL": "http://your-server:3000/sse",
        "MCP_API_KEY": "your-secure-api-key"
      }
    }
  }
}
```

## Health Checks

The container includes a health check endpoint at `/health`:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:3000/health
```

## Volumes

- `/app/config` - Configuration files and API keys
- `/app/logs` - Application logs
- `/app/worlds.json` - Minecraft world configurations
- `/app/certs` - SSL certificates (optional)

## Security Considerations

1. **Always use a strong API key** in production
2. **Use HTTPS** for external connections (configure SSL certificates)
3. **Keep the image updated** with the latest security patches
4. **Use Docker secrets** for sensitive data in production
5. **Restrict network access** using firewall rules

## Troubleshooting

### Container won't start
- Check logs: `docker logs minecraft-mcp-server`
- Verify port availability: `netstat -an | grep 3000`
- Ensure volumes are properly mounted

### Can't connect to Minecraft server
- Verify network connectivity between containers
- Check firewall rules
- Ensure correct hostname/IP in worlds.json

### Authentication failures
- Verify API key is correctly set
- Check for special characters that need escaping
- Ensure API key matches between server and client

## Building from Source

To build the image locally:

```bash
cd mcp-server
docker build -t minecraft-mcp:local .
```

For multi-platform build:

```bash
docker buildx build --platform linux/amd64,linux/arm64 -t minecraft-mcp:local .