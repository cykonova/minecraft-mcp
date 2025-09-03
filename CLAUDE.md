# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Minecraft MCP (Model Context Protocol) server that provides AI agents with skills to control Minecraft bots in both Java and Bedrock editions. The project uses Mineflayer for Java Edition and bedrock-protocol for Bedrock Edition, enabling AI assistants like Claude to spawn and control bots in any Minecraft server, performing various tasks from mining to building.

## Key Architecture

### Project Structure
- **mcp-server/**: Core MCP server implementation
  - `src/mcp-server.ts`: Main MCP server entry point handling stdio transport
  - `src/botManager.ts`: Manages multiple bot instances (Java & Bedrock)
  - `src/skillRegistry.ts`: Dynamic skill loading and execution system
  - `src/bots/`: Bot abstraction layers
    - `UnifiedBot.ts`: Common interface for both editions
    - `JavaBotWrapper.ts`: Wrapper for Mineflayer (Java Edition)
    - `BedrockBotWrapper.ts`: Wrapper for bedrock-protocol (Bedrock Edition)
  - `src/skills/verified/`: 30+ pre-built, tested Minecraft skills (Java-only currently)
  - `src/skills/library/`: Additional experimental skills
  
- **mineflayer-pathfinder/**: Custom pathfinding plugin for navigation
- **mineflayer-collectblock/**: Block collection utilities
- **mineflayer-pvp/**: Combat and PvP mechanics

### Core Dependencies
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `mineflayer`: Minecraft Java Edition bot framework
- `bedrock-protocol`: Minecraft Bedrock Edition protocol implementation
- `commander`: CLI argument parsing
- `jimp` & `axios`: Image processing for pixel art building

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript code
npm run build

# Clean build artifacts  
npm run clean

# Build MCP server specifically
cd mcp-server
npm install
npm run build

# Development mode with watch
cd mcp-server
npm run dev

# Test MCP server with inspector
cd mcp-server
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

## MCP Server Startup

The server can be started with optional default connection parameters:

```bash
# No defaults (connection specified per bot)
node mcp-server/dist/mcp-server.js

# With default Minecraft server (works for both editions)
node mcp-server/dist/mcp-server.js -h play.example.com -p 25565

# Bots can override defaults and specify edition
# Java: port 25565 (default)
# Bedrock: port 19132 (default)
```

## Key Implementation Details

### Skill System
- Skills are dynamically loaded from `mcp-server/src/skills/verified/`
- Each skill exports a `handler` function and `definition` object
- Skills receive bot instance and parameters, return execution results
- Error handling and validation built into `skillRegistry.ts`

### Bot Management
- BotManager singleton pattern manages multiple bot instances
- Supports both Java Edition (Mineflayer) and Bedrock Edition (bedrock-protocol) bots
- First bot is used by default for all operations
- Bot connection parameters can be global or per-bot specific
- Edition is tracked per bot instance
- Skills currently only work with Java Edition bots

### Building Skills
- **buildSomething**: Executes Minecraft commands or JavaScript code (requires cheats)
  - Supports static command arrays and dynamic code execution
  - Provides sandboxed environment with helper functions (fill, setBlock, etc.)
- **buildPixelArt**: Converts images to Minecraft pixel art using colored blocks

### TypeScript Configuration
- Target ES6, CommonJS modules
- Path mappings configured for local mineflayer plugins
- Strict mode enabled with `strictNullChecks` disabled
- Source maps enabled for debugging

## Testing Approach

Currently no automated tests. Manual testing workflow:
1. Build the project with `npm run build`
2. Use MCP inspector for interactive testing
3. Connect to a local Minecraft server for skill validation

## Important Conventions

- All skills must handle errors gracefully and return meaningful error messages
- Bot usernames should be unique per session
- Skills requiring operator permissions clearly document this requirement
- File paths in skills use absolute paths
- All commands requiring cheats are clearly marked in skill descriptions