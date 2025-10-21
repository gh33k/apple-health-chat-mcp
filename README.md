# Health Export MCP Server

Ask Claude natural language questions about your health data! This Model Context Protocol (MCP) server enables conversational analysis of your health metrics from iOS Health Export CSV files.

**Example questions you can ask:**
- "How active was I yesterday?"
- "Did I get enough sleep this week?"
- "What's my step count trend?"
- "Was my heart rate higher than usual today?"
- "How many calories did I burn last month?"

## Core Features

- **Natural Language Queries**: Ask questions in plain English about your health data
- **Intelligent Data Interpretation**: Claude understands context and provides meaningful insights
- **Comprehensive Health Metrics**: Access step count, heart rate, sleep, energy, and more
- **Flexible Time Periods**: Ask about today, yesterday, last week, or any custom date range
- **Automatic Data Discovery**: Scans and parses your Health Export CSV files automatically
- **Local Processing**: CSV files and MCP server run on your device (query results are sent to Claude)

## Installation

```bash
npm install
npm run build
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Set up your health data directory:**
   ```bash
   export HEALTH_EXPORT_DIR="/path/to/your/health/export/files"
   ```

4. **Configure Claude Desktop** (optional):
   Copy `claude-desktop-config.json.template` to your Claude Desktop config directory and update the paths:
   ```json
   {
     "mcpServers": {
       "health-export": {
         "command": "node",
         "args": ["/path/to/health-export-mcp/dist/index.js"],
         "env": {
           "HEALTH_EXPORT_DIR": "/path/to/your/health/export/files"
         }
       }
     }
   }
   ```

5. **Start the server:**
   ```bash
   npm start
   ```

## Privacy & Data Flow

**Important**: This project does not include any personal health data. The sample data files contain anonymized examples only.

### How Your Data is Handled:

1. **Your CSV files**: Stored and processed locally on your device
2. **MCP Server**: Runs locally and reads your CSV files directly
3. **When you ask Claude questions**: 
   - The MCP server queries your local data
   - Query results (not raw CSV data) are sent to Claude for analysis
   - Claude processes the results and provides insights

### To Use Your Own Data:

1. Use the iOS Health Export app to export your health data
2. Set the `HEALTH_EXPORT_DIR` environment variable to point to your exported CSV files
3. Ensure your personal health data is not committed to version control (see `.gitignore`)

**Note**: While your raw CSV files never leave your device, the results of queries (like step counts, sleep hours, etc.) are sent to Claude when you ask questions.

## Configuration

Set the `HEALTH_EXPORT_DIR` environment variable to point to your Health Export CSV files directory:

```bash
export HEALTH_EXPORT_DIR="/path/to/your/health/export/files"
```

If not set, the server will scan the current directory for CSV files.

## Usage

### Starting the Server

```bash
npm start
```

Or for development:

```bash
npm run dev
```

### MCP Tools

The server provides six tools, with natural language queries being the primary interface:

#### 1. `health_export_ask` ⭐ **Primary Tool**

Ask natural language questions about your health data. This is the main way most users will interact with their health data.

**Parameters:**
- `question` (string, required): Any natural language question about your health data
- `date` (string, optional): Specific date to query (YYYY-MM-DD format)

**Example Questions:**
- "How active was I yesterday?"
- "Did I get enough sleep this week?"
- "What was my step count today?"
- "How's my heart rate trending?"
- "Was I more active than usual?"

#### 2. `health_export_query`

Execute SQL-like queries on health data (used internally by the natural language tool).

**Parameters:**
- `query` (string, required): SQL-like query to execute
- `format` (string, optional): Output format - 'json', 'csv', or 'summary' (default: 'json')

**Example Queries:**

```sql
-- Get daily step count totals
SELECT DATE(timestamp) as date, SUM(`Step Count (steps)`) as total_steps 
FROM health_data 
WHERE timestamp >= '2025-09-01' 
GROUP BY DATE(timestamp)

-- Average heart rate by hour
SELECT DATE_FORMAT(timestamp, '%Y-%m-%d %H:00') as hour, 
       AVG(`Heart Rate [Avg] (bpm)`) as avg_heart_rate
FROM health_data 
WHERE `Heart Rate [Avg] (bpm)` IS NOT NULL
GROUP BY hour

-- Get recent sleep data
SELECT * FROM health_data 
WHERE `Sleep Analysis [Total] (hr)` > 0 
  AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
