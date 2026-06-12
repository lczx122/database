CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"target_document_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"doc_date" date NOT NULL,
	"supplier_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"payment_mode_code" text DEFAULT '01' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"reference" text,
	"status" text DEFAULT 'issued' NOT NULL,
	"posted_journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"doc_date" date NOT NULL,
	"customer_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"payment_mode_code" text DEFAULT '01' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"reference" text,
	"status" text DEFAULT 'issued' NOT NULL,
	"posted_journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "classification_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "msic_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_mode_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uom_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tin" text DEFAULT '' NOT NULL,
	"brn" text DEFAULT '' NOT NULL,
	"sst_registration_no" text,
	"tourism_tax_no" text,
	"msic_code" text DEFAULT '00000' NOT NULL,
	"msic_description" text DEFAULT 'NOT APPLICABLE' NOT NULL,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text,
	"address_line3" text,
	"postcode" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '14' NOT NULL,
	"country_code" text DEFAULT 'MYS' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text,
	"base_currency" text DEFAULT 'MYR' NOT NULL,
	"sst_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "einvoice_api_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"http_status" integer,
	"request" jsonb,
	"response" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "einvoice_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_document_id" uuid,
	"purchase_document_id" uuid,
	"einvoice_type_code" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"internal_id" text NOT NULL,
	"submission_uid" text,
	"document_uuid" text,
	"long_id" text,
	"document_hash" text,
	"payload" jsonb,
	"signed" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"error_details" jsonb,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_no" text NOT NULL,
	"entry_date" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"status" text DEFAULT 'posted' NOT NULL,
	"reversed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_entry_no_unique" UNIQUE("entry_no")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"party_type" text,
	"party_id" uuid,
	CONSTRAINT "journal_lines_one_side" CHECK ("journal_lines"."debit" = 0 OR "journal_lines"."credit" = 0),
	CONSTRAINT "journal_lines_non_negative" CHECK ("journal_lines"."debit" >= 0 AND "journal_lines"."credit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tin" text DEFAULT '' NOT NULL,
	"id_type" text DEFAULT 'BRN' NOT NULL,
	"id_value" text DEFAULT '' NOT NULL,
	"sst_no" text,
	"email" text,
	"phone" text,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text,
	"address_line3" text,
	"postcode" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '14' NOT NULL,
	"country_code" text DEFAULT 'MYS' NOT NULL,
	"credit_terms_days" integer DEFAULT 30 NOT NULL,
	"payment_mode_code" text DEFAULT '01' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"receivable_account_id" uuid,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'product' NOT NULL,
	"classification_code" text DEFAULT '022' NOT NULL,
	"uom_code" text DEFAULT 'C62' NOT NULL,
	"unit_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"sales_tax_code_id" uuid,
	"purchase_tax_code_id" uuid,
	"track_stock" boolean DEFAULT false NOT NULL,
	"sales_account_id" uuid,
	"cogs_account_id" uuid,
	"stock_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tin" text DEFAULT '' NOT NULL,
	"id_type" text DEFAULT 'BRN' NOT NULL,
	"id_value" text DEFAULT '' NOT NULL,
	"sst_no" text,
	"email" text,
	"phone" text,
	"address_line1" text DEFAULT '' NOT NULL,
	"address_line2" text,
	"address_line3" text,
	"postcode" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '14' NOT NULL,
	"country_code" text DEFAULT 'MYS' NOT NULL,
	"credit_terms_days" integer DEFAULT 30 NOT NULL,
	"payment_mode_code" text DEFAULT '01' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"msic_code" text,
	"payable_account_id" uuid,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"rate" numeric(9, 4) DEFAULT '0' NOT NULL,
	"myinvois_tax_type_code" text DEFAULT '06' NOT NULL,
	"exemption_reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "document_counters" (
	"doc_type" text PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"classification_code" text DEFAULT '022' NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"uom_code" text DEFAULT 'C62' NOT NULL,
	"unit_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_code_id" uuid,
	"tax_type_code" text DEFAULT '06' NOT NULL,
	"tax_rate" numeric(9, 4) DEFAULT '0' NOT NULL,
	"tax_exemption_reason" text,
	"tax_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"doc_date" date NOT NULL,
	"currency_code" text DEFAULT 'MYR' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1' NOT NULL,
	"party_snapshot" jsonb,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"rounding" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"posted_journal_entry_id" uuid,
	"payment_mode_code" text DEFAULT '01' NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"issued_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"doc_type" text DEFAULT 'SUPPLIER_BILL' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_ref" text,
	"reference_doc_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid,
	"description" text NOT NULL,
	"classification_code" text DEFAULT '022' NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"uom_code" text DEFAULT 'C62' NOT NULL,
	"unit_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_code_id" uuid,
	"tax_type_code" text DEFAULT '06' NOT NULL,
	"tax_rate" numeric(9, 4) DEFAULT '0' NOT NULL,
	"tax_exemption_reason" text,
	"tax_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"doc_date" date NOT NULL,
	"currency_code" text DEFAULT 'MYR' NOT NULL,
	"exchange_rate" numeric(18, 6) DEFAULT '1' NOT NULL,
	"party_snapshot" jsonb,
	"subtotal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"rounding" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"posted_journal_entry_id" uuid,
	"payment_mode_code" text DEFAULT '01' NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"issued_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"doc_type" text DEFAULT 'INVOICE' NOT NULL,
	"customer_id" uuid NOT NULL,
	"reference_doc_id" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"qty_change" numeric(18, 4) NOT NULL,
	"unit_cost" numeric(18, 6) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_no" text,
	"doc_date" date NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"posted_journal_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_adjustments_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_date" date NOT NULL,
	"type" text NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"qty_in" numeric(18, 4) DEFAULT '0' NOT NULL,
	"qty_out" numeric(18, 4) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(18, 6) DEFAULT '0' NOT NULL,
	"total_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"running_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"running_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_posted_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("posted_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bank_account_id_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_posted_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("posted_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_api_log" ADD CONSTRAINT "einvoice_api_log_submission_id_einvoice_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."einvoice_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_submissions" ADD CONSTRAINT "einvoice_submissions_sales_document_id_sales_documents_id_fk" FOREIGN KEY ("sales_document_id") REFERENCES "public"."sales_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice_submissions" ADD CONSTRAINT "einvoice_submissions_purchase_document_id_purchase_documents_id_fk" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversed_by_id_journal_entries_id_fk" FOREIGN KEY ("reversed_by_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_receivable_account_id_accounts_id_fk" FOREIGN KEY ("receivable_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_sales_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("sales_tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_purchase_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("purchase_tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_sales_account_id_accounts_id_fk" FOREIGN KEY ("sales_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cogs_account_id_accounts_id_fk" FOREIGN KEY ("cogs_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_stock_account_id_accounts_id_fk" FOREIGN KEY ("stock_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_payable_account_id_accounts_id_fk" FOREIGN KEY ("payable_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_document_id_purchase_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_posted_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("posted_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_document_id_sales_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."sales_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_posted_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("posted_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_posted_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("posted_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_documents_doc_no" ON "purchase_documents" USING btree ("doc_type","doc_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_documents_doc_no" ON "sales_documents" USING btree ("doc_type","doc_no");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id","created_at");