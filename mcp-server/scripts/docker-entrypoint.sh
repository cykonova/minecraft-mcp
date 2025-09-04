#!/bin/sh
set -e

# API key file location
API_KEY_FILE="/app/config/api.key"

# Function to generate API key if needed
generate_api_key() {
    if [ -z "$MCP_API_KEY" ] && [ "$BIND_ADDRESS" != "localhost" ] && [ "$BIND_ADDRESS" != "127.0.0.1" ]; then
        # Check if we have a stored API key
        if [ -f "$API_KEY_FILE" ]; then
            export MCP_API_KEY=$(cat "$API_KEY_FILE")
            echo "Using existing API key from $API_KEY_FILE" >&2
        else
            # Generate new API key
            export MCP_API_KEY=$(openssl rand -hex 32)
            echo "$MCP_API_KEY" > "$API_KEY_FILE"
            chmod 600 "$API_KEY_FILE"
            echo "" >&2
            echo "⚠️  WARNING: No API key provided for external access!" >&2
            echo "Generated API key: $MCP_API_KEY" >&2
            echo "This key has been saved to $API_KEY_FILE and will be reused" >&2
            echo "" >&2
        fi
    fi
}

# Build command
CMD="node dist/mcp-server.js --transport sse --port ${PORT:-3000} --bind ${BIND_ADDRESS:-0.0.0.0}"

# Add SSL if configured
if [ -n "$SSL_CERT_FILE" ] && [ -n "$SSL_KEY_FILE" ]; then
    CMD="$CMD --ssl-cert $SSL_CERT_FILE --ssl-key $SSL_KEY_FILE"
fi

# Add Minecraft server if configured
if [ -n "$DEFAULT_MC_HOST" ]; then
    CMD="$CMD --host $DEFAULT_MC_HOST --mc-port ${DEFAULT_MC_PORT:-25565}"
fi

# Generate or load API key
generate_api_key

# If API key exists, add it to command
if [ -n "$MCP_API_KEY" ]; then
    CMD="$CMD --api-key $MCP_API_KEY"
fi

echo "Starting MCP server with: $CMD" >&2
exec $CMD