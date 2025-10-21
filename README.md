# Apple Health Chat MCP

Ask Claude natural language questions about your Apple Health data! This MCP server enables conversational analysis of your health metrics from iOS Health Export CSV files.

**Example questions you can ask:**
- "How active was I yesterday?"
- "Did I get enough sleep this week?"
- "What's my step count trend?"
- "Was my heart rate higher than usual today?"

## Quick Start

1. **Install & Build:**
   ```bash
   npm install && npm run build
   ```

2. **Set up your health data:**
   ```bash
   export HEALTH_EXPORT_DIR="/path/to/your/health/export/files"
   ```

3. **Configure Claude Desktop:**
   ```json
   {
     "mcpServers": {
       "apple-health-chat": {
         "command": "node",
         "args": ["/path/to/apple-health-chat-mcp/dist/index.js"],
         "env": {
           "HEALTH_EXPORT_DIR": "/path/to/your/health/files"
         }
       }
     }
   }
   ```

4. **Start asking questions!** Restart Claude Desktop and chat about your health data.

## Features

- **Natural Language Queries**: Ask questions in plain English
- **Comprehensive Metrics**: Steps, heart rate, sleep, energy, and more
- **Flexible Time Periods**: Today, yesterday, last week, custom ranges
- **Local Processing**: CSV files stay on your device
- **Privacy Transparent**: Query results sent to Claude (not raw data)

## Supported Health Metrics

Automatically detects metrics from your Health Export files:
- Step Count, Heart Rate (Min/Max/Avg)
- Sleep Analysis, Active Energy
- And many more from your iOS Health app

## Privacy & Data Flow

**Your CSV files**: Stored and processed locally on your device  
**When you ask Claude**: Query results (like "8,500 steps") are sent to Claude for analysis  
**Raw health data**: Never leaves your device

## Get Your Health Data

1. Use the [iOS Health Export app](https://www.healthyapps.dev/) to export your data
2. Set `HEALTH_EXPORT_DIR` to point to your CSV files
3. Keep personal data out of version control (see `.gitignore`)

## Development

```bash
npm run dev    # Development mode
npm test       # Run tests
npm run lint   # Lint code
```

## License

MIT

## Support

- [Issues](https://github.com/gh33k/apple-health-chat-mcp/issues) - Report bugs or request features
---

**Made with ❤️ for health-conscious people who want to chat with their data**