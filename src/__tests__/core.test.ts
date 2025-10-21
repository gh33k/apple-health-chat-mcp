import { QueryEngine } from '../query-engine';
import { HealthDataManager } from '../health-data';
import { HealthDataPoint } from '../types';

describe('Apple Health Chat MCP', () => {
  let queryEngine: QueryEngine;
  let healthDataManager: HealthDataManager;
  let sampleData: HealthDataPoint[];

  beforeEach(() => {
    queryEngine = new QueryEngine();
    healthDataManager = new HealthDataManager();
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
      }
    ];
  });

  describe('QueryEngine', () => {
    test('should execute basic SELECT query', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT * FROM health_data LIMIT 2'
      );
      
      expect(result.rows).toHaveLength(2);
      expect(result.columns).toContain('timestamp');
      expect(result.columns).toContain('Active Energy (kcal)');
    });

    test('should handle WHERE clause', async () => {
      const result = await queryEngine.executeQuery(
        sampleData,
        'SELECT * FROM health_data WHERE `Step Count (steps)` > 5000'
      );
      
      expect(result.rows).toHaveLength(1);
    });

    test('should have getStepsForDate method', () => {
      expect(typeof queryEngine.getStepsForDate).toBe('function');
    });
  });

  describe('HealthDataManager', () => {
    test('should create instance', () => {
      expect(healthDataManager).toBeInstanceOf(HealthDataManager);
    });

    test('should have cache stats', () => {
      const stats = healthDataManager.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('files');
    });
  });

  describe('Core Functionality', () => {
    test('should process health data points', () => {
      expect(sampleData).toHaveLength(2);
      expect(sampleData[0]).toHaveProperty('timestamp');
      expect(sampleData[0]).toHaveProperty('Step Count (steps)');
    });

    test('should calculate basic statistics', () => {
      const steps = sampleData.map(d => d['Step Count (steps)'] as number);
      const total = steps.reduce((sum, val) => sum + val, 0);
      expect(total).toBe(11000);
    });
  });
});
