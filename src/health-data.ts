import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { glob } from 'glob';
import pkg from 'papaparse';
const { parse } = pkg;
import { format, parseISO, isValid, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import {
  HealthDataPoint,
  HealthDataCache,
  ParsedCSVFile,
  DateRange,
  HealthExportConfig,
  HealthExportError,
  HEALTH_METRICS
} from './types.js';

export class HealthDataManager {
  private cache: HealthDataCache = {};
  private config: HealthExportConfig;
  private availableFiles: string[] = [];

  constructor(config: Partial<HealthExportConfig> = {}) {
    this.config = {
      dataDirectory: process.env.HEALTH_EXPORT_DIR || process.cwd(),
      cacheSize: 10,
      enableCaching: true,
      ...config
    };
  }

  /**
   * Discover and scan for Health Export CSV files
   */
  async discoverFiles(): Promise<string[]> {
    try {
      const patterns = [
        join(this.config.dataDirectory, '**/HealthMetrics-*.csv'),
        join(this.config.dataDirectory, '**/HealthMetrics*.csv')
      ];

      const allFiles: string[] = [];
      for (const pattern of patterns) {
        const files = await glob(pattern, { nodir: true });
        allFiles.push(...files);
      }

      this.availableFiles = allFiles.sort();
      return this.availableFiles;
    } catch (error) {
      throw this.createError('FILE_DISCOVERY_FAILED', 'Failed to discover CSV files', error);
    }
  }

  /**
   * Parse a CSV file and extract health data
   */
  private async parseCSVFile(filePath: string): Promise<ParsedCSVFile> {
    try {
      if (!existsSync(filePath)) {
        throw this.createError('FILE_NOT_FOUND', `File not found: ${filePath}`);
      }

      const content = readFileSync(filePath, 'utf-8');
      const filename = basename(filePath);
      const date = this.extractDateFromFilename(filename);

      const parseResult = parse(content, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: true,
        transformHeader: (header: string) => header.trim(),
        transform: (value: any, field: string) => {
          if (field === 'Date' || field === 'csvDate') {
            return this.parseTimestamp(value);
          }
          return value === '' ? null : value;
        }
      });

      // Filter out field mismatch errors after parsing
      if (parseResult.errors) {
        parseResult.errors = parseResult.errors.filter(error => 
          error.type !== 'FieldMismatch'
        );
      }

      if (parseResult.errors.length > 0) {
        console.warn(`CSV parsing warnings for ${filename}:`, parseResult.errors);
      }

      const data: HealthDataPoint[] = parseResult.data.map((row: any) => ({
        timestamp: this.parseTimestamp(row.Date || row.csvDate),
        ...Object.fromEntries(
          Object.entries(row).filter(([key]) => key !== 'Date' && key !== 'csvDate')
        )
      }));

      return {
        filename,
        date,
        data,
        columns: parseResult.meta.fields || [],
        rowCount: data.length
      };
    } catch (error) {
      throw this.createError('CSV_PARSE_FAILED', `Failed to parse CSV file: ${filePath}`, error);
    }
  }

  /**
   * Extract date from filename patterns
   */
  private extractDateFromFilename(filename: string): Date {
    // Pattern 1: HealthMetrics-YYYY-MM-DD.csv
    const pattern1 = /HealthMetrics-(\d{4}-\d{2}-\d{2})\.csv/;
    // Pattern 2: HealthMetricsYYYYMMDD.csv
    const pattern2 = /HealthMetrics(\d{8})\.csv/;

    let match = filename.match(pattern1);
    if (match) {
      return parseISO(match[1]);
    }

    match = filename.match(pattern2);
    if (match) {
      const dateStr = match[1];
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return parseISO(`${year}-${month}-${day}`);
    }

    throw this.createError('INVALID_FILENAME', `Cannot extract date from filename: ${filename}`);
  }

  /**
   * Parse timestamp from various formats
   */
  private parseTimestamp(value: any): Date {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      // Try ISO format first
      let date = parseISO(value);
      if (isValid(date)) {
        return date;
      }

      // Try other common formats
      const formats = [
        'yyyy-MM-dd HH:mm:ss',
        'yyyy/MM/dd HH:mm:ss',
        'MM/dd/yyyy HH:mm:ss',
        'dd/MM/yyyy HH:mm:ss'
      ];

      for (const formatStr of formats) {
        try {
          date = parseISO(value.replace(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/, '$1-$2-$3'));
          if (isValid(date)) {
            return date;
          }
        } catch {
          // Continue to next format
        }
      }
    }

    throw this.createError('INVALID_TIMESTAMP', `Cannot parse timestamp: ${value}`);
  }

  /**
   * Load and cache a CSV file
   */
  async loadFile(filePath: string): Promise<ParsedCSVFile> {
    if (this.config.enableCaching && this.cache[filePath]) {
      return this.cache[filePath];
    }

    const parsed = await this.parseCSVFile(filePath);
    
    if (this.config.enableCaching) {
      this.cache[filePath] = parsed;
      this.cleanupCache();
    }

    return parsed;
  }

  /**
   * Load all available files
   */
  async loadAllFiles(): Promise<ParsedCSVFile[]> {
    const files = await this.discoverFiles();
    const results: ParsedCSVFile[] = [];

    for (const file of files) {
      try {
        const parsed = await this.loadFile(file);
        results.push(parsed);
      } catch (error) {
        console.error(`Failed to load file ${file}:`, error);
      }
    }

    return results;
  }

  /**
   * Get data within a date range
   */
  async getDataInRange(dateRange: DateRange): Promise<HealthDataPoint[]> {
    const files = await this.discoverFiles();
    const allData: HealthDataPoint[] = [];

    for (const file of files) {
      try {
        const parsed = await this.loadFile(file);
        
        // Check if file date overlaps with range
        if (this.fileOverlapsRange(parsed.date, dateRange)) {
          const filteredData = parsed.data.filter(point => {
            // Filter by date range and exclude early morning entries that belong to next day
            const isInRange = isWithinInterval(point.timestamp, {
              start: dateRange.start,
              end: dateRange.end
            });
            
            // Exclude 01:00 entries that are likely from the next day
            const hour = point.timestamp.getHours();
            const isEarlyMorning = hour === 1;
            
            return isInRange && !isEarlyMorning;
          });
          allData.push(...filteredData);
        }
      } catch (error) {
        console.error(`Failed to process file ${file}:`, error);
      }
    }

    // Sort by timestamp first
    const sortedData = allData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Deduplicate by timestamp, keeping the last entry for each timestamp
    const deduplicatedData: HealthDataPoint[] = [];
    const timestampMap = new Map<string, HealthDataPoint>();
    
    for (const point of sortedData) {
      const timestampKey = point.timestamp.toISOString();
      timestampMap.set(timestampKey, point);
    }
    
    // Convert map values back to array
    deduplicatedData.push(...Array.from(timestampMap.values()));
    
    return deduplicatedData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Check if file date overlaps with date range
   */
  private fileOverlapsRange(fileDate: Date, dateRange: DateRange): boolean {
    const fileStart = startOfDay(fileDate);
    const fileEnd = endOfDay(fileDate);
    
    return fileStart <= dateRange.end && fileEnd >= dateRange.start;
  }

  /**
   * Get available metrics from all files
   */
  async getAvailableMetrics(): Promise<string[]> {
    const files = await this.discoverFiles();
    const allColumns = new Set<string>();

    for (const file of files) {
      try {
        const parsed = await this.loadFile(file);
        parsed.columns.forEach(col => {
          if (col !== 'csvDate' && col !== 'Date') {
            allColumns.add(col);
          }
        });
      } catch (error) {
        console.error(`Failed to get metrics from file ${file}:`, error);
      }
    }

    return Array.from(allColumns).sort();
  }

  /**
   * Get date range of available data
   */
  async getDateRange(): Promise<DateRange | null> {
    const files = await this.discoverFiles();
    if (files.length === 0) {
      return null;
    }

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const file of files) {
      try {
        const parsed = await this.loadFile(file);
        if (parsed.data.length > 0) {
          const fileMin = parsed.data[0].timestamp;
          const fileMax = parsed.data[parsed.data.length - 1].timestamp;

          if (!minDate || fileMin < minDate) {
            minDate = fileMin;
          }
          if (!maxDate || fileMax > maxDate) {
            maxDate = fileMax;
          }
        }
      } catch (error) {
        console.error(`Failed to get date range from file ${file}:`, error);
      }
    }

    if (!minDate || !maxDate) {
      return null;
    }

    return { start: minDate, end: maxDate };
  }

  /**
   * Get sample data for a specific metric
   */
  async getSampleData(metricName: string, limit: number = 10): Promise<any[]> {
    const files = await this.discoverFiles();
    const samples: any[] = [];

    for (const file of files) {
      if (samples.length >= limit) break;

      try {
        const parsed = await this.loadFile(file);
        const metricData = parsed.data
          .filter(point => point[metricName] !== null && point[metricName] !== undefined)
          .slice(0, limit - samples.length)
          .map(point => ({
            timestamp: point.timestamp,
            value: point[metricName]
          }));
        
        samples.push(...metricData);
      } catch (error) {
        console.error(`Failed to get sample data from file ${file}:`, error);
      }
    }

    return samples;
  }

  /**
   * Clean up cache to maintain size limit
   */
  private cleanupCache(): void {
    const cacheKeys = Object.keys(this.cache);
    if (cacheKeys.length > this.config.cacheSize) {
      // Remove oldest entries (simple LRU)
      const keysToRemove = cacheKeys.slice(0, cacheKeys.length - this.config.cacheSize);
      keysToRemove.forEach(key => delete this.cache[key]);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; files: string[] } {
    return {
      size: Object.keys(this.cache).length,
      files: Object.keys(this.cache)
    };
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
