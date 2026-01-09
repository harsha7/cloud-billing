export interface BillingEntry {
  region: string;
  project: string;
  cost: number;
  // Added index signature to satisfy Recharts data requirements which expects generic object access
  [key: string]: string | number;
}

export interface MonthlyData {
  month: string;
  entries: BillingEntry[];
}

export interface ComparisonResult {
  month: string;
  cost: number;
  deltaAmount: number;
  deltaPercent: number;
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface AIReportData {
  varianceSummary: string;
  regionalDrivers: { region: string; reason: string }[];
  anomalies: string[];
  recommendations: { action: string; priority: string; impact: string }[];
  optimizationScore: number;
}