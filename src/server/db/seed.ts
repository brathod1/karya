/**
 * Demo seed — the crochet business used as the reference implementation.
 *
 *   npm run db:push && npm run db:seed
 *
 * Sign in with  demo@karya.app  /  demo1234
 *
 * Note that nothing in this file is special-cased in the application. It only
 * writes ordinary configuration and transaction rows.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import {
  categories, customerPrices, customers, eventProductionItems, events, expenses,
  memberships, orderItems, orders, organizations, paymentMethods, products, payments,
  statusDefinitions, users, activityEntries,
} from "./schema";
import { applyTemplate } from "@/server/domain/provisioning";
import { allocateNumber } from "@/server/domain/numbering";
import { computeOrderTotals } from "@/server/domain/pricing";
import { derivePaymentStatus, paidTotal } from "@/server/domain/payments";
import { toMinor } from "@/lib/money";
import { addCalendarDays } from "@/lib/dates";

const DEMO_EMAIL = "demo@karya.app";
const DEMO_PASSWORD = "demo1234";

/** Calendar-day offset, anchored at 12:00 UTC — see lib/dates.ts. */
function daysFromNow(n: number) {
  return addCalendarDays(new Date(), n);
}

async function main() {
  console.log("Seeding demo workspace…");

  const existing = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing.length) {
    console.log(`User ${DEMO_EMAIL} already exists — deleting its workspaces and reseeding.`);
    const mem = await db.select().from(memberships).where(eq(memberships.userId, existing[0].id));
    for (const m of mem) await db.delete(organizations).where(eq(organizations.id, m.orgId));
    await db.delete(users).where(eq(users.id, existing[0].id));
  }

  const [user] = await db.insert(users).values({
    email: DEMO_EMAIL,
    name: "Riya",
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
  }).returning();

  const org = await db.transaction(async (tx) => {
    const [o] = await tx.insert(organizations).values({
      name: "Threads by Riya",
      slug: `threads-by-riya-${Date.now().toString(36)}`,
      templateKey: "handmade",
      businessType: "Crochet / handmade",
    }).returning();
    await tx.insert(memberships).values({ orgId: o.id, userId: user.id, role: "OWNER", acceptedAt: new Date() });
    await applyTemplate(tx, o.id, "handmade");
    return o;
  });

  const orgId = org.id;
  const cats = await db.select().from(categories).where(eq(categories.orgId, orgId));
  const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
  const statuses = await db.select().from(statusDefinitions).where(eq(statusDefinitions.orgId, orgId));
  const status = (key: string) => statuses.find((s) => s.key === key)!;
  const methods = await db.select().from(paymentMethods).where(eq(paymentMethods.orgId, orgId));
  const method = (key: string) => methods.find((m) => m.key === key)?.id ?? null;

  // ── products
  const productSeed: { name: string; category: string; price: number; cost?: number; desc?: string }[] = [
    { name: "Crochet Flower", category: "Flowers", price: 250, cost: 80, desc: "Single stem, cotton yarn" },
    { name: "Flower Bouquet (5 stems)", category: "Flowers", price: 900, cost: 320 },
    { name: "Mini Keychain", category: "Keychains", price: 120, cost: 35 },
    { name: "Character Keychain", category: "Keychains", price: 180, cost: 55 },
    { name: "Crochet Tote Bag", category: "Bags", price: 700, cost: 260 },
    { name: "Granny Square Bag", category: "Bags", price: 850, cost: 300 },
    { name: "Bunny Plushie", category: "Plushies", price: 550, cost: 190 },
    { name: "Bear Plushie", category: "Plushies", price: 600, cost: 210 },
    { name: "Scrunchie", category: "Accessories", price: 90, cost: 25 },
    { name: "Coaster Set (4)", category: "Home Decor", price: 400, cost: 130 },
  ];

  const createdProducts = await db.transaction(async (tx) => {
    const out = [];
    for (const p of productSeed) {
      const code = await allocateNumber(tx, orgId, "PRODUCT");
      const [row] = await tx.insert(products).values({
        orgId, code, name: p.name, description: p.desc ?? null,
        categoryId: cat(p.category), defaultPriceMinor: toMinor(p.price),
        costMinor: toMinor(p.cost ?? 0) || null, unit: "pcs",
      }).returning();
      out.push(row);
    }
    return out;
  });
  const product = (name: string) => createdProducts.find((p) => p.name === name)!;

  // ── customers
  const customerSeed = [
    { name: "Priya Shah", phone: "+91 98250 11223", email: "priya@example.com", address: "Navrangpura, Ahmedabad" },
    { name: "Ananya Mehta", phone: "+91 99043 55671", email: "ananya@example.com", address: "Bodakdev, Ahmedabad" },
    { name: "Kavya Patel", phone: "+91 98795 33210", address: "Vastrapur, Ahmedabad" },
    { name: "Ishita Rao", phone: "+91 90999 87766", email: "ishita@example.com" },
    { name: "Meera Joshi", phone: "+91 97250 44881" },
    { name: "Sneha Desai", phone: "+91 94260 77123", address: "Satellite, Ahmedabad" },
  ];

  const createdCustomers = await db.transaction(async (tx) => {
    const out = [];
    for (const c of customerSeed) {
      const code = await allocateNumber(tx, orgId, "CUSTOMER");
      const [row] = await tx.insert(customers).values({
        orgId, code, name: c.name, phone: c.phone ?? null,
        email: c.email ?? null, address: c.address ?? null,
      }).returning();
      out.push(row);
    }
    return out;
  });
  const customer = (name: string) => createdCustomers.find((c) => c.name === name)!;

  // ── customer-specific pricing (requirement 14): the same product, three prices
  await db.insert(customerPrices).values([
    { orgId, customerId: customer("Priya Shah").id, productId: product("Bunny Plushie").id, priceMinor: toMinor(500), note: "Long-standing customer" },
    { orgId, customerId: customer("Ananya Mehta").id, productId: product("Bunny Plushie").id, priceMinor: toMinor(650), note: "Custom colours" },
    { orgId, customerId: customer("Kavya Patel").id, productId: product("Bunny Plushie").id, priceMinor: toMinor(550) },
    { orgId, customerId: customer("Sneha Desai").id, productId: null, discountPercent: 10, note: "Reseller — 10% off everything" },
  ]);

  // ── orders
  type Line = { product: string; qty: number; price?: number };
  const orderSeed: {
    customer: string; daysAgo: number; deliverInDays: number; status: string;
    lines: Line[]; paid?: number[]; note?: string;
  }[] = [
    { customer: "Priya Shah", daysAgo: 22, deliverInDays: -15, status: "delivered", lines: [{ product: "Bunny Plushie", qty: 2 }, { product: "Mini Keychain", qty: 3 }], paid: [500, 860] },
    { customer: "Ananya Mehta", daysAgo: 18, deliverInDays: -10, status: "delivered", lines: [{ product: "Crochet Tote Bag", qty: 1 }], paid: [700] },
    { customer: "Kavya Patel", daysAgo: 14, deliverInDays: -6, status: "delivered", lines: [{ product: "Crochet Flower", qty: 10 }], paid: [1200, 1300] },
    { customer: "Meera Joshi", daysAgo: 11, deliverInDays: -2, status: "in_transit", lines: [{ product: "Flower Bouquet (5 stems)", qty: 1 }, { product: "Scrunchie", qty: 4 }], paid: [600], note: "Gift wrap requested" },
    { customer: "Ishita Rao", daysAgo: 9, deliverInDays: 0, status: "ready_to_ship", lines: [{ product: "Bear Plushie", qty: 1 }, { product: "Character Keychain", qty: 2 }], paid: [400] },
    { customer: "Sneha Desai", daysAgo: 7, deliverInDays: 1, status: "in_progress", lines: [{ product: "Granny Square Bag", qty: 2 }, { product: "Coaster Set (4)", qty: 3 }], paid: [1500] },
    { customer: "Priya Shah", daysAgo: 5, deliverInDays: 2, status: "in_progress", lines: [{ product: "Crochet Flower", qty: 6 }], paid: [] },
    { customer: "Ananya Mehta", daysAgo: 3, deliverInDays: -1, status: "not_started", lines: [{ product: "Bunny Plushie", qty: 1 }, { product: "Scrunchie", qty: 2 }], paid: [], note: "Overdue — chase this one" },
    { customer: "Kavya Patel", daysAgo: 2, deliverInDays: 6, status: "not_started", lines: [{ product: "Crochet Tote Bag", qty: 1, price: 650 }], paid: [300], note: "Negotiated price" },
    { customer: "Ishita Rao", daysAgo: 1, deliverInDays: 9, status: "not_started", lines: [{ product: "Mini Keychain", qty: 12 }], paid: [] },
    { customer: "Meera Joshi", daysAgo: 0, deliverInDays: 5, status: "not_started", lines: [{ product: "Coaster Set (4)", qty: 2 }, { product: "Crochet Flower", qty: 4 }], paid: [500] },
  ];

  for (const o of orderSeed) {
    await db.transaction(async (tx) => {
      const orderDate = daysFromNow(-o.daysAgo);
      const cust = customer(o.customer);
      const rules = await tx.select().from(customerPrices).where(eq(customerPrices.customerId, cust.id));

      const priced = o.lines.map((l, i) => {
        const p = product(l.product);
        let unit = p.defaultPriceMinor;
        let source: "PRODUCT_DEFAULT" | "CUSTOMER_PRODUCT" | "CUSTOMER_RULE" | "ORDER_OVERRIDE" = "PRODUCT_DEFAULT";
        const specific = rules.find((r) => r.productId === p.id);
        const wide = rules.find((r) => r.productId === null);
        if (specific?.priceMinor) { unit = specific.priceMinor; source = "CUSTOMER_PRODUCT"; }
        else if (wide?.discountPercent) { unit = Math.round(unit * (1 - wide.discountPercent / 100)); source = "CUSTOMER_RULE"; }
        if (l.price !== undefined) { unit = toMinor(l.price); source = "ORDER_OVERRIDE"; }
        return {
          orgId, productId: p.id, productNameSnapshot: p.name, quantity: l.qty,
          unitPriceMinor: unit, discountMinor: 0,
          lineTotalMinor: Math.round(unit * l.qty), priceSource: source, sortOrder: i,
        };
      });

      const totals = computeOrderTotals({ lines: priced.map((p) => ({ quantity: p.quantity, unitPriceMinor: p.unitPriceMinor })) });
      const st = status(o.status);
      const number = await allocateNumber(tx, orgId, "ORDER", orderDate);

      const [order] = await tx.insert(orders).values({
        orgId, number, customerId: cust.id, orderDate,
        deliveryByDate: daysFromNow(o.deliverInDays),
        statusId: st.id, note: o.note ?? null,
        subtotalMinor: totals.subtotalMinor, totalMinor: totals.totalMinor,
        completedAt: st.isCompleted ? daysFromNow(o.deliverInDays) : null,
      }).returning();

      await tx.insert(orderItems).values(priced.map((p) => ({ ...p, orderId: order.id })));
      await tx.insert(activityEntries).values({
        orgId, entityType: "ORDER", entityId: order.id, type: "order.created",
        message: `Order ${number} created`, actorName: "Riya", createdAt: orderDate,
      });

      const paidRows = (o.paid ?? []).map((amount, i) => ({
        orgId, orderId: order.id, customerId: cust.id,
        amountMinor: toMinor(amount),
        paidAt: daysFromNow(-o.daysAgo + i * 3),
        methodId: i % 2 === 0 ? method("upi") : method("cash"),
        note: i === 0 ? "Advance" : "Balance payment",
      }));
      if (paidRows.length) {
        await tx.insert(payments).values(paidRows);
        for (const p of paidRows) {
          await tx.insert(activityEntries).values({
            orgId, entityType: "ORDER", entityId: order.id, type: "payment.recorded",
            message: `₹${(p.amountMinor / 100).toLocaleString("en-IN")} received`, actorName: "Riya", createdAt: p.paidAt,
          });
        }
      }

      const paid = paidTotal(paidRows.map((p) => ({ amountMinor: p.amountMinor })));
      await tx.update(orders).set({
        paidMinor: paid, paymentStatus: derivePaymentStatus(totals.totalMinor, paid),
      }).where(eq(orders.id, order.id));
    });
  }

  // ── event with production plan (requirement 53)
  await db.transaction(async (tx) => {
    const code = await allocateNumber(tx, orgId, "EVENT");
    const [event] = await tx.insert(events).values({
      orgId, code, name: "Ahmedabad University Fest",
      startDate: daysFromNow(12), endDate: daysFromNow(14),
      location: "AU Campus, Central Lawn",
      notes: "Two-day stall. Carry card reader and change.",
      budgetMinor: toMinor(4000),
    }).returning();

    const plan = [
      { name: "Mini Keychain", category: "Keychains", planned: 50, completed: 40, price: 120 },
      { name: "Crochet Flower", category: "Flowers", planned: 30, completed: 30, price: 250 },
      { name: "Crochet Tote Bag", category: "Bags", planned: 15, completed: 7, price: 700 },
      { name: "Bunny Plushie", category: "Plushies", planned: 20, completed: 0, price: 550 },
      { name: "Scrunchie", category: "Accessories", planned: 40, completed: 18, price: 90 },
    ];

    await tx.insert(eventProductionItems).values(plan.map((p, i) => ({
      orgId, eventId: event.id, productId: product(p.name).id, productNameSnapshot: p.name,
      categoryId: cat(p.category), quantityPlanned: p.planned, quantityCompleted: p.completed,
      unitPriceMinor: toMinor(p.price), sortOrder: i,
    })));

    const code2 = await allocateNumber(tx, orgId, "EVENT");
    await tx.insert(events).values({
      orgId, code: code2, name: "Diwali Pop-up Market",
      startDate: daysFromNow(48), endDate: daysFromNow(49),
      location: "Prahlad Nagar Garden",
    });
  });

  // ── expenses
  const expenseSeed = [
    { daysAgo: 26, description: "Cotton yarn — 20 skeins", category: "Raw Materials", amount: 2400, method: "upi", vendor: "Yarn Bazaar" },
    { daysAgo: 24, description: "Gift boxes and ribbon", category: "Packaging", amount: 800, method: "cash", vendor: "Packaging Point" },
    { daysAgo: 20, description: "Courier charges", category: "Transport", amount: 450, method: "upi" },
    { daysAgo: 16, description: "Instagram promotion", category: "Advertising", amount: 1200, method: "upi" },
    { daysAgo: 12, description: "Stuffing / fibre fill", category: "Raw Materials", amount: 900, method: "cash", vendor: "Craft House" },
    { daysAgo: 9, description: "Stall registration — AU Fest", category: "Event Fees", amount: 3000, method: "bank_transfer" },
    { daysAgo: 6, description: "Velvet yarn — 8 skeins", category: "Raw Materials", amount: 1600, method: "upi", vendor: "Yarn Bazaar" },
    { daysAgo: 4, description: "Thank-you cards", category: "Packaging", amount: 350, method: "cash" },
    { daysAgo: 2, description: "Auto fare — supplier visit", category: "Transport", amount: 180, method: "cash" },
    { daysAgo: 0, description: "Crochet hooks set", category: "Raw Materials", amount: 620, method: "upi" },
  ];

  await db.transaction(async (tx) => {
    for (const e of expenseSeed) {
      const code = await allocateNumber(tx, orgId, "EXPENSE");
      await tx.insert(expenses).values({
        orgId, code, date: daysFromNow(-e.daysAgo), description: e.description,
        categoryId: cat(e.category), amountMinor: toMinor(e.amount),
        methodId: method(e.method), vendor: e.vendor ?? null,
      });
    }
  });

  console.log(`
Done.

  Workspace : ${org.name}
  Sign in   : ${DEMO_EMAIL} / ${DEMO_PASSWORD}
  Orders    : ${orderSeed.length}
  Customers : ${createdCustomers.length}
  Products  : ${createdProducts.length}
`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
