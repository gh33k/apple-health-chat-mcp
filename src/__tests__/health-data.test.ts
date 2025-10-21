import { HealthDataManager } from '../health-data.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { format, subDays } from 'date-fns';

describe('HealthDataManager', () => {
  let tempDir: string;
  let healthDataManager: HealthDataManager;

  beforeEach(() => {
    tempDir = join(process.cwd(), 'temp-test-data');
    mkdirSync(tempDir, { recursive: true });
    
    healthDataManager = new HealthDataManager({
      dataDirectory: tempDir,
      cacheSize: 5,
      enableCaching: true
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CSV file discovery', () => {
    test('should discover HealthMetrics CSV files', async () => {
      // Create test CSV files
      const today = new Date();
      const yesterday = subDays(today, 1);
      
      const csvContent1 = `csvDate,Active Energy (kcal),Step Count (steps)
${format(today, 'yyyy-MM-dd HH:mm:ss')},100,5000
${format(today, 'yyyy-MM-dd HH:mm:ss', { hour: 1 })}},200,6000`;

      const csvContent2 = `csvDate,Active Energy (kcal),Step Count (steps)
${format(yesterday, 'yyyy-MM-dd HH:mm:ss')},150,4500
${format(yesterday, 'yyyy-MM-dd HH:mm:ss', { hour: 1 })}},250,5500`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent1);
      writeFileSync(join(tempDir, 'HealthMetrics20250114.csv'), csvContent2);

      const files = await healthDataManager.discoverFiles();
      
      expect(files).toHaveLength(2);
      expect(files.some(f => f.includes('HealthMetrics-2025-01-15.csv'))).toBe(true);
      expect(files.some(f => f.includes('HealthMetrics20250114.csv'))).toBe(true);
    });

    test('should handle empty directory', async () => {
      const files = await healthDataManager.discoverFiles();
      expect(files).toHaveLength(0);
    });
  });

  describe('CSV parsing', () => {
    test('should parse CSV file correctly', async () => {
      const csvContent = `csvDate,Active Energy (kcal),Step Count (steps),Heart Rate [Avg] (bpm)
2025-01-15 00:00:00,100,5000,70
2025-01-15 00:01:00,200,6000,75
2025-01-15 00:02:00,,,`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent);

      const parsed = await healthDataManager.loadFile(join(tempDir, 'HealthMetrics-2025-01-15.csv'));
      
      expect(parsed.filename).toBe('HealthMetrics-2025-01-15.csv');
      expect(parsed.data).toHaveLength(3);
      expect(parsed.columns).toEqual(['csvDate', 'Active Energy (kcal)', 'Step Count (steps)', 'Heart Rate [Avg] (bpm)']);
      
      // Check first data point
      expect(parsed.data[0].timestamp).toBeInstanceOf(Date);
      expect(parsed.data[0]['Active Energy (kcal)']).toBe(100);
      expect(parsed.data[0]['Step Count (steps)']).toBe(5000);
      expect(parsed.data[0]['Heart Rate [Avg] (bpm)']).toBe(70);
      
      // Check empty values are null
      expect(parsed.data[2]['Active Energy (kcal)']).toBeNull();
    });

    test('should handle different filename formats', async () => {
      const csvContent = `csvDate,Active Energy (kcal)
2025-01-15 00:00:00,100`;

      // Test with hyphen format
      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent);
      const parsed1 = await healthDataManager.loadFile(join(tempDir, 'HealthMetrics-2025-01-15.csv'));
      expect(parsed1.date).toEqual(new Date('2025-01-15'));

      // Test with no hyphen format
      writeFileSync(join(tempDir, 'HealthMetrics20250115.csv'), csvContent);
      const parsed2 = await healthDataManager.loadFile(join(tempDir, 'HealthMetrics20250115.csv'));
      expect(parsed2.date).toEqual(new Date('2025-01-15'));
    });
  });

  describe('Data filtering', () => {
    beforeEach(async () => {
      const csvContent = `csvDate,Active Energy (kcal),Step Count (steps)
2025-01-15 00:00:00,100,5000
2025-01-15 12:00:00,200,6000
2025-01-16 00:00:00,150,5500
2025-01-16 12:00:00,250,6500`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent);
    });

    test('should filter data by date range', async () => {
      const dateRange = {
        start: new Date('2025-01-15T00:00:00'),
        end: new Date('2025-01-15T23:59:59')
      };

      const data = await healthDataManager.getDataInRange(dateRange);
      
      expect(data).toHaveLength(2);
      expect(data[0].timestamp).toEqual(new Date('2025-01-15T00:00:00'));
      expect(data[1].timestamp).toEqual(new Date('2025-01-15T12:00:00'));
    });

    test('should return empty array for non-overlapping date range', async () => {
      const dateRange = {
        start: new Date('2025-01-20T00:00:00'),
        end: new Date('2025-01-21T23:59:59')
      };

      const data = await healthDataManager.getDataInRange(dateRange);
      expect(data).toHaveLength(0);
    });
  });

  describe('Available metrics', () => {
    beforeEach(async () => {
      const csvContent = `csvDate,Active Energy (kcal),Step Count (steps),Heart Rate [Avg] (bpm)
2025-01-15 00:00:00,100,5000,70`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent);
    });

    test('should return available metrics', async () => {
      const metrics = await healthDataManager.getAvailableMetrics();
      
      expect(metrics).toContain('Active Energy (kcal)');
      expect(metrics).toContain('Step Count (steps)');
      expect(metrics).toContain('Heart Rate [Avg] (bpm)');
      expect(metrics).not.toContain('csvDate');
    });
  });

  describe('Date range', () => {
    beforeEach(async () => {
      const csvContent1 = `csvDate,Active Energy (kcal)
2025-01-15 00:00:00,100
2025-01-15 12:00:00,200`;

      const csvContent2 = `csvDate,Active Energy (kcal)
2025-01-16 00:00:00,150
2025-01-16 12:00:00,250`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent1);
      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-16.csv'), csvContent2);
    });

    test('should return correct date range', async () => {
      const dateRange = await healthDataManager.getDateRange();
      
      expect(dateRange).not.toBeNull();
      expect(dateRange!.start).toEqual(new Date('2025-01-15T00:00:00'));
      expect(dateRange!.end).toEqual(new Date('2025-01-16T12:00:00'));
    });
  });

  describe('Sample data', () => {
    beforeEach(async () => {
      const csvContent = `csvDate,Step Count (steps)
2025-01-15 00:00:00,5000
2025-01-15 01:00:00,6000
2025-01-15 02:00:00,7000`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent);
    });

    test('should return sample data for metric', async () => {
      const samples = await healthDataManager.getSampleData('Step Count (steps)', 2);
      
      expect(samples).toHaveLength(2);
      expect(samples[0]).toEqual({
        timestamp: new Date('2025-01-15T00:00:00'),
        value: 5000
      });
      expect(samples[1]).toEqual({
        timestamp: new Date('2025-01-15T01:00:00'),
        value: 6000
      });
    });
  });

  describe('Caching', () => {
    test('should cache loaded files', async () => {
      const csvContent = `csvDate,Active Energy (kcal)
2025-01-15 00:00:00,100`;

      writeFileSync(join(tempDir, 'HealthMetrics-2025-01-15.csv'), csvContent);

      // Load file first time
      await healthDataManager.loadFile(join(tempDir, 'HealthMetrics-2025-01-15.csv'));
      const stats1 = healthDataManager.getCacheStats();

      // Load file second time (should use cache)
      await healthDataManager.loadFile(join(tempDir, 'HealthMetrics-2025-01-15.csv'));
      const stats2 = healthDataManager.getCacheStats();

      expect(stats1.size).toBe(1);
      expect(stats2.size).toBe(1);
      expect(stats1.files).toEqual(stats2.files);
    });

    test('should respect cache size limit', async () => {
      // Create multiple files
      for (let i = 0; i < 7; i++) {
        const date = subDays(new Date(), i);
        const csvContent = `csvDate,Active Energy (kcal)
${format(date, 'yyyy-MM-dd HH:mm:ss')},100`;
        writeFileSync(join(tempDir, `HealthMetrics-${format(date, 'yyyy-MM-dd')}.csv`), csvContent);
      }

      // Load all files
      const files = await healthDataManager.discoverFiles();
      for (const file of files) {
        await healthDataManager.loadFile(file);
      }

      const stats = healthDataManager.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(5); // cacheSize limit
    });
  });
});
