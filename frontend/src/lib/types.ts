export type Role = "SDR" | "AE" | "MANAGER";

export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  title: string;
  phone: string;
  is_active?: boolean;
};

export type MeSummary = {
  open_leads: number;
  open_opportunities: number;
  open_tasks: number;
  unread_notifications: number;
};

export type Lead = {
  id: number;
  name: string;
  email: string;
  company: string;
  title: string;
  status: string;
  source: string;
  notes: string;
  owner: User;
  converted_opportunity: number | null;
  converted_at: string | null;
  created_at: string;
};

export type DealComment = {
  id: number;
  opportunity: number;
  author: User;
  body: string;
  created_at: string;
};

export type Opportunity = {
  id: number;
  name: string;
  account: number;
  account_name: string;
  primary_contact: number | null;
  amount: string;
  stage: string;
  close_date: string;
  forecast_category: string;
  next_step: string;
  is_stale: boolean;
  is_open?: boolean;
  owner: User;
  activities?: Activity[];
  comments?: DealComment[];
  metrics: string;
  economic_buyer: string;
  decision_criteria: string;
  decision_process: string;
  identify_pain: string;
  champion: string;
  win_reason: string;
  loss_reason: string;
  closed_at: string | null;
  meddic_checklist?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
};

export type CrmTask = {
  id: number;
  title: string;
  description: string;
  due_at: string | null;
  completed: boolean;
  completed_at: string | null;
  owner: User;
  lead: number | null;
  lead_name: string | null;
  opportunity: number | null;
  opportunity_name: string | null;
  created_at: string;
};

export type SearchHit = {
  type: "lead" | "account" | "contact" | "opportunity" | string;
  id: number;
  label: string;
  subtitle: string;
  href: string;
};

export type Activity = {
  id: number;
  opportunity: number;
  type: string;
  subject: string;
  body: string;
  due_at: string | null;
  completed: boolean;
  created_by: User;
  created_at: string;
};

export type Account = {
  id: number;
  name: string;
  domain: string;
  industry: string;
  owner: User;
};

export type Contact = {
  id: number;
  account: number;
  account_name: string;
  name: string;
  email: string;
  title: string;
  phone: string;
};

export type JobRun = {
  id: number;
  type: string;
  status: string;
  message: string;
  result_meta: Record<string, unknown>;
  result_file_url: string | null;
  celery_task_id: string;
  created_at: string;
};

export type Dashboard = {
  role: string;
  pipeline_amount: string;
  open_deals: number;
  stale_deals: number;
  leads_open: number;
  activities_due: number;
  won_amount: string;
  by_stage: { stage: string; count: number; amount: string }[];
};

export type AnalyticsOverview = {
  from: string;
  to: string;
  leads_created: number;
  leads_converted: number;
  conversion_rate: number;
  won_amount: string;
  won_count: number;
  lost_amount: string;
  lost_count: number;
  avg_cycle_days: number;
  open_pipeline_amount: string;
  open_deals: number;
};

export type AnalyticsFunnel = {
  from: string;
  to: string;
  leads_created: number;
  leads_converted: number;
  lead_to_opp_rate: number;
  opportunities_created: number;
  stages: { stage: string; count: number }[];
};

export type AnalyticsActivity = {
  from: string;
  to: string;
  total: number;
  by_type: { type: string; count: number }[];
  by_user: { user_id: number; username: string; count: number }[];
};

export type Forecast = {
  totals: { pipeline: string; best_case: string; commit: string };
  by_owner: {
    owner: string;
    owner_id: number;
    pipeline: string;
    best_case: string;
    commit: string;
    deals: number;
  }[];
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type NotificationItem = {
  id: number;
  title: string;
  body: string;
  kind: string;
  link: string;
  is_read: boolean;
  created_at: string;
};

export type LeadRoutingRule = {
  id: number;
  name: string;
  enabled: boolean;
  source: string;
  strategy: string;
  last_assignee: User | null;
  updated_at: string;
};

export type EmailTemplate = {
  id: number;
  name: string;
  subject: string;
  body: string;
  created_by: User;
};

export type SequenceStep = {
  id: number;
  sequence: number;
  order: number;
  delay_days: number;
  template: number;
  template_name: string;
  template_subject: string;
};

export type Sequence = {
  id: number;
  name: string;
  is_active: boolean;
  created_by: User;
  steps: SequenceStep[];
  step_count: number;
};

export type SequenceEnrollment = {
  id: number;
  sequence: number;
  sequence_name: string;
  lead: number;
  lead_name: string;
  lead_company: string;
  status: string;
  current_step_order: number;
  next_run_at: string | null;
  last_message: string;
  enrolled_by: User;
};
