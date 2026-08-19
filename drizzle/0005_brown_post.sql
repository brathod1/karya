CREATE INDEX "customer_org_live_name_idx" ON "customers" USING btree ("org_id","name") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "expense_org_live_date_idx" ON "expenses" USING btree ("org_id","date") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "order_org_live_date_idx" ON "orders" USING btree ("org_id","order_date") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "order_org_live_delivery_idx" ON "orders" USING btree ("org_id","delivery_by_date") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "payment_org_customer_kind_idx" ON "payments" USING btree ("org_id","customer_id","kind");--> statement-breakpoint
CREATE INDEX "product_org_live_name_idx" ON "products" USING btree ("org_id","name") WHERE archived_at is null;