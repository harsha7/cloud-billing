
export interface BillingEntry {
  region: string;
  project?: string;
  service?: string; // New field for AWS Service breakdown (e.g., EC2, RDS)
  cost: number;
  [key: string]: string | number | undefined;
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
