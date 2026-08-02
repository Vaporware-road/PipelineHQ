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
  booking_slug?: string | null;
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
  industry: string;
  status: string;
  source: string;
  priority: "low" | "medium" | "high" | "urgent" | string;
  budget_amount: number | null;
  notes: string;
  score: number;
  score_reasons: { factor: string; detail: string; points: number }[];
  owner: User;
  converted_opportunity: number | null;
  converted_account: number | null;
  converted_contact: number | null;
  converted_at: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
  created_at: string;
};

export type CrmComment = {
  id: number;
  author: User;
  body: string;
  parent: number | null;
  opportunity: number | null;
  lead: number | null;
  task: number | null;
  meeting: number | null;
  replies?: CrmComment[];
  created_at: string;
};

export type DealComment = CrmComment;

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
  stage_entered_at?: string | null;
  health: "healthy" | "at_risk" | "stalled" | string;
  health_reasons: { factor: string; detail: string; risk: number }[];
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
  custom_fields?: Record<string, string | number | boolean | null>;
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
  status: "todo" | "in_progress" | "blocked" | "done" | string;
  priority: "low" | "medium" | "high" | "urgent" | string;
  owner: User;
  created_by: User | null;
  parent: number | null;
  lead: number | null;
  lead_name: string | null;
  opportunity: number | null;
  opportunity_name: string | null;
  children?: CrmTask[];
  comment_count?: number;
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
  territory?: number | null;
  territory_name?: string | null;
  custom_fields?: Record<string, string | number | boolean | null>;
};

export type Contact = {
  id: number;
  account: number;
  account_name: string;
  name: string;
  email: string;
  title: string;
  phone: string;
  custom_fields?: Record<string, string | number | boolean | null>;
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
  at_risk_deals: number;
  at_risk_amount: string;
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
  territory?: number | null;
  territory_name?: string | null;
  last_assignee: User | null;
  updated_at: string;
};

export type Territory = {
  id: number;
  name: string;
  region: string;
  industry: string;
  is_active: boolean;
  members: User[];
  account_count?: number;
  created_at: string;
  updated_at: string;
};

export type CustomFieldDefinition = {
  id: number;
  entity: "lead" | "account" | "contact" | "opportunity";
  key: string;
  label: string;
  field_type: "text" | "number" | "bool" | "select" | "date";
  options: string[];
  required: boolean;
  is_active: boolean;
};

export type AuditEvent = {
  id: number;
  actor: User | null;
  action: string;
  entity_type: string;
  entity_id: number;
  entity_label: string;
  changes: Record<string, { from?: unknown; to?: unknown } | unknown>;
  occurred_at: string;
};

export type AiSuggestion = {
  id: number;
  kind: "summary" | "next_action" | "email_draft" | "score_overlay" | string;
  opportunity: number | null;
  lead: number | null;
  title: string;
  output_text: string;
  output_json: Record<string, unknown>;
  prompt_context: Record<string, unknown>;
  provider: string;
  model_name: string;
  created_at: string;
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
  step_type: string;
  template: number;
  template_name: string;
  template_subject: string;
};

export type Sequence = {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_by: User;
  steps: SequenceStep[];
  step_count: number;
  enrollment_count?: number;
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
  cancelled_at?: string | null;
  cancel_reason?: string;
  recent_messages?: {
    id: number;
    subject: string;
    status: string;
    open_count: number;
    click_count: number;
    opened_at: string | null;
    clicked_at: string | null;
    sent_at: string | null;
  }[];
  enrolled_by: User;
};

export type TimelineEvent = {
  id: string;
  source: string;
  event_type: string;
  title: string;
  body: string;
  occurred_at: string;
  actor: User | null;
  href: string;
  meta: Record<string, unknown>;
  related?: Record<string, unknown>;
};

export type OutboundEmail = {
  id: number;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  status: string;
  lead: number | null;
  contact: number | null;
  opportunity: number | null;
  enrollment: number | null;
  template: number | null;
  sent_by: User | null;
  tracking_token: string;
  sent_at: string | null;
  error: string;
  opened_at: string | null;
  open_count: number;
  clicked_at: string | null;
  click_count: number;
  created_at: string;
};

export type AvailabilitySlot = {
  id: number;
  user: number;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type Meeting = {
  id: number;
  host: User;
  title: string;
  job_detail: string;
  /** SDR | AE | MANAGER | ALL | "" */
  target_role: Role | "ALL" | "" | string;
  mentioned_users: User[];
  starts_at: string;
  ends_at: string;
  invitee_name: string;
  /** One or more emails, comma-separated after save */
  invitee_email: string;
  status: string;
  lead: number | null;
  contact: number | null;
  opportunity: number | null;
  notes: string;
  created_at: string;
  updated_at?: string;
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  description: string;
  unit_price: string;
  is_active: boolean;
};

export type QuoteLineItem = {
  id: number;
  quote: number;
  product: number | null;
  product_name: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
};

export type Quote = {
  id: number;
  opportunity: number;
  opportunity_name: string;
  name: string;
  status: string;
  discount_percent: string;
  notes: string;
  created_by: User;
  approved_by: User | null;
  approved_at: string | null;
  line_items: QuoteLineItem[];
  subtotal: string;
  total: string;
  needs_approval: boolean;
  created_at: string;
  updated_at: string;
};

export type DuplicateSuspect = {
  entity_type: string;
  id: number;
  label: string;
  subtitle: string;
  href: string;
  score: number;
  reasons: string[];
};
