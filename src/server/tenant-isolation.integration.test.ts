import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import {
  attachments, categories, customFieldDefinitions, customerPrices, customers, eventProductionItems,
  events, expenses, memberships, orders, paymentMethods, payments, products, savedViews, statusDefinitions,
} from "@/server/db/schema";
import { requireOrgContext } from "@/server/context";
import { getOrgConfig } from "@/server/domain/config";
import { customersWhoOwe, periodRange, topProducts } from "@/server/domain/analytics";
import {
  getCustomer, getEvent, getOrder, getProduct, listCustomers, listEvents, listExpenses, listOrders,
  listPayments, listProducts, pickerData, productionQueue, recentActivity,
} from "@/server/queries";
import * as orderActions from "@/server/actions/orders";
import * as entityActions from "@/server/actions/entities";
import * as attachmentActions from "@/server/actions/attachments";
import * as settingsActions from "@/server/actions/settings";
import * as userActions from "@/server/actions/users";
import * as viewActions from "@/server/actions/views";
import { runImportAction } from "@/server/actions/import";
import { switchWorkspaceAction } from "@/server/actions/auth";
import { GET as downloadAttachment } from "@/app/api/attachments/[id]/route";
import {
  PNG_BYTES, closeDatabase, currentSessionToken, removeTestData, rowById, seedWorkspace, signInAs, signOut,
  type SeededWorkspace,
} from "@/test/integration/workspaces";

/**
 * Tenant isolation, proved against a real database.
 *
 * Two complete workspaces, A and B. Every test signs in as B's OWNER — the
 * most powerful role, so a refusal can only come from tenancy, never from a
 * missing permission — and tries to reach A's data by id, through the same
 * server actions, read models and routes the application uses.
 *
 * Positive controls run first. Without them, a broken fixture would make every
 * "B cannot see it" assertion pass for the wrong reason.
 */

let A: SeededWorkspace;
let B: SeededWorkspace;

beforeAll(async () => {
  await removeTestData();
  A = await seedWorkspace("A");
  B = await seedWorkspace("B");
});

afterAll(async () => {
  signOut();
  try {
    await removeTestData();
  } finally {
    await closeDatabase();
  }
});

const asA = () => signInAs(A.userId, A.orgId);
const asB = () => signInAs(B.userId, B.orgId);

/** Runs an attempt and asserts the target row is byte-for-byte what it was. */
async function expectUntouched(table: PgTable, id: string, attempt: () => Promise<unknown>) {
  const before = await rowById(table, id);
  expect(before, "fixture row should exist").toBeDefined();
  await attempt();
  expect(await rowById(table, id)).toEqual(before);
}

function expectRefused(result: { ok: boolean }) {
  expect(result.ok).toBe(false);
}

function download(id: string) {
  return downloadAttachment(new Request(`http://localhost/api/attachments/${id}`), { params: Promise.resolve({ id }) });
}

const orderInputFor = (ws: SeededWorkspace) => ({
  customerId: ws.customerId,
  orderDate: new Date(),
  items: [{ productId: ws.productId, quantity: 1 }],
});

// ───────────────────────────────────────────── the fixture is real

