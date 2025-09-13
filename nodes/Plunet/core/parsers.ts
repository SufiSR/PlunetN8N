import {
  ResultBase,
  asNum,
  asStr,
  toArray,
  getDataNode,
  extractResultBase,
} from './xml';

/** ------------ Customer DTO ------------ */
export type Customer = {
  academicTitle?: string;
  costCenter?: string;
  currency?: string;
  customerID?: number;
  email?: string;
  externalID?: string;
  fax?: string;
  formOfAddress?: number;
  fullName?: string;
  mobilePhone?: string;
  name1?: string;
  name2?: string;
  opening?: string;
  phone?: string;
  skypeID?: string;
  status?: number;
  userId?: number;
  website?: string;
  /** any unknown fields are preserved here */
  extra?: Record<string, unknown>;
};

function mapCustomer(obj: Record<string, unknown>): Customer {
  const c: Customer = {
    academicTitle: asStr(obj.academicTitle),
    costCenter: asStr(obj.costCenter),
    currency: asStr(obj.currency),
    customerID: asNum(obj.customerID),
    email: asStr(obj.email),
    externalID: asStr(obj.externalID),
    fax: asStr(obj.fax),
    formOfAddress: asNum(obj.formOfAddress),
    fullName: asStr(obj.fullName),
    mobilePhone: asStr(obj.mobilePhone),
    name1: asStr(obj.name1),
    name2: asStr(obj.name2),
    opening: asStr(obj.opening),
    phone: asStr(obj.phone),
    skypeID: asStr(obj.skypeID),
    status: asNum(obj.status),
    userId: asNum(obj.userId),
    website: asStr(obj.website),
  };
  // collect unknowns
  const known = new Set(Object.keys(c).filter((k) => (c as any)[k] !== undefined));
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k)) extra[k] = v;
  }
  if (Object.keys(extra).length) c.extra = extra;
  return c;
}

export function parseCustomerResult(xml: string): ResultBase & { customer?: Customer } {
  const base = extractResultBase(xml);
  const data = getDataNode(xml) as any;

  const raw =
    (data?.Customer as Record<string, unknown> | undefined) ??
    (data as Record<string, unknown> | undefined);

  const customer = raw && typeof raw === 'object' ? mapCustomer(raw) : undefined;
  return { ...base, customer };
}

export function parseCustomerListResult(xml: string): ResultBase & { customers: Customer[] } {
  const base = extractResultBase(xml);
  const data = getDataNode(xml) as any;
  const list = toArray<Record<string, unknown>>(data?.Customer ?? data);
  const customers = list
    .filter((x) => x && typeof x === 'object')
    .map((x) => mapCustomer(x as Record<string, unknown>));
  return { ...base, customers };
}

/** ------------ PaymentInfo DTO ------------ */
export type PaymentInfo = {
  accountHolder?: string;
  accountID?: number;
  BIC?: string;
  contractNumber?: string;
  debitAccount?: string;
  IBAN?: string;
  paymentMethodID?: number;
  preselectedTaxID?: number;
  salesTaxID?: string;
  extra?: Record<string, unknown>;
};

function mapPaymentInfo(obj: Record<string, unknown>): PaymentInfo {
  const p: PaymentInfo = {
    accountHolder: asStr(obj.accountHolder),
    accountID: asNum(obj.accountID),
    BIC: asStr(obj.BIC),
    contractNumber: asStr(obj.contractNumber),
    debitAccount: asStr(obj.debitAccount),
    IBAN: asStr(obj.IBAN),
    paymentMethodID: asNum(obj.paymentMethodID),
    preselectedTaxID: asNum(obj.preselectedTaxID),
    salesTaxID: asStr(obj.salesTaxID),
  };
  const known = new Set(Object.keys(p).filter((k) => (p as any)[k] !== undefined));
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k)) extra[k] = v;
  }
  if (Object.keys(extra).length) p.extra = extra;
  return p;
}

export function parsePaymentInfoResult(xml: string): ResultBase & { paymentInfo?: PaymentInfo } {
  const base = extractResultBase(xml);
  const data = getDataNode(xml) as any;
  const raw =
    (data?.PaymentInfo as Record<string, unknown> | undefined) ??
    (data as Record<string, unknown> | undefined);
  const paymentInfo = raw && typeof raw === 'object' ? mapPaymentInfo(raw) : undefined;
  return { ...base, paymentInfo };
}

/** ------------ Account DTO ------------ */
export type Account = {
  AccountID?: number;
  accountHolder?: string;
  IBAN?: string;
  BIC?: string;
  currency?: string;
  /** Some installations expose bank fields differently; keep extras */
  extra?: Record<string, unknown>;
};

function mapAccount(obj: Record<string, unknown>): Account {
  const a: Account = {
    AccountID: asNum(obj.AccountID ?? obj.accountID),
    accountHolder: asStr(obj.accountHolder ?? obj.AccountHolder),
    IBAN: asStr(obj.IBAN),
    BIC: asStr(obj.BIC),
    currency: asStr(obj.currency),
  };
  const known = new Set(Object.keys(a).filter((k) => (a as any)[k] !== undefined));
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k)) extra[k] = v;
  }
  if (Object.keys(extra).length) a.extra = extra;
  return a;
}

export function parseAccountResult(xml: string): ResultBase & { account?: Account } {
  const base = extractResultBase(xml);
  const data = getDataNode(xml) as any;
  const raw =
    (data?.Account as Record<string, unknown> | undefined) ??
    (data as Record<string, unknown> | undefined);
  const account = raw && typeof raw === 'object' ? mapAccount(raw) : undefined;
  return { ...base, account };
}

/** ------------ Workflow List DTO ------------ */
export type Workflow = {
  workflowID?: number;
  workflowName?: string;
  description?: string;
  extra?: Record<string, unknown>;
};

function mapWorkflow(obj: Record<string, unknown>): Workflow {
  const w: Workflow = {
    workflowID: asNum((obj as any).workflowID ?? (obj as any).id),
    workflowName: asStr((obj as any).workflowName ?? (obj as any).name),
    description: asStr((obj as any).description),
  };
  const known = new Set(Object.keys(w).filter((k) => (w as any)[k] !== undefined));
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.has(k)) extra[k] = v;
  }
  if (Object.keys(extra).length) w.extra = extra;
  return w;
}

/** Some Plunet endpoints return a list under <WorkflowList><Workflow>...</Workflow></WorkflowList>
 * and others return directly an array of <Workflow> elements. Handle both.
 */
export function parseWorkflowListResult(xml: string): ResultBase & { workflows: Workflow[] } {
  const base = extractResultBase(xml);
  const data = getDataNode(xml) as any;

  const container =
    data?.WorkflowList ??
    data?.workflows ??
    data;

  const list =
    toArray<Record<string, unknown>>(container?.Workflow) // nested list
      .concat(toArray<Record<string, unknown>>(container)) // direct list
      .filter(Boolean);

  const workflows = list
    .filter((x) => x && typeof x === 'object')
    .map((x) => mapWorkflow(x as Record<string, unknown>));

  return { ...base, workflows };
}
