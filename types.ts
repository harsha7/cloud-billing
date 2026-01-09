
export interface BillingEntry {
  region: string;
  project: string;
  cost: number;
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

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export interface AIAnalysis {
  summary: string;
  varianceDrivers: string[];
  anomalies: string[];
  recommendations: {
    category: string;
    opportunity: string;
    impact: string;
  }[];
}