describe("positive controls: workspace A can reach its own data", () => {
  beforeEach(asA);

  it("reads its own order, customer, product and event", async () => {
    expect((await getOrder(A.orgId, A.orderId)).order.id).toBe(A.orderId);
    expect((await getCustomer(A.orgId, A.customerId)).customer.id).toBe(A.customerId);
    expect((await getProduct(A.orgId, A.productId)).product.id).toBe(A.productId);
    expect((await getEvent(A.orgId, A.eventId)).event.id).toBe(A.eventId);
  });

  it("downloads its own attachment", async () => {
    const response = await download(A.attachmentId);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("sees its own credit, saved view, debtors and top products", async () => {
    const credit = await orderActions.customerCreditAction(A.customerId);
    expect(credit.ok && credit.data.creditMinor).toBe(5_000);

    const views = await viewActions.listSavedViewsAction("orders");
    expect(views.ok && views.data.map((v) => v.id)).toContain(A.viewId);

    const config = await getOrgConfig(A.orgId);
    expect((await customersWhoOwe(A.orgId, config)).map((c) => c.customerId)).toContain(A.customerId);
    expect((await topProducts(A.orgId, config, periodRange("all"))).map((p) => p.productId)).toContain(A.productId);
  });

  it("is told its customer cannot be deleted because it has orders", async () => {
    const check = await entityActions.checkDeletableAction("CUSTOMER", A.customerId);
    expect(check.ok && check.data.reason).toBeTruthy();
  });
});

// ───────────────────────────────────────────── reading

describe("workspace B cannot read workspace A's records", () => {
  beforeEach(asB);

  it("detail read models return 404 for A's ids", async () => {
    await expect(getOrder(B.orgId, A.orderId)).rejects.toMatchObject({ status: 404 });
    await expect(getCustomer(B.orgId, A.customerId)).rejects.toMatchObject({ status: 404 });
    await expect(getProduct(B.orgId, A.productId)).rejects.toMatchObject({ status: 404 });
    await expect(getEvent(B.orgId, A.eventId)).rejects.toMatchObject({ status: 404 });
  });

  it("list read models contain none of A's rows", async () => {
    expect((await listOrders(B.orgId)).map((r) => r.id)).not.toContain(A.orderId);
    expect((await listOrders(B.orgId, { includeArchived: true })).map((r) => r.id)).not.toContain(A.orderId);
    expect((await listCustomers(B.orgId)).map((r) => r.id)).not.toContain(A.customerId);
    expect((await listProducts(B.orgId)).map((r) => r.id)).not.toContain(A.productId);
    expect((await listExpenses(B.orgId)).map((r) => r.id)).not.toContain(A.expenseId);
    expect((await listPayments(B.orgId)).map((r) => r.id)).not.toContain(A.paymentId);
    expect((await listEvents(B.orgId)).map((r) => r.event.id)).not.toContain(A.eventId);
    expect((await recentActivity(B.orgId, 500)).map((r) => r.entityId)).not.toContain(A.orderId);

    const pickers = await pickerData(B.orgId);
    expect(pickers.customers.map((c) => c.id)).not.toContain(A.customerId);
    expect(pickers.products.map((p) => p.id)).not.toContain(A.productId);
  });

  it("the production queue ignores A's orders even when given A's status ids", async () => {
    const queue = await productionQueue(B.orgId, A.statusIds);
    expect(queue.map((q) => q.orderId)).not.toContain(A.orderId);
  });

  it("analytics count none of A's customers or products", async () => {
    const config = await getOrgConfig(B.orgId);
    expect((await customersWhoOwe(B.orgId, config)).map((c) => c.customerId)).not.toContain(A.customerId);
    expect((await topProducts(B.orgId, config, periodRange("all"))).map((p) => p.productId)).not.toContain(A.productId);
  });

  it("configuration loads only B's statuses, methods, categories and fields", async () => {
    const config = await getOrgConfig(B.orgId);
    const rows = [...config.statuses, ...config.paymentMethods, ...config.productCategories, ...config.expenseCategories, ...config.fieldDefs];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.orgId === B.orgId)).toBe(true);
  });

  it("A's attachment is a 404, not a 403, and lists as nothing", async () => {
    expect((await download(A.attachmentId)).status).toBe(404);
    const listed = await attachmentActions.listAttachmentsAction("ORDER", A.orderId);
    expect(listed.ok && listed.data).toEqual([]);
  });

  it("A's customer credit reads as zero", async () => {
    const credit = await orderActions.customerCreditAction(A.customerId);
    expect(credit.ok && credit.data.creditMinor).toBe(0);
  });

  it("A's shared saved view is not listed", async () => {
    const views = await viewActions.listSavedViewsAction("orders");
    expect(views.ok && views.data.map((v) => v.id)).not.toContain(A.viewId);
  });

  it("the delete check discloses nothing about A's customer", async () => {
    const check = await entityActions.checkDeletableAction("CUSTOMER", A.customerId);
    expect(check.ok && check.data.reason).toBeNull();
  });
});

// ───────────────────────────────────────────── orders and payments

