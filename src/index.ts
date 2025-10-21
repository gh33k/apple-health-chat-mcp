#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
  TextContent,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { HealthDataManager } from './health-data.js';
import { QueryEngine } from './query-engine.js';
import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from 'date-fns';
import {
  HealthReport,
  QueryOptions,
  MetricQuery,
  DateRange,
  HealthExportError,
  HEALTH_METRICS
} from './types.js';

class HealthExportMCPServer {
  private server: Server;
  private healthDataManager: HealthDataManager;
  private queryEngine: QueryEngine;

  constructor() {
    this.server = new Server(
      {
        name: 'apple-health-chat-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.healthDataManager = new HealthDataManager();
    this.queryEngine = new QueryEngine();

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'health_export_query',
            description: 'Execute SQL-like queries on health data from Health Export CSV files',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'SQL-like query to execute on health data. Supports SELECT, WHERE, GROUP BY, ORDER BY, LIMIT clauses.'
                },
                format: {
                  type: 'string',
                  enum: ['json', 'csv', 'summary'],
                  default: 'json',
                  description: 'Output format for the query results'
                }
              },
              required: ['query']
            }
          },
          {
            name: 'health_export_report',
            description: 'Generate structured health reports for specific time periods',
            inputSchema: {
              type: 'object',
              properties: {
                report_type: {
                  type: 'string',
                  enum: ['daily', 'weekly', 'monthly', 'custom'],
                  description: 'Type of report to generate'
                },
                start_date: {
                  type: 'string',
                  format: 'date',
                  description: 'Start date for the report (YYYY-MM-DD format)'
                },
                end_date: {
                  type: 'string',
                  format: 'date',
                  description: 'End date for the report (YYYY-MM-DD format)'
                },
                include_metrics: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of metrics to include in the report'
                }
              },
              required: ['report_type']
            }
          },
          {
            name: 'health_export_schema',
            description: 'Get available metrics, date ranges, and sample data from health export files',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'health_export_metrics',
            description: 'Get specific metric data with optional filtering and aggregation',
            inputSchema: {
              type: 'object',
              properties: {
                metric_name: {
                  type: 'string',
                  description: 'Name of the metric to retrieve'
                },
                start_date: {
                  type: 'string',
                  format: 'date',
                  description: 'Start date for the data (YYYY-MM-DD format)'
                },
                end_date: {
                  type: 'string',
                  format: 'date',
                  description: 'End date for the data (YYYY-MM-DD format)'
                },
                aggregation: {
                  type: 'string',
                  enum: ['sum', 'avg', 'min', 'max', 'count'],
                  description: 'Aggregation function to apply to the metric data'
                }
              },
              required: ['metric_name']
            }
          },
          {
            name: 'health_export_ask',
            description: 'Ask any natural language question about your health data. The LLM will interpret the question and query the appropriate metrics.',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'Any natural language question about your health data (e.g., "How active was I?", "Did I get enough sleep?", "What was my fitness like?")'
                },
                date: {
                  type: 'string',
                  format: 'date',
                  description: 'Specific date to query (YYYY-MM-DD format). If not provided, uses today or yesterday based on context.'
                }
              },
              required: ['question']
            }
          },
          {
            name: 'health_export_get_metrics',
            description: 'Get raw health metrics data for a specific date range. Use this when you need to analyze specific metrics or perform custom calculations.',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  format: 'date',
                  description: 'Start date (YYYY-MM-DD format)'
                },
                end_date: {
                  type: 'string',
                  format: 'date',
                  description: 'End date (YYYY-MM-DD format)'
                },
                metrics: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific metrics to retrieve (optional). If not provided, returns all available metrics.'
                }
              },
              required: ['start_date', 'end_date']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'health_export_query':
            return await this.handleQuery(args);
          case 'health_export_report':
            return await this.handleReport(args);
          case 'health_export_schema':
            return await this.handleSchema();
          case 'health_export_metrics':
            return await this.handleMetrics(args);
          case 'health_export_ask':
            return await this.handleAsk(args);
          case 'health_export_get_metrics':
            return await this.handleGetMetrics(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        const healthError = error as HealthExportError;
        throw new McpError(
          ErrorCode.InternalError,
          healthError.message || 'An unexpected error occurred',
          { code: healthError.code, details: healthError.details }
        );
      }
    });
  }

  private async handleQuery(args: any): Promise<CallToolResult> {
    const { query, format = 'json' } = args;

    if (!query || typeof query !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Query parameter is required and must be a string');
    }

    // Load all health data
    const allData = await this.healthDataManager.loadAllFiles();
    const combinedData = allData.flatMap(file => file.data);

    // Check for simple step count queries and handle them specially
    if (query.toLowerCase().includes('step count') && query.toLowerCase().includes('yesterday')) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const steps = await this.queryEngine.getStepsForDate(combinedData, yesterdayStr);
      
      const content = JSON.stringify({
        date: yesterdayStr,
        total_steps: steps,
        message: `You took ${Math.round(steps)} steps yesterday (${yesterdayStr})`
      }, null, 2);

      return {
        content: [
          {
            type: 'text',
            text: content
          }
        ]
      };
    }

    // Execute regular query
    const options: QueryOptions = { format };
    const result = await this.queryEngine.executeQuery(combinedData, query, options);

    let content: string;
    if (format === 'csv') {
      // Format as CSV
      const csvRows = [
        result.columns.join(','),
        ...result.rows.map(row => row.map(cell => 
          typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell
        ).join(','))
      ];
      content = csvRows.join('\n');
    } else if (format === 'summary') {
      // Format as summary
      content = JSON.stringify({
        summary: result.rows[0] || {},
        metadata: {
          rowCount: result.rowCount,
          executionTime: result.executionTime,
          columns: result.columns
        }
      }, null, 2);
    } else {
      // Format as JSON
      content = JSON.stringify({
        columns: result.columns,
        rows: result.rows,
        metadata: {
          rowCount: result.rowCount,
          executionTime: result.executionTime
        }
      }, null, 2);
    }

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  private async handleReport(args: any): Promise<CallToolResult> {
    const { report_type, start_date, end_date, include_metrics } = args;

    let dateRange: DateRange;
    const now = new Date();

    switch (report_type) {
      case 'daily':
        dateRange = {
          start: startOfDay(now),
          end: endOfDay(now)
        };
        break;
      case 'weekly':
        dateRange = {
          start: startOfDay(subWeeks(now, 1)),
          end: endOfDay(now)
        };
        break;
      case 'monthly':
        dateRange = {
          start: startOfDay(subMonths(now, 1)),
          end: endOfDay(now)
        };
        break;
      case 'custom':
        if (!start_date || !end_date) {
          throw new McpError(ErrorCode.InvalidParams, 'Custom reports require start_date and end_date');
        }
        dateRange = {
          start: new Date(start_date),
          end: new Date(end_date)
        };
        break;
      default:
        throw new McpError(ErrorCode.InvalidParams, 'Invalid report_type');
    }

    // Get data for the date range
    const data = await this.healthDataManager.getDataInRange(dateRange);
    
    // Filter by metrics if specified
    const filteredData = include_metrics && include_metrics.length > 0
      ? data.map(point => {
          const filtered: any = { timestamp: point.timestamp };
          include_metrics.forEach((metric: string) => {
            if (point[metric] !== undefined) {
              filtered[metric] = point[metric];
            }
          });
          return filtered;
        })
      : data;

    // Generate summary statistics
    const summary: any = {};
    const availableMetrics = include_metrics || Object.keys(data[0] || {}).filter(k => k !== 'timestamp');
    
    availableMetrics.forEach((metric: string) => {
      const values = filteredData
        .map(point => Number(point[metric]))
        .filter(v => !isNaN(v));
      
      if (values.length > 0) {
        summary[metric] = {
          count: values.length,
          total: values.reduce((a, b) => a + b, 0),
          average: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values)
        };
      }
    });

    const report: HealthReport = {
      reportType: report_type,
      dateRange,
      metrics: availableMetrics,
      data: filteredData,
      summary
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(report, null, 2)
        }
      ]
    };
  }

  private async handleSchema(): Promise<CallToolResult> {
    const [availableMetrics, dateRange, sampleData] = await Promise.all([
      this.healthDataManager.getAvailableMetrics(),
      this.healthDataManager.getDateRange(),
      this.healthDataManager.getSampleData('Step Count (steps)', 5)
    ]);

    const schema = {
      availableMetrics: availableMetrics.map(metric => ({
        ...(metric in HEALTH_METRICS ? HEALTH_METRICS[metric] : {
          name: metric,
          unit: 'unknown',
          type: 'numeric',
          description: 'Custom metric from health data'
        })
      })),
      dateRange: dateRange ? {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString()
      } : null,
      sampleData: {
        'Step Count (steps)': sampleData
      },
      fileCount: (await this.healthDataManager.discoverFiles()).length,
      cacheStats: this.healthDataManager.getCacheStats()
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(schema, null, 2)
        }
      ]
    };
  }

  private async handleMetrics(args: any): Promise<CallToolResult> {
    const { metric_name, start_date, end_date, aggregation } = args;

    if (!metric_name) {
      throw new McpError(ErrorCode.InvalidParams, 'metric_name is required');
    }

    let dateRange: DateRange | undefined;
    if (start_date && end_date) {
      // Fix: Handle single date inputs properly by setting end time to end of day
      const start = new Date(start_date);
      const end = new Date(end_date);
      
      // If only date is provided (no time), set end to end of day
      if (start_date === end_date && !start_date.includes('T')) {
        end.setHours(23, 59, 59, 999);
      }
      
      dateRange = {
        start,
        end
      };
    }

    // Get data
    const data = dateRange 
      ? await this.healthDataManager.getDataInRange(dateRange)
      : (await this.healthDataManager.loadAllFiles()).flatMap(file => file.data);

    // Filter to only include the requested metric
    const metricData = data
      .filter(point => point[metric_name] !== null && point[metric_name] !== undefined)
      .map(point => ({
        timestamp: point.timestamp,
        localTime: this.formatTimestampForDisplay(point.timestamp),
        value: point[metric_name]
      }));

    let result: any;
    if (aggregation) {
      const values = metricData.map(d => Number(d.value)).filter(v => !isNaN(v));
      
      switch (aggregation) {
        case 'sum':
          result = { value: values.reduce((a, b) => a + b, 0) };
          break;
        case 'avg':
          result = { value: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0 };
          break;
        case 'min':
          result = { value: values.length > 0 ? Math.min(...values) : 0 };
          break;
        case 'max':
          result = { value: values.length > 0 ? Math.max(...values) : 0 };
          break;
        case 'count':
          result = { value: values.length };
          break;
        default:
          throw new McpError(ErrorCode.InvalidParams, 'Invalid aggregation type');
      }
    } else {
      result = metricData;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            metric: metric_name,
            aggregation,
            data: result,
            count: metricData.length,
            dateRange: dateRange ? {
              start: dateRange.start.toISOString(),
              end: dateRange.end.toISOString()
            } : null
          }, null, 2)
        }
      ]
    };
  }

  private async handleAsk(args: any): Promise<CallToolResult> {
    const { question, date } = args;

    if (!question || typeof question !== 'string') {
      throw new McpError(ErrorCode.InvalidParams, 'Question parameter is required and must be a string');
    }

    // Determine the target date
    let targetDate: string;
    if (date) {
      targetDate = date;
    } else {
      const questionLower = question.toLowerCase();
      if (questionLower.includes('today')) {
        targetDate = new Date().toISOString().split('T')[0];
      } else if (questionLower.includes('yesterday')) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        targetDate = yesterday.toISOString().split('T')[0];
      } else {
        // Default to yesterday for general questions
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        targetDate = yesterday.toISOString().split('T')[0];
      }
    }

    // Get data for the target date
    const dateRange = {
      start: new Date(targetDate + 'T00:00:00.000Z'),
      end: new Date(targetDate + 'T23:59:59.999Z')
    };

    const data = await this.healthDataManager.getDataInRange(dateRange);
    const availableMetrics = await this.healthDataManager.getAvailableMetrics();

    // Return raw data and let the LLM interpret and respond
    const response = {
      question: question,
      date: targetDate,
      dataPoints: data.length,
      availableMetrics: availableMetrics,
      sampleData: data.slice(0, 5).map(point => {
        const sample: any = { timestamp: point.timestamp };
        // Include only non-null values for the sample
        Object.keys(point).forEach(key => {
          if (key !== 'timestamp' && point[key] !== null && point[key] !== undefined) {
            sample[key] = point[key];
          }
        });
        return sample;
      }),
      // Provide some basic aggregations for common metrics
      quickStats: {
        steps: this.getMetricStats(data, 'Step Count (steps)'),
        sleep: this.getMetricStats(data, 'Sleep Analysis [Total] (hr)'),
        heartRate: this.getMetricStats(data, 'Heart Rate [Avg] (bpm)'),
        energy: this.getMetricStats(data, 'Active Energy (kcal)')
      }
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  private async handleGetMetrics(args: any): Promise<CallToolResult> {
    const { start_date, end_date, metrics } = args;

    if (!start_date || !end_date) {
      throw new McpError(ErrorCode.InvalidParams, 'start_date and end_date are required');
    }

    // Fix: Handle single date inputs properly by setting end time to end of day
    const start = new Date(start_date);
    const end = new Date(end_date);
    
    // If only date is provided (no time), set end to end of day
    if (start_date === end_date && !start_date.includes('T')) {
      end.setHours(23, 59, 59, 999);
    }

    const dateRange = {
      start,
      end
    };

    const data = await this.healthDataManager.getDataInRange(dateRange);
    const availableMetrics = await this.healthDataManager.getAvailableMetrics();

    // Filter data if specific metrics requested
    let filteredData = data;
    if (metrics && Array.isArray(metrics) && metrics.length > 0) {
      filteredData = data.map(point => {
        const filtered: any = { 
          timestamp: point.timestamp,
          localTime: this.formatTimestampForDisplay(point.timestamp)
        };
        metrics.forEach(metric => {
          if (point[metric] !== null && point[metric] !== undefined) {
            filtered[metric] = point[metric];
          }
        });
        return filtered;
      });
    } else {
      // Add local time to all data points
      filteredData = data.map(point => ({
        ...point,
        localTime: this.formatTimestampForDisplay(point.timestamp)
      }));
    }

    const response = {
      dateRange: {
        start: start_date,
        end: end_date
      },
      dataPoints: filteredData.length,
      availableMetrics: availableMetrics,
      requestedMetrics: metrics || 'all',
      data: filteredData
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  /**
   * Convert UTC timestamp to local time string for display
   */
  private formatTimestampForDisplay(timestamp: Date): string {
    return timestamp.toLocaleString('en-US', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  }

  private getMetricStats(data: any[], metricName: string): any {
    const metricData = data.filter(point => 
      point[metricName] !== null && 
      point[metricName] !== undefined
    );
    
    if (metricData.length === 0) {
      return { count: 0, total: 0, average: 0, min: 0, max: 0 };
    }

    const values = metricData.map(point => Number(point[metricName])).filter(v => !isNaN(v));
    const total = values.reduce((sum, val) => sum + val, 0);
    const average = total / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      count: values.length,
      total: Math.round(total * 100) / 100,
      average: Math.round(average * 100) / 100,
      min: Math.round(min * 100) / 100,
      max: Math.round(max * 100) / 100
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Health Export MCP Server running on stdio');
  }
}

// Start the server
const server = new HealthExportMCPServer();
server.run().catch(console.error);
