export type Role = "OWNER" | "ADMIN" | "STAFF" | "VIEWER";

export const CAPABILITIES = [
  "dashboard:view",
  "order:create", "order:update", "order:archive", "order:delete",
  "payment:create", "payment:void",
  "customer:manage", "customer:price",
  "record:archive", "record:delete",
  "product:manage", "product:cost",
  "expense:manage",
  "event:manage",
  "import:run", "export:run",
  "config:manage",
  "user:manage",
  "audit:view",
  "org:delete",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const STAFF: Capability[] = [
  "dashboard:view",
  "order:create", "order:update",
  "payment:create",
  "customer:manage",
  "product:manage",
  "expense:manage",
  "event:manage",
  "export:run",
];

const ADMIN: Capability[] = [
  ...STAFF,
  "order:archive", "order:delete", "record:archive", "record:delete",
  "payment:void", "customer:price", "product:cost",
  "import:run", "config:manage", "user:manage", "audit:view",
];

const VIEWER: Capability[] = ["dashboard:view", "export:run", "product:cost"];

export const PERMISSIONS: Record<Role, ReadonlySet<Capability>> = {
  OWNER: new Set([...ADMIN, "org:delete"]),
  ADMIN: new Set(ADMIN),
  STAFF: new Set(STAFF),
  VIEWER: new Set(VIEWER),
};

export function can(role: Role, capability: Capability): boolean {
  return PERMISSIONS[role].has(capability);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF: "Staff",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full access, including billing and deleting the workspace.",
  ADMIN: "Everything except deleting the workspace or transferring ownership.",
  STAFF: "Day-to-day work: orders, payments, customers, products, expenses, production.",
  VIEWER: "Read-only access and exports. Cannot change any business data — only their own saved table views.",
};
