CREATE TYPE "public"."category_kind" AS ENUM('PRODUCT', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."discount_type" AS ENUM('AMOUNT', 'PERCENT');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('ORDER', 'ORDER_ITEM', 'CUSTOMER', 'PRODUCT', 'EXPENSE', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."field_type" AS ENUM('TEXT', 'TEXTAREA', 'NUMBER', 'CURRENCY', 'DATE', 'SELECT', 'MULTI_SELECT', 'CHECKBOX', 'URL', 'FILE');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('DRAFT', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('PAYMENT', 'REFUND', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PARTIAL', 'PAID', 'OVERPAID');--> statement-breakpoint
CREATE TYPE "public"."price_source" AS ENUM('ORDER_OVERRIDE', 'CUSTOMER_PRODUCT', 'CUSTOMER_RULE', 'PRODUCT_DEFAULT', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."reset_policy" AS ENUM('NEVER', 'YEARLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'ADMIN', 'STAFF', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."status_kind" AS ENUM('ORDER', 'EVENT_ITEM');--> statement-breakpoint
CREATE TYPE "public"."status_semantic" AS ENUM('NONE', 'PRODUCTION', 'SHIPMENT', 'COMPLETION', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "activity_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"actor_user_id" uuid,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "category_kind" NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"type" "field_type" DEFAULT 'TEXT' NOT NULL,
	"options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"show_in_table" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_value" jsonb
);
--> statement-breakpoint
CREATE TABLE "custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "customer_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid,
	"price_minor" integer,
	"discount_percent" double precision,
	"note" text,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"notes" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_production_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name_snapshot" text NOT NULL,
	"category_id" uuid,
	"quantity_planned" double precision DEFAULT 1 NOT NULL,
	"quantity_completed" double precision DEFAULT 0 NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_item_planned_positive" CHECK ("event_production_items"."quantity_planned" > 0),
	CONSTRAINT "event_item_completed_nonneg" CHECK ("event_production_items"."quantity_completed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"location" text,
	"notes" text,
	"budget_minor" integer,
	"expected_sales_minor" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid,
	"amount_minor" integer NOT NULL,
	"method_id" uuid,
	"vendor" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_amount_nonneg" CHECK ("expenses"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"target_entity" text NOT NULL,
	"mapping" jsonb,
	"status" "import_status" DEFAULT 'DRAFT' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"success_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"summary" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"role" "role" DEFAULT 'STAFF' NOT NULL,
	"invited_email" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"prefix" text NOT NULL,
	"pattern" text DEFAULT '{PREFIX}-{SEQ:5}' NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"reset_policy" "reset_policy" DEFAULT 'NEVER' NOT NULL,
	"last_reset_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name_snapshot" text NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit_price_minor" integer DEFAULT 0 NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"line_total_minor" integer DEFAULT 0 NOT NULL,
	"price_source" "price_source" DEFAULT 'PRODUCT_DEFAULT' NOT NULL,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_item_qty_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_item_price_nonneg" CHECK ("order_items"."unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"order_date" date DEFAULT now() NOT NULL,
	"delivery_by_date" date,
	"delivery_time" text,
	"requested_date" date,
	"internal_deadline" date,
	"status_id" uuid NOT NULL,
	"note" text,
	"internal_note" text,
	"customer_note" text,
	"discount_type" "discount_type" DEFAULT 'AMOUNT' NOT NULL,
	"discount_value" double precision DEFAULT 0 NOT NULL,
	"subtotal_minor" integer DEFAULT 0 NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"additional_charges_minor" integer DEFAULT 0 NOT NULL,
	"tax_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer DEFAULT 0 NOT NULL,
	"paid_minor" integer DEFAULT 0 NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"completed_at" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_total_nonneg" CHECK ("orders"."total_minor" >= 0),
	CONSTRAINT "order_subtotal_nonneg" CHECK ("orders"."subtotal_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"currency_code" text DEFAULT 'INR' NOT NULL,
	"currency_symbol" text DEFAULT '₹' NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"template_key" text DEFAULT 'generic' NOT NULL,
	"business_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid,
	"customer_id" uuid,
	"amount_minor" integer NOT NULL,
	"paid_at" date DEFAULT now() NOT NULL,
	"method_id" uuid,
	"reference" text,
	"note" text,
	"kind" "payment_kind" DEFAULT 'PAYMENT' NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_nonzero" CHECK ("payments"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"default_price_minor" integer DEFAULT 0 NOT NULL,
	"cost_minor" integer,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"image_url" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_price_nonneg" CHECK ("products"."default_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "status_kind" DEFAULT 'ORDER' NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"semantic" "status_semantic" DEFAULT 'NONE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_definition_id_custom_field_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."custom_field_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_production_items" ADD CONSTRAINT "event_production_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_production_items" ADD CONSTRAINT "event_production_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_production_items" ADD CONSTRAINT "event_production_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_production_items" ADD CONSTRAINT "event_production_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_method_id_payment_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_id_status_definitions_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_id_payment_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_definitions" ADD CONSTRAINT "status_definitions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_entries" USING btree ("org_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_org_idx" ON "activity_entries" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "attachment_entity_idx" ON "attachments" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_org_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "category_org_kind_idx" ON "categories" USING btree ("org_id","kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "category_unique_active" ON "categories" USING btree ("org_id","kind","name") WHERE archived_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "cfd_org_entity_key" ON "custom_field_definitions" USING btree ("org_id","entity_type","key");--> statement-breakpoint
CREATE INDEX "cfd_org_entity_idx" ON "custom_field_definitions" USING btree ("org_id","entity_type","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "cfv_def_entity_key" ON "custom_field_values" USING btree ("definition_id","entity_id");--> statement-breakpoint
CREATE INDEX "cfv_org_entity_idx" ON "custom_field_values" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_price_key" ON "customer_prices" USING btree ("org_id","customer_id","product_id");--> statement-breakpoint
CREATE INDEX "customer_price_customer_idx" ON "customer_prices" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_code_key" ON "customers" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "customer_org_name_idx" ON "customers" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "event_item_event_idx" ON "event_production_items" USING btree ("org_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_org_code_key" ON "events" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "event_org_start_idx" ON "events" USING btree ("org_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_org_code_key" ON "expenses" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "expense_org_date_idx" ON "expenses" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "expense_org_category_idx" ON "expenses" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "import_org_idx" ON "import_jobs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_key" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seq_org_entity_key" ON "number_sequences" USING btree ("org_id","entity_type");--> statement-breakpoint
CREATE INDEX "order_item_order_idx" ON "order_items" USING btree ("org_id","order_id");--> statement-breakpoint
CREATE INDEX "order_item_product_idx" ON "order_items" USING btree ("org_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_org_number_key" ON "orders" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "order_org_date_idx" ON "orders" USING btree ("org_id","order_date");--> statement-breakpoint
CREATE INDEX "order_org_status_idx" ON "orders" USING btree ("org_id","status_id");--> statement-breakpoint
CREATE INDEX "order_org_paystatus_idx" ON "orders" USING btree ("org_id","payment_status");--> statement-breakpoint
CREATE INDEX "order_org_delivery_idx" ON "orders" USING btree ("org_id","delivery_by_date");--> statement-breakpoint
CREATE INDEX "order_org_customer_idx" ON "orders" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_method_org_key" ON "payment_methods" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "payment_org_date_idx" ON "payments" USING btree ("org_id","paid_at");--> statement-breakpoint
CREATE INDEX "payment_org_order_idx" ON "payments" USING btree ("org_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_org_customer_idx" ON "payments" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_code_key" ON "products" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "product_org_name_idx" ON "products" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "product_org_category_idx" ON "products" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "saved_view_org_entity_idx" ON "saved_views" USING btree ("org_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "status_org_kind_key" ON "status_definitions" USING btree ("org_id","kind","key");--> statement-breakpoint
CREATE INDEX "status_org_kind_sort_idx" ON "status_definitions" USING btree ("org_id","kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));