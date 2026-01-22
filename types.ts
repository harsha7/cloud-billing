
export interface BillingEntry {
  region?: string;
  tenancy?: string; // New for OCI
  project?: string;
  service?: string; 
  cost: number;
  [key: string]: string | number | undefined;
}

export interface MonthlyData {
  month: string;
  entries: BillingEntry[];
}

export interface CloudCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string;
  ociUserOcid?: string;
  ociTenancyOcid?: string;
}

export type CloudProvider = 'aws' | 'oci';

export interface DashboardState {
  history: MonthlyData[];
  lastUpdated: string;
}