describe("workspace B cannot change workspace A's orders or payments", () => {
  beforeEach(asB);

  it("cannot edit, re-status, archive, restore or delete A's order", async () => {
    await expectUntouched(orders, A.orderId, async () => {
      expectRefused(await orderActions.updateOrderAction(A.orderId, orderInputFor(B)));
      expectRefused(await orderActions.changeStatusAction(A.orderId, B.statusIds[1]));
      expectRefused(await orderActions.archiveOrderAction(A.orderId));
      expectRefused(await orderActions.restoreOrderAction(A.orderId));
      expectRefused(await orderActions.deleteOrderAction(A.orderId, A.orderNumber));
    });
  });

  it("bulk order actions skip A's orders", async () => {
    await expectUntouched(orders, A.orderId, async () => {
      const status = await orderActions.bulkChangeStatusAction([A.orderId], B.statusIds[1]);
      expect(status.ok && status.data.count).toBe(0);
      const archived = await orderActions.bulkArchiveOrdersAction([A.orderId]);
      expect(archived.ok && archived.data.count).toBe(0);
      const deleted = await orderActions.bulkDeleteOrdersAction([A.orderId]);
      expect(deleted.ok && deleted.data.deleted).toBe(0);
    });
  });

  it("cannot move its own order into one of A's statuses", async () => {
    await expectUntouched(orders, B.orderId, async () => {
      expectRefused(await orderActions.changeStatusAction(B.orderId, A.statusIds[1]));
      expectRefused(await orderActions.bulkChangeStatusAction([B.orderId], A.statusIds[1]));
    });
  });

  it("cannot record a payment on, or spend credit against, A's order", async () => {
    await expectUntouched(orders, A.orderId, async () => {
      expectRefused(await orderActions.recordPaymentAction({ orderId: A.orderId, amountMinor: 100, methodId: null, paidAt: new Date() }));
      expectRefused(await orderActions.applyCreditAction(A.orderId, 100));
    });
  });

  it("cannot void A's payment", async () => {
    await expectUntouched(payments, A.paymentId, async () => {
      expectRefused(await orderActions.voidPaymentAction(A.paymentId, "isolation test"));
    });
  });

  it("cannot use A's customer, product or payment method on its own order", async () => {
    expectRefused(await orderActions.createOrderAction({ ...orderInputFor(B), customerId: A.customerId }));
    expectRefused(await orderActions.createOrderAction({ ...orderInputFor(B), items: [{ productId: A.productId, quantity: 1 }] }));
    expectRefused(await orderActions.createOrderAction({ ...orderInputFor(B), advance: { amountMinor: 100, methodId: A.methodId } }));
    expectRefused(await orderActions.recordPaymentAction({ orderId: B.orderId, amountMinor: 100, methodId: A.methodId, paidAt: new Date() }));
    expectRefused(await orderActions.previewPricesAction(A.customerId, [{ productId: A.productId, quantity: 1 }]));
  });

  it("an order created with A's status id lands in one of B's own statuses", async () => {
    const created = await orderActions.createOrderAction({ ...orderInputFor(B), statusId: A.statusIds[1] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const row = await rowById(orders, created.data.id);
    expect(B.statusIds).toContain(row?.status_id);
  });

  it("an import matching A's customer name does not attach to A's customer", async () => {
    const result = await runImportAction({
      target: "orders",
      mapping: { customerName: "Customer", productName: "Product", quantity: "Qty" },
      rows: [{ Customer: A.customerName, Product: B.productName, Qty: "1" }],
      fileName: "isolation.xlsx",
      createMissing: false,
    });
    expect(result.ok && result.data.created).toBe(0);
    const leaked = await db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.orgId, B.orgId), eq(orders.customerId, A.customerId)));
    expect(leaked).toEqual([]);
  });
});

// ───────────────────────────────────────────── customers, products, expenses, events

