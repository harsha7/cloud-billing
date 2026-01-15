
export interface BillingEntry {
  region: string;
  project: string;
  cost: number;
  [key: string]: string | number;
}

export interface MonthlyData {
  month: string;
  entries: BillingEntry[];
}

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint?: string;
}

export interface DashboardState {
  history: MonthlyData[];
  lastUpdated: string;
}
