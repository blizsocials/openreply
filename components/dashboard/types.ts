export interface Kpi {
  value: number;
  change: number | null;
}

export interface RatioKpi {
  value: number | null;
  previous: number | null;
}

export interface DailyPoint {
  date: string;
  sent: number;
  failed: number;
  skipped: number;
  clicks: number;
}

export interface ClientRow {
  id: string;
  username: string;
  name: string | null;
  activeAutomations: number;
  totalAutomations: number;
  sent: number;
  failed: number;
  skipped: number;
  clicks: number;
  ctr: number;
  lastActivityAt: string | null;
  health: "ok" | "attention" | "idle";
}

export interface AutomationRow {
  id: string;
  name: string;
  isActive: boolean;
  client: string;
  sent: number;
  failed: number;
  clicks: number;
  ctr: number;
}

export interface AttentionRow {
  id: string;
  severity: "high" | "medium" | "low";
  client: string;
  message: string;
  href: string;
}

export interface Insights {
  range: 7 | 30 | 90;
  from: string;
  to: string;
  accounts: { id: string; username: string; name: string | null }[];
  selectedInstagramAccountId: string | null;
  kpis: {
    sent: Kpi;
    clicks: Kpi;
    ctr: RatioKpi;
    delivery: RatioKpi;
    contacts: Kpi;
    failed: Kpi;
    skipped: Kpi;
    activeAutomations: number;
    totalAutomations: number;
  };
  daily: DailyPoint[];
  hours: number[];
  funnel: { triggered: number; sent: number; clicked: number };
  keywords: { keyword: string; count: number }[];
  automations: AutomationRow[];
  clients: ClientRow[];
  attention: AttentionRow[];
  setup: {
    accountsConnected: number;
    webhookReady: boolean;
    hasAutomation: boolean;
    hasActiveAutomation: boolean;
    hasSent: boolean;
  };
  truncated: boolean;
}
