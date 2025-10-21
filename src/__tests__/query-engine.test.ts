import { QueryEngine } from '../query-engine.js';
import { HealthDataPoint } from '../types.js';

describe('QueryEngine', () => {
  let queryEngine: QueryEngine;
  let sampleData: HealthDataPoint[];

  beforeEach(() => {
    queryEngine = new QueryEngine();
    sampleData = [
      {
        timestamp: new Date('2025-01-15T00:00:00'),
        'Active Energy (kcal)': 100,
        'Step Count (steps)': 5000,
        'Heart Rate [Avg] (bpm)': 70
      },
      {
        timestamp: new Date('2025-01-15T01:00:00'),
        'Active Energy (kcal)': 200,
        'Step Count (steps)': 6000,
        'Heart Rate [Avg] (bpm)': 75
      },
      {
        timestamp: new Date('2025-01-15T02:00:00'),
        'Active Energy (kcal)': 150,
        'Step Count (steps)': 5500,
        'Heart Rate [Avg] (bpm)': 72
      },
      {
        timestamp: new Date('2025-01-16T00:00:00'),
        'Active Energy (kcal)': 300,
        'Step Count (steps)': 7000,
        'Heart Rate [Avg] (bpm)': 80
      }
    ];
  });

  describe('Basic SELECT queries', () => {
    test('should select all columns with *', async () => {
      const result = await queryEngine.executeQuery(sampleData, 'SELECT * FROM health_data');
      
      expect(result.columns).toContain('timestamp');
      expect(result.columns).toContain('Active Energy (kcal)');
      expect(result.columns).toContain('Step Count (steps)');
      expect(result.columns).toContain('Heart Rate [Avg] (bpm)');
      expect(result.rows).toHaveLength(4);
    });

    test('should select specific columns', async () => {
      const result = await queryEngine.executeQuery(
        sampleData, 
        'SELECT `Active Energy (kcal)`, `Step Count (steps)` FROM health_data'
      );
      
      expect(result.columns).toEqual(['Active Energy (kcal)', 'Step Count (steps)']);
      expect(result.rows).toHaveLength(4);
      expect(result.rows[0]).toEqual([100, 5000]);
    });
  });

  describe('WHERE clause filtering', () => {
    test('should filter by equality', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT * FROM health_data WHERE `Active Energy (kcal)` = 100'
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][1]).toBe(100); // Active Energy column
    });

    test('should filter by greater than', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT * FROM health_data WHERE `Active Energy (kcal)` > 150'
      );
      
      expect(result.rows).toHaveLength(2);
    });

    test('should filter by IS NULL', async () => {
      const dataWithNulls = [
        ...sampleData,
        {
          timestamp: new Date('2025-01-17T00:00:00'),
          'Active Energy (kcal)': null,
          'Step Count (steps)': 8000,
          'Heart Rate [Avg] (bpm)': 85
        }
      ];

      const result = await queryEngine.executeQuery(
        dataWithNulls,
        'SELECT * FROM health_data WHERE `Active Energy (kcal)` IS NULL'
      );
      
      expect(result.rows).toHaveLength(1);
    });

    test('should filter by IS NOT NULL', async () => {
      const dataWithNulls = [
        ...sampleData,
        {
          timestamp: new Date('2025-01-17T00:00:00'),
          'Active Energy (kcal)': null,
          'Step Count (steps)': 8000,
          'Heart Rate [Avg] (bpm)': 85
        }
      ];

      const result = await queryEngine.executeQuery(
        dataWithNulls,
        'SELECT * FROM health_data WHERE `Active Energy (kcal)` IS NOT NULL'
      );
      
      expect(result.rows).toHaveLength(4);
    });
  });

  describe('Aggregation functions', () => {
    test('should calculate SUM', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT SUM(`Active Energy (kcal)`) as total_energy FROM health_data'
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toBe(750); // 100 + 200 + 150 + 300
    });

    test('should calculate AVG', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT AVG(`Heart Rate [Avg] (bpm)`) as avg_hr FROM health_data'
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toBe(74.25); // (70 + 75 + 72 + 80) / 4
    });

    test('should calculate MIN and MAX', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT MIN(`Step Count (steps)`) as min_steps, MAX(`Step Count (steps)`) as max_steps FROM health_data'
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toBe(5000); // min
      expect(result.rows[0][1]).toBe(7000); // max
    });

    test('should calculate COUNT', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT COUNT(`Active Energy (kcal)`) as count FROM health_data'
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toBe(4);
    });
  });

  describe('GROUP BY clause', () => {
    test('should group by date', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT DATE(timestamp) as date, SUM(`Active Energy (kcal)`) as total_energy FROM health_data GROUP BY DATE(timestamp)'
      );
      
      expect(result.rows).toHaveLength(2); // Two different dates
      expect(result.columns).toEqual(['date', 'total_energy']);
    });

    test('should group by hour', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT HOUR(timestamp) as hour, AVG(`Heart Rate [Avg] (bpm)`) as avg_hr FROM health_data GROUP BY HOUR(timestamp)'
      );
      
      expect(result.rows).toHaveLength(2); // Two different hours
      expect(result.columns).toEqual(['hour', 'avg_hr']);
    });
  });

  describe('ORDER BY clause', () => {
    test('should order by column ASC', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT `Active Energy (kcal)` FROM health_data ORDER BY `Active Energy (kcal)` ASC'
      );
      
      expect(result.rows[0][0]).toBe(100); // smallest first
      expect(result.rows[result.rows.length - 1][0]).toBe(300); // largest last
    });

    test('should order by column DESC', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT `Active Energy (kcal)` FROM health_data ORDER BY `Active Energy (kcal)` DESC'
      );
      
      expect(result.rows[0][0]).toBe(300); // largest first
      expect(result.rows[result.rows.length - 1][0]).toBe(100); // smallest last
    });
  });

  describe('LIMIT clause', () => {
    test('should limit results', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT * FROM health_data LIMIT 2'
      );
      
      expect(result.rows).toHaveLength(2);
    });

    test('should limit with offset', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT * FROM health_data LIMIT 2 OFFSET 1'
      );
      
      expect(result.rows).toHaveLength(2);
      // Should skip the first row
      expect(result.rows[0][1]).toBe(200); // Second row's Active Energy
    });
  });

  describe('Output formats', () => {
    test('should format as JSON', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT `Active Energy (kcal)` FROM health_data LIMIT 1',
        { format: 'json' }
      );
      
      expect(result.rows[0][0]).toBe(100);
    });

    test('should format as CSV', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT `Active Energy (kcal)` FROM health_data LIMIT 1',
        { format: 'csv' }
      );
      
      expect(result.rows[0][0]).toBe('100'); // String format for CSV
    });

    test('should format as summary', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT `Active Energy (kcal)` FROM health_data',
        { format: 'summary' }
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0][0]).toHaveProperty('count');
      expect(result.rows[0][0]).toHaveProperty('sum');
      expect(result.rows[0][0]).toHaveProperty('avg');
      expect(result.rows[0][0]).toHaveProperty('min');
      expect(result.rows[0][0]).toHaveProperty('max');
    });
  });

  describe('Complex queries', () => {
    test('should handle complex query with multiple clauses', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        `SELECT 
          DATE(timestamp) as date,
          SUM(\`Active Energy (kcal)\`) as total_energy,
          AVG(\`Heart Rate [Avg] (bpm)\`) as avg_hr
        FROM health_data 
        WHERE \`Active Energy (kcal)\` > 100
        GROUP BY DATE(timestamp)
        ORDER BY total_energy DESC
        LIMIT 1`
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.columns).toEqual(['date', 'total_energy', 'avg_hr']);
    });
  });

  describe('Error handling', () => {
    test('should throw error for invalid query syntax', async () => {
      await expect(
        queryEngine.executeQuery(sampleData, 'INVALID QUERY SYNTAX')
      ).rejects.toThrow();
    });

    test('should throw error for missing SELECT clause', async () => {
      await expect(
        queryEngine.executeQuery(sampleData, 'FROM health_data')
      ).rejects.toThrow('Missing SELECT clause');
    });

    test('should throw error for missing FROM clause', async () => {
      await expect(
        queryEngine.executeQuery(sampleData, 'SELECT *')
      ).rejects.toThrow('Missing FROM clause');
    });
  });
});