```

#### 3. `health_export_report`

Generate structured health reports.

**Parameters:**
- `report_type` (string, required): 'daily', 'weekly', 'monthly', or 'custom'
- `start_date` (string, optional): Start date for custom reports (YYYY-MM-DD)
- `end_date` (string, optional): End date for custom reports (YYYY-MM-DD)
- `include_metrics` (array, optional): List of specific metrics to include

**Example:**

```json
{
  "report_type": "weekly",
  "include_metrics": ["Step Count (steps)", "Heart Rate [Avg] (bpm)", "Active Energy (kcal)"]
}
```

#### 3. `health_export_schema`

Get available metrics, date ranges, and sample data.

**Parameters:** None

**Returns:**
- Available metrics with descriptions and units
- Date range of available data
- Sample data for common metrics
- File count and cache statistics

#### 4. `health_export_metrics`

Get specific metric data with optional filtering and aggregation.

**Parameters:**
- `metric_name` (string, required): Name of the metric to retrieve
- `start_date` (string, optional): Start date filter (YYYY-MM-DD)
- `end_date` (string, optional): End date filter (YYYY-MM-DD)
- `aggregation` (string, optional): 'sum', 'avg', 'min', 'max', or 'count'

**Example:**

```json
{
  "metric_name": "Step Count (steps)",
  "start_date": "2025-09-01",
  "end_date": "2025-09-07",
  "aggregation": "sum"
}
```

## Supported Health Metrics

The server automatically detects and supports all metrics from your Health Export files, including:

- **Active Energy (kcal)**: Active energy burned
- **Heart Rate [Min/Max/Avg] (bpm)**: Heart rate measurements
- **Step Count (steps)**: Daily step count
- **Sleep Analysis [Total] (hr)**: Sleep duration
- **And many more...**

## Query Language Support

The query engine supports a subset of SQL with the following features:

### SELECT Clause
- `SELECT *` - Select all columns
- `SELECT column1, column2` - Select specific columns
- `SELECT SUM(column), AVG(column), MIN(column), MAX(column), COUNT(column)` - Aggregations

### WHERE Clause
- `=`, `!=`, `>`, `<`, `>=`, `<=` - Comparison operators
- `LIKE` - Pattern matching
- `IN` - Value list matching
- `IS NULL`, `IS NOT NULL` - Null checks

### GROUP BY Clause
- `GROUP BY column` - Group by specific columns
- `GROUP BY DATE(timestamp)` - Group by date
- `GROUP BY HOUR(timestamp)` - Group by hour
- `GROUP BY WEEK(timestamp)` - Group by week
- `GROUP BY MONTH(timestamp)` - Group by month

### ORDER BY Clause
- `ORDER BY column ASC/DESC` - Sort results

### LIMIT Clause
- `LIMIT n` - Limit number of results
- `LIMIT n OFFSET m` - Limit with offset

## Data Format

The Health Export app creates CSV files with this structure:

**Filename patterns:**
- `HealthMetrics-YYYY-MM-DD.csv`
- `HealthMetricsYYYYMMDD.csv`

**Sample CSV structure:**
```csv
csvDate,Active Energy (kcal),Heart Rate [Min] (bpm),Heart Rate [Max] (bpm),Heart Rate [Avg] (bpm),Step Count (steps),Sleep Analysis [Total] (hr),...
2025-09-02 00:00:00,0.281,63,63,63,,,
2025-09-02 00:01:00,0.281,62,62,62,,,
```

## Error Handling

The server provides comprehensive error handling:

- **File Discovery Errors**: Clear messages when CSV files cannot be found
- **Parse Errors**: Graceful handling of malformed CSV files
- **Query Errors**: Detailed error messages for invalid SQL syntax
- **Validation Errors**: Parameter validation with helpful error messages

## Performance Features

- **Lazy Loading**: CSV files are loaded only when needed
- **Memory Caching**: Configurable cache size for frequently accessed data
- **Efficient Filtering**: Date range filtering before loading full datasets
- **Streaming Support**: Large datasets are processed efficiently

## Development

### Project Structure

```
health-export-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server implementation
│   ├── health-data.ts    # Data loading and caching
│   ├── query-engine.ts   # SQL-like query engine
│   └── types.ts          # TypeScript type definitions
└── README.md
```

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Examples

### Basic Usage with Claude Desktop

1. Add the server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "health-export": {
      "command": "node",
      "args": ["/path/to/health-export-mcp/dist/index.js"],
      "env": {
        "HEALTH_EXPORT_DIR": "/path/to/your/health/files"
      }
    }
  }
}
```

2. Restart Claude Desktop and start asking questions about your health data!

### Example Natural Language Questions

**Daily Activity:**
- "How many steps did I take yesterday?"
- "Was I more active today than usual?"
- "What was my total calorie burn for the week?"

**Sleep Analysis:**
- "Did I get enough sleep last night?"
- "How many hours did I sleep this week?"
- "What's my average sleep duration?"

**Heart Rate Insights:**
- "What was my average heart rate today?"
- "Was my heart rate higher than normal during my workout?"
- "How's my resting heart rate trending?"

**Trend Analysis:**
- "Am I getting more active over time?"
- "How does my sleep compare to last month?"
- "What's my fitness trend for the past 30 days?"

### Advanced SQL Queries (for power users)

**Get today's step count:**
```sql
SELECT SUM(`Step Count (steps)`) as total_steps
FROM health_data 
WHERE DATE(timestamp) = CURDATE()
```

**Weekly heart rate summary:**
```sql
SELECT 
  DATE(timestamp) as date,
  AVG(`Heart Rate [Avg] (bpm)`) as avg_hr,
  MIN(`Heart Rate [Min] (bpm)`) as min_hr,
  MAX(`Heart Rate [Max] (bpm)`) as max_hr
FROM health_data 
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  AND `Heart Rate [Avg] (bpm)` IS NOT NULL
GROUP BY DATE(timestamp)
ORDER BY date DESC
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the GitHub repository.
