export interface HealthMetric {
  name: string;
  unit: string;
  type: 'numeric' | 'categorical';
  description?: string;
}

export interface HealthDataPoint {
  timestamp: Date;
  [metricName: string]: number | string | Date | null;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
  executionTime: string;
}

export interface HealthReport {
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  dateRange: DateRange;
  metrics: string[];
  data: HealthDataPoint[];
  summary: {
    [metricName: string]: {
      total?: number;
      average?: number;
      min?: number;
      max?: number;
      count: number;
    };
  };
}

export interface QueryOptions {
  format: 'json' | 'csv' | 'summary';
  dateRange?: DateRange;
  metrics?: string[];
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  groupBy?: 'hour' | 'day' | 'week' | 'month';
}

export interface MetricQuery {
  metricName: string;
  startDate?: Date;
  endDate?: Date;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
}

export interface HealthExportConfig {
  dataDirectory: string;
  cacheSize: number;
  enableCaching: boolean;
}

export interface ParsedCSVFile {
  filename: string;
  date: Date;
  data: HealthDataPoint[];
  columns: string[];
  rowCount: number;
}

export interface HealthDataCache {
  [filename: string]: ParsedCSVFile;
}

export interface QueryFilter {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value: any;
}

export interface QueryOrderBy {
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface ParsedQuery {
  select: string[];
  from: string;
  where?: QueryFilter[];
  groupBy?: string[];
  orderBy?: QueryOrderBy[];
  limit?: number;
  offset?: number;
}

export interface HealthExportError extends Error {
  code: string;
  details?: any;
}

export const HEALTH_METRICS: Record<string, HealthMetric> = {
  'Active Energy (kcal)': {
    name: 'Active Energy (kcal)',
    unit: 'kcal',
    type: 'numeric',
    description: 'Active energy burned in kilocalories'
  },
  'Heart Rate [Min] (bpm)': {
    name: 'Heart Rate [Min] (bpm)',
    unit: 'bpm',
    type: 'numeric',
    description: 'Minimum heart rate in beats per minute'
  },
  'Heart Rate [Max] (bpm)': {
    name: 'Heart Rate [Max] (bpm)',
    unit: 'bpm',
    type: 'numeric',
    description: 'Maximum heart rate in beats per minute'
  },
  'Heart Rate [Avg] (bpm)': {
    name: 'Heart Rate [Avg] (bpm)',
    unit: 'bpm',
    type: 'numeric',
    description: 'Average heart rate in beats per minute'
  },
  'Step Count (steps)': {
    name: 'Step Count (steps)',
    unit: 'steps',
    type: 'numeric',
    description: 'Number of steps taken'
  },
  'Sleep Analysis [Total] (hr)': {
    name: 'Sleep Analysis [Total] (hr)',
    unit: 'hr',
    type: 'numeric',
    description: 'Total sleep duration in hours'
  }
};
