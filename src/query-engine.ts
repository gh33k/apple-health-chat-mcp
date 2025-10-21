import { format, startOfDay, endOfDay, startOfHour, startOfWeek, startOfMonth, isWithinInterval } from 'date-fns';
import {
  HealthDataPoint,
  QueryResult,
  QueryOptions,
  ParsedQuery,
  QueryFilter,
  QueryOrderBy,
  DateRange,
  HealthExportError
} from './types.js';

export class QueryEngine {
  /**
   * Execute a SQL-like query on health data
   */
  async executeQuery(
    data: HealthDataPoint[],
    query: string,
    options: QueryOptions = { format: 'json' }
  ): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      const parsedQuery = this.parseQuery(query);
      let result = data;

      // Apply WHERE conditions
      if (parsedQuery.where && parsedQuery.where.length > 0) {
        result = this.applyFilters(result, parsedQuery.where);
      }

      // Apply GROUP BY and aggregations
      if (parsedQuery.groupBy && parsedQuery.groupBy.length > 0) {
        result = this.applyGroupBy(result, parsedQuery.groupBy, parsedQuery.select);
      }

      // Apply ORDER BY
      if (parsedQuery.orderBy && parsedQuery.orderBy.length > 0) {
        result = this.applyOrderBy(result, parsedQuery.orderBy);
      }

      // Apply LIMIT and OFFSET
      if (parsedQuery.limit) {
        const offset = parsedQuery.offset || 0;
        result = result.slice(offset, offset + parsedQuery.limit);
      }

      // Format result based on options
      const formattedResult = this.formatResult(result, parsedQuery.select, options);

      const executionTime = `${Date.now() - startTime}ms`;