describe("workspace B cannot change workspace A's records", () => {
  beforeEach(asB);

  it("customers: edit, archive and agreed prices", async () => {
    await expectUntouched(customers, A.customerId, async () => {
      expectRefused(await entityActions.updateCustomerAction(A.customerId, { name: "Changed by B" }));
      expectRefused(await entityActions.archiveCustomerAction(A.customerId));
      expectRefused(await entityActions.setArchivedAction("CUSTOMER", A.customerId, true));
    });
    expectRefused(await entityActions.setCustomerPriceAction({ customerId: A.customerId, productId: null, priceMinor: 1, discountPercent: null }));
    expectRefused(await entityActions.setCustomerPriceAction({ customerId: B.customerId, productId: A.productId, priceMinor: 1, discountPercent: null }));
    await expectUntouched(customerPrices, A.priceId, async () => {
      expectRefused(await entityActions.removeCustomerPriceAction(A.priceId, A.customerId));
    });
  });

  it("products: edit and archive", async () => {
    await expectUntouched(products, A.productId, async () => {
      expectRefused(await entityActions.updateProductAction(A.productId, { name: "Changed by B", defaultPriceMinor: 1 }));
      expectRefused(await entityActions.archiveProductAction(A.productId));
    });
  });

  it("expenses: edit, archive and delete", async () => {
    await expectUntouched(expenses, A.expenseId, async () => {
      expectRefused(await entityActions.updateExpenseAction(A.expenseId, { date: new Date(), description: "Changed by B", amountMinor: 1 }));
      expectRefused(await entityActions.archiveExpenseAction(A.expenseId));
      expectRefused(await entityActions.deleteRecordAction("EXPENSE", A.expenseId, "x", "x"));
    });
  });

  it("events and production lines", async () => {
    await expectUntouched(events, A.eventId, async () => {
      expectRefused(await entityActions.updateEventAction(A.eventId, { name: "Changed by B" }));
      expectRefused(await entityActions.archiveEventAction(A.eventId));
      expectRefused(await entityActions.addProductionItemAction(A.eventId, { productId: null, productName: "Injected", quantityPlanned: 1, unitPriceMinor: 0 }));
    });
    await expectUntouched(eventProductionItems, A.itemId, async () => {
      expectRefused(await entityActions.updateProductionItemAction(A.eventId, A.itemId, { quantityCompleted: 5 }));
      expectRefused(await entityActions.removeProductionItemAction(A.eventId, A.itemId));
    });
    expectRefused(await entityActions.addProductionItemAction(B.eventId, { productId: A.productId, quantityPlanned: 1, unitPriceMinor: 0 }));
  });

  it("bulk archive and bulk delete skip A's records", async () => {
    await expectUntouched(products, A.productId, async () => {
      const archived = await entityActions.bulkSetArchivedAction("PRODUCT", [A.productId], true);
      expect(archived.ok && archived.data.count).toBe(0);
    });
    await expectUntouched(events, A.eventId, async () => {
      const deleted = await entityActions.bulkDeleteRecordsAction("EVENT", [A.eventId]);
      expect(deleted.ok && deleted.data.deleted).toBe(0);
    });
  });

  it("attachments: cannot upload onto or delete from A's records", async () => {
    const upload = new FormData();
    upload.set("entityType", "ORDER");
    upload.set("entityId", A.orderId);
    upload.set("file", new File([PNG_BYTES], "injected.png", { type: "image/png" }));
    expectRefused(await attachmentActions.uploadAttachmentAction(upload));

    await expectUntouched(attachments, A.attachmentId, async () => {
      expectRefused(await attachmentActions.deleteAttachmentAction(A.attachmentId));
    });
  });
});

// ───────────────────────────────────────────── ids from another workspace on your own records

