/**
 * Performance Monitoring Dashboard
 * Real-time performance metrics collection and alerting system
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as fs from 'fs/promises';
import * as path from 'path';

// Performance metric interfaces
export interface PerformanceMetric {
  timestamp: number;
  testName: string;
  duration: number;
  memoryUsed: number;
  throughput: number;
  beatsDetected: number;
  avgConfidence: number;
  success: boolean;
  errorMessage?: string;
}

export interface PerformanceThresholds {
  maxDuration: number;
  maxMemoryUsage: number;
  minThroughput: number;
  minConfidence: number;
  minSuccessRate: number;
}

export interface PerformanceAlert {
  id: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  testName: string;
  metric: string;
  currentValue: number;
  threshold: number;
  message: string;
}

export interface PerformanceTrend {
  testName: string;
  metric: string;
  slope: number;
  rSquared: number;
  direction: 'improving' | 'stable' | 'degrading';
  confidence: number;
  dataPoints: Array<{
    timestamp: number;
    value: number;
  }>;
}

export interface DashboardConfig {
  metricsRetentionPeriod: number; // Hours
  alertThresholds: PerformanceThresholds;
  trendAnalysisPeriod: number; // Hours
  alertingEnabled: boolean;
  dataExportPath: string;
  maxMetricsInMemory: number;
}

export class PerformanceDashboard extends EventEmitter {
  private config: DashboardConfig;
  private metrics: PerformanceMetric[] = [];
  private alerts: PerformanceAlert[] = [];
  private trends: Map<string, PerformanceTrend> = new Map();
  private isRunning: boolean = false;
  private cleanupInterval?: NodeJS.Timeout;
  private trendAnalysisInterval?: NodeJS.Timeout;

  constructor(config: Partial<DashboardConfig> = {}) {
    super();
    
    this.config = {
      metricsRetentionPeriod: 24, // 24 hours
      alertThresholds: {
        maxDuration: 30000, // 30 seconds
        maxMemoryUsage: 500 * 1024 * 1024, // 500MB
        minThroughput: 0.1, // 0.1 operations per second
        minConfidence: 0.5, // 50% confidence
        minSuccessRate: 0.95 // 95% success rate
      },
      trendAnalysisPeriod: 6, // 6 hours
      alertingEnabled: true,
      dataExportPath: path.join(__dirname, 'performance-data'),
      maxMetricsInMemory: 10000,
      ...config
    };

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('metric_recorded', this.analyzeMetric.bind(this));
    this.on('alert_triggered', this.handleAlert.bind(this));
    this.on('trend_detected', this.handleTrend.bind(this));
  }

  /**
   * Start the performance dashboard monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Dashboard is already running');
    }

    console.log('🚀 Starting Performance Dashboard...');
    
    // Ensure data export directory exists
    try {
      await fs.access(this.config.dataExportPath);
    } catch {
      await fs.mkdir(this.config.dataExportPath, { recursive: true });
    }

    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000); // Every hour

    // Setup trend analysis
    this.trendAnalysisInterval = setInterval(() => {
      this.analyzeTrends();
    }, 1800000); // Every 30 minutes

    this.isRunning = true;
    
    // Load existing metrics if available
    await this.loadMetrics();
    
    console.log('✅ Performance Dashboard started');
    this.emit('dashboard_started');
  }

  /**
   * Stop the performance dashboard monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping Performance Dashboard...');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    if (this.trendAnalysisInterval) {
      clearInterval(this.trendAnalysisInterval);
    }

    // Save current metrics before stopping
    await this.saveMetrics();
    
    this.isRunning = false;
    console.log('✅ Performance Dashboard stopped');
    this.emit('dashboard_stopped');
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now()
    };

    this.metrics.push(fullMetric);
    
    // Enforce memory limit
    if (this.metrics.length > this.config.maxMetricsInMemory) {
      this.metrics = this.metrics.slice(-this.config.maxMetricsInMemory);
    }

    this.emit('metric_recorded', fullMetric);
  }

  /**
   * Get current performance statistics
   */
  getStats(): {
    totalMetrics: number;
    activeAlerts: number;
    recentMetrics: PerformanceMetric[];
    summary: {
      avgDuration: number;
      avgMemoryUsage: number;
      avgThroughput: number;
      successRate: number;
    };
  } {
    const recentMetrics = this.getRecentMetrics(3600000); // Last hour
    const successfulMetrics = recentMetrics.filter(m => m.success);

    const avgDuration = successfulMetrics.length > 0 ? 
      successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length : 0;
    
    const avgMemoryUsage = successfulMetrics.length > 0 ? 
      successfulMetrics.reduce((sum, m) => sum + m.memoryUsed, 0) / successfulMetrics.length : 0;
    
    const avgThroughput = successfulMetrics.length > 0 ? 
      successfulMetrics.reduce((sum, m) => sum + m.throughput, 0) / successfulMetrics.length : 0;
    
    const successRate = recentMetrics.length > 0 ? 
      successfulMetrics.length / recentMetrics.length : 1;

    return {
      totalMetrics: this.metrics.length,
      activeAlerts: this.alerts.filter(a => Date.now() - a.timestamp < 3600000).length,
      recentMetrics: recentMetrics.slice(-50), // Last 50 metrics
      summary: {
        avgDuration,
        avgMemoryUsage,
        avgThroughput,
        successRate
      }
    };
  }

  /**
   * Get performance trends
   */
  getTrends(): PerformanceTrend[] {
    return Array.from(this.trends.values());
  }

  /**
   * Get active alerts
   */
  getAlerts(): PerformanceAlert[] {
    const cutoff = Date.now() - 86400000; // 24 hours
    return this.alerts.filter(a => a.timestamp >= cutoff);
  }

  /**
   * Set alert thresholds
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.config.alertThresholds = {
      ...this.config.alertThresholds,
      ...thresholds
    };
  }

  /**
   * Generate performance report
   */
  async generateReport(periodHours: number = 24): Promise<{
    reportId: string;
    timestamp: number;
    period: { start: number; end: number };
    metrics: {
      totalTests: number;
      successRate: number;
      avgDuration: number;
      avgMemoryUsage: number;
      avgThroughput: number;
    };
    alerts: {
      total: number;
      byType: Record<string, number>;
      critical: PerformanceAlert[];
    };
    trends: {
      improving: PerformanceTrend[];
      degrading: PerformanceTrend[];
      stable: PerformanceTrend[];
    };
    recommendations: string[];
  }> {
    const endTime = Date.now();
    const startTime = endTime - (periodHours * 3600000);
    const periodMetrics = this.metrics.filter(m => m.timestamp >= startTime);
    const periodAlerts = this.alerts.filter(a => a.timestamp >= startTime);
    const successfulMetrics = periodMetrics.filter(m => m.success);

    // Calculate metrics
    const totalTests = periodMetrics.length;
    const successRate = totalTests > 0 ? successfulMetrics.length / totalTests : 1;
    const avgDuration = successfulMetrics.length > 0 ? 
      successfulMetrics.reduce((sum, m) => sum + m.duration, 0) / successfulMetrics.length : 0;
    const avgMemoryUsage = successfulMetrics.length > 0 ? 
      successfulMetrics.reduce((sum, m) => sum + m.memoryUsed, 0) / successfulMetrics.length : 0;
    const avgThroughput = successfulMetrics.length > 0 ? 
      successfulMetrics.reduce((sum, m) => sum + m.throughput, 0) / successfulMetrics.length : 0;

    // Analyze alerts
    const alertsByType = periodAlerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const criticalAlerts = periodAlerts.filter(a => a.severity === 'critical');

    // Categorize trends
    const trends = Array.from(this.trends.values());
    const improvingTrends = trends.filter(t => t.direction === 'improving');
    const degradingTrends = trends.filter(t => t.direction === 'degrading');
    const stableTrends = trends.filter(t => t.direction === 'stable');

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (successRate < 0.95) {
      recommendations.push(`Success rate is ${(successRate * 100).toFixed(1)}%. Investigate failing tests.`);
    }
    
    if (avgDuration > this.config.alertThresholds.maxDuration * 0.8) {
      recommendations.push('Average duration approaching threshold. Consider optimization.');
    }
    
    if (avgMemoryUsage > this.config.alertThresholds.maxMemoryUsage * 0.8) {
      recommendations.push('Memory usage approaching threshold. Review memory efficiency.');
    }
    
    if (degradingTrends.length > improvingTrends.length) {
      recommendations.push('More degrading trends than improving. Review recent changes.');
    }
    
    if (criticalAlerts.length > 0) {
      recommendations.push(`${criticalAlerts.length} critical alerts in period. Immediate attention required.`);
    }

    const reportId = `perf-report-${Date.now()}`;
    const report = {
      reportId,
      timestamp: endTime,
      period: { start: startTime, end: endTime },
      metrics: {
        totalTests,
        successRate,
        avgDuration,
        avgMemoryUsage,
        avgThroughput
      },
      alerts: {
        total: periodAlerts.length,
        byType: alertsByType,
        critical: criticalAlerts
      },
      trends: {
        improving: improvingTrends,
        degrading: degradingTrends,
        stable: stableTrends
      },
      recommendations
    };

    // Save report to file
    const reportPath = path.join(this.config.dataExportPath, `${reportId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  private analyzeMetric(metric: PerformanceMetric): void {
    if (!this.config.alertingEnabled) {
      return;
    }

    const thresholds = this.config.alertThresholds;
    
    // Check duration threshold
    if (metric.duration > thresholds.maxDuration) {
      this.triggerAlert({
        testName: metric.testName,
        severity: metric.duration > thresholds.maxDuration * 1.5 ? 'critical' : 'warning',
        metric: 'duration',
        currentValue: metric.duration,
        threshold: thresholds.maxDuration,
        message: `Duration ${metric.duration.toFixed(0)}ms exceeds threshold ${thresholds.maxDuration}ms`
      });
    }

    // Check memory threshold
    if (metric.memoryUsed > thresholds.maxMemoryUsage) {
      this.triggerAlert({
        testName: metric.testName,
        severity: metric.memoryUsed > thresholds.maxMemoryUsage * 1.5 ? 'critical' : 'warning',
        metric: 'memory',
        currentValue: metric.memoryUsed,
        threshold: thresholds.maxMemoryUsage,
        message: `Memory ${(metric.memoryUsed / 1024 / 1024).toFixed(1)}MB exceeds threshold ${(thresholds.maxMemoryUsage / 1024 / 1024).toFixed(1)}MB`
      });
    }

    // Check throughput threshold
    if (metric.throughput < thresholds.minThroughput) {
      this.triggerAlert({
        testName: metric.testName,
        severity: metric.throughput < thresholds.minThroughput * 0.5 ? 'critical' : 'warning',
        metric: 'throughput',
        currentValue: metric.throughput,
        threshold: thresholds.minThroughput,
        message: `Throughput ${metric.throughput.toFixed(3)} ops/sec below threshold ${thresholds.minThroughput}`
      });
    }

    // Check confidence threshold
    if (metric.success && metric.avgConfidence < thresholds.minConfidence) {
      this.triggerAlert({
        testName: metric.testName,
        severity: 'warning',
        metric: 'confidence',
        currentValue: metric.avgConfidence,
        threshold: thresholds.minConfidence,
        message: `Average confidence ${metric.avgConfidence.toFixed(3)} below threshold ${thresholds.minConfidence}`
      });
    }

    // Check for failures
    if (!metric.success) {
      this.triggerAlert({
        testName: metric.testName,
        severity: 'error',
        metric: 'success',
        currentValue: 0,
        threshold: 1,
        message: `Test failed: ${metric.errorMessage || 'Unknown error'}`
      });
    }
  }

  private triggerAlert(alertData: Omit<PerformanceAlert, 'id' | 'timestamp'>): void {
    const alert: PerformanceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...alertData
    };

    this.alerts.push(alert);
    
    // Limit alerts in memory
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    this.emit('alert_triggered', alert);
  }

  private handleAlert(alert: PerformanceAlert): void {
    const severity = alert.severity.toUpperCase();
    const icon = {
      'INFO': 'ℹ️',
      'WARNING': '⚠️',
      'ERROR': '❌',
      'CRITICAL': '🚨'
    }[severity] || '❓';

    console.log(`${icon} [${severity}] ${alert.testName}: ${alert.message}`);
  }

  private handleTrend(trend: PerformanceTrend): void {
    const direction = {
      'improving': '📈',
      'stable': '📊',
      'degrading': '📉'
    }[trend.direction];

    console.log(`${direction} Trend detected in ${trend.testName}.${trend.metric}: ${trend.direction} (confidence: ${(trend.confidence * 100).toFixed(1)}%)`);
  }

  private analyzeTrends(): void {
    const testGroups = this.groupMetricsByTest();
    
    for (const [testName, testMetrics] of testGroups.entries()) {
      if (testMetrics.length < 5) continue; // Need minimum data points
      
      const metrics = ['duration', 'memoryUsed', 'throughput', 'avgConfidence'] as const;
      
      for (const metric of metrics) {
        const trend = this.calculateTrend(testName, metric, testMetrics);
        if (trend) {
          const trendKey = `${testName}.${metric}`;
          this.trends.set(trendKey, trend);
          this.emit('trend_detected', trend);
        }
      }
    }
  }

  private calculateTrend(
    testName: string, 
    metric: keyof PerformanceMetric, 
    metrics: PerformanceMetric[]
  ): PerformanceTrend | null {
    const cutoff = Date.now() - (this.config.trendAnalysisPeriod * 3600000);
    const recentMetrics = metrics
      .filter(m => m.timestamp >= cutoff && m.success)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (recentMetrics.length < 5) return null;

    const dataPoints = recentMetrics.map((m, index) => ({
      timestamp: m.timestamp,
      value: typeof m[metric] === 'number' ? m[metric] as number : 0
    }));

    // Calculate linear regression
    const n = dataPoints.length;
    const meanX = dataPoints.reduce((sum, p) => sum + p.timestamp, 0) / n;
    const meanY = dataPoints.reduce((sum, p) => sum + p.value, 0) / n;

    let numerator = 0;
    let denominatorX = 0;
    let denominatorY = 0;

    dataPoints.forEach(point => {
      const dx = point.timestamp - meanX;
      const dy = point.value - meanY;
      numerator += dx * dy;
      denominatorX += dx * dx;
      denominatorY += dy * dy;
    });

    if (denominatorX === 0) return null;

    const slope = numerator / denominatorX;
    
    // Calculate R²
    let ssRes = 0;
    let ssTot = 0;
    dataPoints.forEach(point => {
      const predicted = meanY + slope * (point.timestamp - meanX);
      ssRes += Math.pow(point.value - predicted, 2);
      ssTot += Math.pow(point.value - meanY, 2);
    });

    const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    const confidence = rSquared;

    // Determine direction
    let direction: 'improving' | 'stable' | 'degrading' = 'stable';
    const slopeThreshold = Math.abs(meanY) * 0.01; // 1% of mean value

    if (Math.abs(slope) > slopeThreshold && confidence > 0.3) {
      if (metric === 'duration' || metric === 'memoryUsed') {
        // For these metrics, negative slope is improving
        direction = slope < 0 ? 'improving' : 'degrading';
      } else {
        // For throughput and confidence, positive slope is improving
        direction = slope > 0 ? 'improving' : 'degrading';
      }
    }

    return {
      testName,
      metric: metric as string,
      slope,
      rSquared,
      direction,
      confidence,
      dataPoints
    };
  }

  private groupMetricsByTest(): Map<string, PerformanceMetric[]> {
    const groups = new Map<string, PerformanceMetric[]>();
    
    for (const metric of this.metrics) {
      if (!groups.has(metric.testName)) {
        groups.set(metric.testName, []);
      }
      groups.get(metric.testName)!.push(metric);
    }
    
    return groups;
  }

  private getRecentMetrics(periodMs: number): PerformanceMetric[] {
    const cutoff = Date.now() - periodMs;
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - (this.config.metricsRetentionPeriod * 3600000);
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
    this.alerts = this.alerts.filter(a => a.timestamp >= cutoff);
    
    console.log(`🧹 Cleaned up old metrics. Current count: ${this.metrics.length} metrics, ${this.alerts.length} alerts`);
  }

  private async saveMetrics(): Promise<void> {
    try {
      const dataFile = path.join(this.config.dataExportPath, 'metrics.json');
      const alertsFile = path.join(this.config.dataExportPath, 'alerts.json');
      
      await Promise.all([
        fs.writeFile(dataFile, JSON.stringify(this.metrics, null, 2)),
        fs.writeFile(alertsFile, JSON.stringify(this.alerts, null, 2))
      ]);
      
      console.log('💾 Performance data saved');
    } catch (error) {
      console.error('Error saving performance data:', error);
    }
  }

  private async loadMetrics(): Promise<void> {
    try {
      const dataFile = path.join(this.config.dataExportPath, 'metrics.json');
      const alertsFile = path.join(this.config.dataExportPath, 'alerts.json');
      
      try {
        const metricsData = await fs.readFile(dataFile, 'utf-8');
        this.metrics = JSON.parse(metricsData);
      } catch {
        // File doesn't exist, start with empty metrics
      }
      
      try {
        const alertsData = await fs.readFile(alertsFile, 'utf-8');
        this.alerts = JSON.parse(alertsData);
      } catch {
        // File doesn't exist, start with empty alerts
      }
      
      if (this.metrics.length > 0 || this.alerts.length > 0) {
        console.log(`📊 Loaded ${this.metrics.length} metrics and ${this.alerts.length} alerts from disk`);
      }
    } catch (error) {
      console.error('Error loading performance data:', error);
    }
  }

  /**
   * Export metrics to CSV for external analysis
   */
  async exportToCSV(filename?: string): Promise<string> {
    const csvFilename = filename || `performance-metrics-${Date.now()}.csv`;
    const csvPath = path.join(this.config.dataExportPath, csvFilename);
    
    const headers = [
      'timestamp',
      'testName',
      'duration',
      'memoryUsed',
      'throughput',
      'beatsDetected',
      'avgConfidence',
      'success',
      'errorMessage'
    ];
    
    const csvData = [
      headers.join(','),
      ...this.metrics.map(metric => [
        metric.timestamp,
        `"${metric.testName}"`,
        metric.duration,
        metric.memoryUsed,
        metric.throughput,
        metric.beatsDetected,
        metric.avgConfidence,
        metric.success,
        `"${metric.errorMessage || ''}"`
      ].join(','))
    ].join('\n');
    
    await fs.writeFile(csvPath, csvData);
    console.log(`📄 Exported ${this.metrics.length} metrics to ${csvPath}`);
    
    return csvPath;
  }

  /**
   * Get health status of the system
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    lastUpdated: number;
  } {
    const recentMetrics = this.getRecentMetrics(3600000); // Last hour
    const recentAlerts = this.alerts.filter(a => Date.now() - a.timestamp < 3600000);
    const successfulMetrics = recentMetrics.filter(m => m.success);

    const issues: string[] = [];
    let score = 100;

    // Check success rate
    const successRate = recentMetrics.length > 0 ? 
      successfulMetrics.length / recentMetrics.length : 1;
    
    if (successRate < 0.9) {
      issues.push(`Low success rate: ${(successRate * 100).toFixed(1)}%`);
      score -= 30;
    } else if (successRate < 0.95) {
      issues.push(`Moderate success rate: ${(successRate * 100).toFixed(1)}%`);
      score -= 15;
    }

    // Check critical alerts
    const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      issues.push(`${criticalAlerts.length} critical alerts`);
      score -= 40;
    }

    // Check warning alerts
    const warningAlerts = recentAlerts.filter(a => a.severity === 'warning');
    if (warningAlerts.length > 5) {
      issues.push(`${warningAlerts.length} warning alerts`);
      score -= 20;
    }

    // Check degrading trends
    const degradingTrends = Array.from(this.trends.values()).filter(t => 
      t.direction === 'degrading' && t.confidence > 0.5
    );
    if (degradingTrends.length > 2) {
      issues.push(`${degradingTrends.length} degrading performance trends`);
      score -= 25;
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (score < 50) {
      status = 'critical';
    } else if (score < 80) {
      status = 'warning';
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      lastUpdated: Date.now()
    };
  }
}

// Utility function to create a dashboard instance with common configuration
export function createPerformanceDashboard(config?: Partial<DashboardConfig>): PerformanceDashboard {
  return new PerformanceDashboard(config);
}

// Example usage and integration helpers
export class PerformanceDashboardIntegration {
  private dashboard: PerformanceDashboard;
  private testStartTime: number = 0;

  constructor(dashboard: PerformanceDashboard) {
    this.dashboard = dashboard;
  }

  /**
   * Start timing a test
   */
  startTest(): void {
    this.testStartTime = performance.now();
  }

  /**
   * End timing a test and record metrics
   */
  endTest(testName: string, result: {
    success: boolean;
    beatsDetected?: number;
    avgConfidence?: number;
    memoryUsed?: number;
    errorMessage?: string;
  }): void {
    if (this.testStartTime === 0) {
      throw new Error('Must call startTest() before endTest()');
    }

    const duration = performance.now() - this.testStartTime;
    const throughput = 1 / (duration / 1000); // Operations per second

    this.dashboard.recordMetric({
      testName,
      duration,
      memoryUsed: result.memoryUsed || 0,
      throughput,
      beatsDetected: result.beatsDetected || 0,
      avgConfidence: result.avgConfidence || 0,
      success: result.success,
      errorMessage: result.errorMessage
    });

    this.testStartTime = 0;
  }

  /**
   * Record a benchmark result
   */
  recordBenchmark(testName: string, benchmark: {
    duration: number;
    memoryUsed: number;
    beatsDetected: number;
    avgConfidence: number;
    success: boolean;
    errorMessage?: string;
  }): void {
    const throughput = 1 / (benchmark.duration / 1000);

    this.dashboard.recordMetric({
      testName,
      duration: benchmark.duration,
      memoryUsed: benchmark.memoryUsed,
      throughput,
      beatsDetected: benchmark.beatsDetected,
      avgConfidence: benchmark.avgConfidence,
      success: benchmark.success,
      errorMessage: benchmark.errorMessage
    });
  }
}

export default PerformanceDashboard;