      return {
        columns: formattedResult.columns,
        rows: formattedResult.rows,
        rowCount: formattedResult.rows.length,
        executionTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw this.createError('QUERY_EXECUTION_FAILED', `Query execution failed: ${errorMessage}`, error);
    }
  }

  /**
   * Execute a simple step count query for a specific date
   */
  async getStepsForDate(data: HealthDataPoint[], targetDate: string): Promise<number> {
    const target = new Date(targetDate);
    const nextDay = new Date(target);
    nextDay.setDate(nextDay.getDate() + 1);

    const dayData = data.filter(point => {
      const pointDate = new Date(point.timestamp);
      return pointDate >= target && 
             pointDate < nextDay &&
             point['Step Count (steps)'] !== null &&
             point['Step Count (steps)'] !== undefined;
    });

    return dayData.reduce((sum, point) => {
      return sum + (Number(point['Step Count (steps)']) || 0);
    }, 0);
  }

  /**
   * Parse SQL-like query string
   */
  private parseQuery(query: string): ParsedQuery {
    // Simple SQL parser - in production, consider using a proper SQL parser
    const trimmedQuery = query.trim();
    
    // Extract SELECT clause (case insensitive)
    const selectMatch = trimmedQuery.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!selectMatch) {
      throw this.createError('INVALID_QUERY', 'Missing SELECT clause');
    }

    const selectClause = selectMatch[1].trim();
    const selectColumns = selectClause === '*' 
      ? ['*'] 
      : selectClause.split(',').map(col => col.trim().replace(/`/g, ''));

    // Extract FROM clause
    const fromMatch = trimmedQuery.match(/FROM\s+(\w+)/i);
    if (!fromMatch) {
      throw this.createError('INVALID_QUERY', 'Missing FROM clause');
    }

    const fromTable = fromMatch[1].trim();

    // Extract WHERE clause
    const whereMatch = trimmedQuery.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    const whereConditions = whereMatch ? this.parseWhereClause(whereMatch[1]) : [];

    // Extract GROUP BY clause
    const groupByMatch = trimmedQuery.match(/GROUP\s+BY\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    const groupByColumns = groupByMatch 
      ? groupByMatch[1].split(',').map(col => col.trim().replace(/`/g, ''))
      : [];

    // Extract ORDER BY clause
    const orderByMatch = trimmedQuery.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|$)/i);
    const orderByClause = orderByMatch ? this.parseOrderByClause(orderByMatch[1]) : [];

    // Extract LIMIT clause
    const limitMatch = trimmedQuery.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : undefined;
    const offset = limitMatch && limitMatch[2] ? parseInt(limitMatch[2]) : undefined;

    return {
      select: selectColumns,
      from: fromTable,
      where: whereConditions,
      groupBy: groupByColumns,
      orderBy: orderByClause,
      limit,
      offset
    };
  }

  /**
   * Parse WHERE clause conditions
   */
  private parseWhereClause(whereClause: string): QueryFilter[] {
    const conditions: QueryFilter[] = [];
    const parts = whereClause.split(/\s+(?:AND|OR)\s+/i);
    
    for (const part of parts) {
      const condition = this.parseCondition(part.trim());
      if (condition) {
        conditions.push(condition);
      }
    }

    return conditions;
  }

  /**
   * Parse individual condition
   */
  private parseCondition(condition: string): QueryFilter | null {
    // Match patterns like: column = value, column > value, column IS NULL, etc.
    const patterns = [
      /^(.+?)\s*=\s*(.+)$/,
      /^(.+?)\s*!=\s*(.+)$/,
      /^(.+?)\s*>\s*(.+)$/,
      /^(.+?)\s*<\s*(.+)$/,
      /^(.+?)\s*>=\s*(.+)$/,
      /^(.+?)\s*<=\s*(.+)$/,
      /^(.+?)\s+LIKE\s+(.+)$/i,
      /^(.+?)\s+IN\s*\((.+)\)$/i,
      /^(.+?)\s+IS\s+NULL$/i,
      /^(.+?)\s+IS\s+NOT\s+NULL$/i
    ];

    for (const pattern of patterns) {
      const match = condition.match(pattern);
      if (match) {
        const column = match[1].trim().replace(/`/g, '');
        let operator: QueryFilter['operator'];
        let value: any;

        if (condition.includes('IS NULL')) {
          operator = 'IS NULL';
          value = null;
        } else if (condition.includes('IS NOT NULL')) {
          operator = 'IS NOT NULL';
          value = null;
        } else if (condition.includes('LIKE')) {
          operator = 'LIKE';
          value = match[2].trim().replace(/'/g, '');
        } else if (condition.includes('IN')) {
          operator = 'IN';
          value = match[2].split(',').map(v => v.trim().replace(/'/g, ''));
        } else {
          operator = condition.match(/[=!<>]+/)?.[0] as QueryFilter['operator'];
          value = this.parseValue(match[2].trim().replace(/'/g, ''));
        }

        return { column, operator: operator!, value };
      }
    }

    return null;
  }

  /**
   * Parse ORDER BY clause
   */
  private parseOrderByClause(orderByClause: string): QueryOrderBy[] {
    return orderByClause.split(',').map(part => {
      const trimmed = part.trim().replace(/`/g, '');
      const direction = trimmed.toUpperCase().endsWith(' DESC') ? 'DESC' : 'ASC';
      const column = direction === 'DESC' 
        ? trimmed.replace(/\s+DESC$/i, '')
        : trimmed.replace(/\s+ASC$/i, '');
      
      return { column, direction: direction as 'ASC' | 'DESC' };
    });
  }

  /**
   * Parse value based on type
   */
  private parseValue(value: string): any {
    // Try to parse as number
    if (!isNaN(Number(value))) {
      return Number(value);
    }

    // Try to parse as date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Return as string
    return value;
  }

  /**
   * Apply WHERE filters to data
   */
  private applyFilters(data: HealthDataPoint[], filters: QueryFilter[]): HealthDataPoint[] {
    return data.filter(point => {
      return filters.every(filter => this.evaluateFilter(point, filter));
    });
  }

  /**
   * Evaluate a single filter condition
   */
  private evaluateFilter(point: HealthDataPoint, filter: QueryFilter): boolean {
    const value = point[filter.column];

    switch (filter.operator) {
      case '=':
        return value === filter.value;
      case '!=':
        return value !== filter.value;
      case '>':
        return Number(value) > Number(filter.value);
      case '<':
        return Number(value) < Number(filter.value);
      case '>=':
        return Number(value) >= Number(filter.value);
      case '<=':
        return Number(value) <= Number(filter.value);
      case 'LIKE':
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'IN':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'IS NULL':
        return value === null || value === undefined;
      case 'IS NOT NULL':
        return value !== null && value !== undefined;
      default:
        return false;
    }
  }

  /**
   * Apply GROUP BY and aggregations
   */
  private applyGroupBy(data: HealthDataPoint[], groupByColumns: string[], selectColumns: string[]): HealthDataPoint[] {
    const groups = new Map<string, HealthDataPoint[]>();

    // Group data
    for (const point of data) {
      const groupKey = groupByColumns.map(col => {
        if (col === 'DATE(timestamp)') {
          return format(point.timestamp, 'yyyy-MM-dd');
        } else if (col === 'HOUR(timestamp)') {
          return format(point.timestamp, 'yyyy-MM-dd HH:00');
        } else if (col === 'WEEK(timestamp)') {
          return format(startOfWeek(point.timestamp), 'yyyy-MM-dd');
        } else if (col === 'MONTH(timestamp)') {
          return format(startOfMonth(point.timestamp), 'yyyy-MM-dd');
        } else if (col === 'date') {
          return format(point.timestamp, 'yyyy-MM-dd');
        } else {
          return String(point[col] || '');
        }
      }).join('|');

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(point);
    }

    // Apply aggregations
    const result: HealthDataPoint[] = [];
    for (const [groupKey, groupData] of groups) {
      const aggregatedPoint: HealthDataPoint = {
        timestamp: groupData[0].timestamp
      };

      for (const col of selectColumns) {
        if (col === '*') {
          // Copy all columns from first point
          Object.assign(aggregatedPoint, groupData[0]);
        } else if (col.includes('SUM(')) {
          const metricName = col.match(/SUM\((.+)\)/)?.[1];
          if (metricName) {
            aggregatedPoint[col] = groupData.reduce((sum, point) => 
              sum + (Number(point[metricName]) || 0), 0
            );
          }
        } else if (col.includes('AVG(')) {
          const metricName = col.match(/AVG\((.+)\)/)?.[1];
          if (metricName) {
            const values = groupData.map(point => Number(point[metricName])).filter(v => !isNaN(v));
            aggregatedPoint[col] = values.length > 0 
              ? values.reduce((sum, val) => sum + val, 0) / values.length 
              : 0;
          }
        } else if (col.includes('MIN(')) {
          const metricName = col.match(/MIN\((.+)\)/)?.[1];
          if (metricName) {
            const values = groupData.map(point => Number(point[metricName])).filter(v => !isNaN(v));
            aggregatedPoint[col] = values.length > 0 ? Math.min(...values) : 0;
          }
        } else if (col.includes('MAX(')) {
          const metricName = col.match(/MAX\((.+)\)/)?.[1];
          if (metricName) {
            const values = groupData.map(point => Number(point[metricName])).filter(v => !isNaN(v));
            aggregatedPoint[col] = values.length > 0 ? Math.max(...values) : 0;
          }
        } else if (col.includes('COUNT(')) {
          const metricName = col.match(/COUNT\((.+)\)/)?.[1];
          if (metricName) {
            aggregatedPoint[col] = groupData.filter(point => 
              point[metricName] !== null && point[metricName] !== undefined
            ).length;
          }
        } else if (groupByColumns.includes(col)) {
          // Use first value for grouped columns
          aggregatedPoint[col] = groupData[0][col];
        }
      }

      result.push(aggregatedPoint);
    }

    return result;
  }

  /**
   * Apply ORDER BY sorting
   */
  private applyOrderBy(data: HealthDataPoint[], orderByClause: QueryOrderBy[]): HealthDataPoint[] {
    return data.sort((a, b) => {
      for (const order of orderByClause) {
        const aVal = a[order.column];
        const bVal = b[order.column];
        
        let comparison = 0;
        if (aVal != null && bVal != null) {
          if (aVal < bVal) comparison = -1;
          else if (aVal > bVal) comparison = 1;
        } else if (aVal == null && bVal != null) {
          comparison = -1;
        } else if (aVal != null && bVal == null) {
          comparison = 1;
        }

        if (comparison !== 0) {
          return order.direction === 'DESC' ? -comparison : comparison;
        }
      }
      return 0;
    });
  }

  /**
   * Format result based on output options
   */
  private formatResult(
    data: HealthDataPoint[], 
    selectColumns: string[], 
    options: QueryOptions
  ): { columns: string[]; rows: any[][] } {
    if (data.length === 0) {
      return { columns: [], rows: [] };
    }

    let columns: string[];
    let rows: any[][];

    if (selectColumns.includes('*')) {
      // Use all available columns
      const allColumns = new Set<string>();
      data.forEach(point => {
        Object.keys(point).forEach(key => {
          if (key !== 'timestamp') {
            allColumns.add(key);
          }
        });
      });
      columns = ['timestamp', ...Array.from(allColumns).sort()];
    } else {
      columns = selectColumns;
    }

    if (options.format === 'csv') {
      // Convert to CSV format
      rows = data.map(point => 
        columns.map(col => {
          const value = point[col];
          if (value instanceof Date) {
            return format(value, 'yyyy-MM-dd HH:mm:ss');
          }
          return value === null || value === undefined ? '' : String(value);
        })
      );
    } else if (options.format === 'summary') {
      // Create summary statistics
      const summary: any = {};
      columns.forEach(col => {
        if (col !== 'timestamp') {
          const values = data.map(point => Number(point[col])).filter(v => !isNaN(v));
          if (values.length > 0) {
            summary[col] = {
              count: values.length,
              sum: values.reduce((a, b) => a + b, 0),
              avg: values.reduce((a, b) => a + b, 0) / values.length,
              min: Math.min(...values),
              max: Math.max(...values)
            };
          }
        }
      });
      rows = [summary];
    } else {
      // JSON format
      rows = data.map(point => 
        columns.map(col => {
          const value = point[col];
          if (value instanceof Date) {
            return value.toISOString();
          }
          return value;
        })
      );
    }

    return { columns, rows };
  }

  /**
   * Create standardized error
   */
  private createError(code: string, message: string, originalError?: any): HealthExportError {
    const error = new Error(message) as HealthExportError;
    error.code = code;
    error.details = originalError;
    return error;
  }
}