describe("workspace B cannot point its own records at workspace A's configuration", () => {
  beforeEach(asB);

  it("products refuse A's category", async () => {
    expectRefused(await entityActions.createProductAction({ name: "B product", defaultPriceMinor: 100, categoryId: A.productCategoryId }));
    await expectUntouched(products, B.productId, async () => {
      expectRefused(await entityActions.updateProductAction(B.productId, { name: B.productName, defaultPriceMinor: 50_000, categoryId: A.productCategoryId }));
    });
  });

  it("expenses refuse A's category and A's payment method", async () => {
    expectRefused(await entityActions.createExpenseAction({ date: new Date(), description: "B expense", amountMinor: 100, categoryId: A.expenseCategoryId }));
    expectRefused(await entityActions.createExpenseAction({ date: new Date(), description: "B expense", amountMinor: 100, methodId: A.methodId }));
    await expectUntouched(expenses, B.expenseId, async () => {
      expectRefused(await entityActions.updateExpenseAction(B.expenseId, { date: new Date(), description: "B expense", amountMinor: 100, methodId: A.methodId }));
    });
  });

  it("production lines refuse A's category", async () => {
    expectRefused(await entityActions.addProductionItemAction(B.eventId, { productId: null, productName: "B line", categoryId: A.productCategoryId, quantityPlanned: 1, unitPriceMinor: 0 }));
    await expectUntouched(eventProductionItems, B.itemId, async () => {
      expectRefused(await entityActions.updateProductionItemAction(B.eventId, B.itemId, { categoryId: A.productCategoryId }));
    });
  });

  it("categories refuse a parent from A", async () => {
    expectRefused(await settingsActions.upsertCategoryAction({ kind: "PRODUCT", name: "B child", parentId: A.productCategoryId }));
  });

  it("B's own categories and payment methods are still accepted", async () => {
    expect((await settingsActions.upsertCategoryAction({ kind: "PRODUCT", name: `Child of ${B.label}`, parentId: B.productCategoryId })).ok).toBe(true);
    expect((await entityActions.updateProductionItemAction(B.eventId, B.itemId, { categoryId: B.productCategoryId })).ok).toBe(true);
    expect((await entityActions.updateExpenseAction(B.expenseId, {
      date: new Date(), description: "B expense", amountMinor: 100, categoryId: B.expenseCategoryId, methodId: B.methodId,
    })).ok).toBe(true);
  });
});

// ───────────────────────────────────────────── configuration, members, views

describe("workspace B cannot change workspace A's configuration or members", () => {
  beforeEach(asB);

  it("statuses", async () => {
    await expectUntouched(statusDefinitions, A.statusIds[0], async () => {
      await settingsActions.updateStatusAction(A.statusIds[0], { label: "Changed by B", isDefault: false });
      await settingsActions.reorderStatusesAction([A.statusIds[1], A.statusIds[0]]);
    });
  });

  it("payment methods, categories and custom fields", async () => {
    await expectUntouched(paymentMethods, A.methodId, async () => {
      await settingsActions.upsertPaymentMethodAction({ id: A.methodId, label: "Changed by B", isActive: false });
    });
    await expectUntouched(categories, A.productCategoryId, async () => {
      await settingsActions.upsertCategoryAction({ id: A.productCategoryId, kind: "PRODUCT", name: "Changed by B" });
      await settingsActions.archiveCategoryAction(A.productCategoryId);
    });
    await expectUntouched(customFieldDefinitions, A.fieldId, async () => {
      await settingsActions.upsertCustomFieldAction({ id: A.fieldId, entityType: "CUSTOMER", label: "Changed by B", type: "TEXT" });
      await settingsActions.deleteCustomFieldAction(A.fieldId);
    });
  });

  it("members: cannot change a role, remove anyone, or issue a reset link", async () => {
    await expectUntouched(memberships, A.membershipId, async () => {
      expectRefused(await userActions.changeMemberRoleAction(A.membershipId, "VIEWER"));
      expectRefused(await userActions.removeMemberAction(A.membershipId));
      expectRefused(await userActions.issueResetLinkAction(A.membershipId));
    });
  });

  it("saved views", async () => {
    await expectUntouched(savedViews, A.viewId, async () => {
      expectRefused(await viewActions.deleteViewAction(A.viewId));
    });
  });
});

// ───────────────────────────────────────────── sessions

describe("sessions cannot be steered into another workspace", () => {
  it("a session naming A's workspace, held by B's user, resolves to B's workspace", async () => {
    await signInAs(B.userId, A.orgId);
    const ctx = await requireOrgContext();
    expect(ctx.org.id).toBe(B.orgId);
    expect(ctx.workspaces.map((w) => w.id)).not.toContain(A.orgId);
  });

  it("switching to a workspace you are not a member of does nothing", async () => {
    await asB();
    const before = currentSessionToken();
    await switchWorkspaceAction(A.orgId);
    expect(currentSessionToken()).toBe(before);
    expect((await requireOrgContext()).org.id).toBe(B.orgId);
  });

  it("a session with a stale version is sent to sign in", async () => {
    await signInAs(A.userId, A.orgId, 999);
    await expect(requireOrgContext()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });

  it("no session is sent to sign in, and the file route answers 404", async () => {
    signOut();
    await expect(requireOrgContext()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
    expect((await download(A.attachmentId)).status).toBe(404);
  });
});
