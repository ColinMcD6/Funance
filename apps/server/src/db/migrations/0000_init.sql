CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`institution` text NOT NULL,
	`type` text NOT NULL,
	`default_owner_id` integer NOT NULL,
	`csv_mapping` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`default_owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "accounts_institution_check" CHECK("accounts"."institution" in ('rbc', 'tangerine', 'simplii', 'walmart', 'other')),
	CONSTRAINT "accounts_type_check" CHECK("accounts"."type" in ('chequing', 'savings', 'credit_card'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`owner_id` integer,
	`monthly_amount_cents` integer NOT NULL,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `budgets_category_idx` ON `budgets` (`category_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`group_name` text NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK("categories"."kind" in ('expense', 'income', 'savings', 'transfer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`filename` text NOT NULL,
	`file_sha256` text NOT NULL,
	`raw_csv` text NOT NULL,
	`status` text NOT NULL,
	`uploaded_by_owner_id` integer NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`inserted_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`date_min` text,
	`date_max` text,
	`created_at` text NOT NULL,
	`committed_at` text,
	`undone_at` text,
	`kind` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "imports_status_check" CHECK("imports"."status" in ('preview', 'committed', 'undone')),
	CONSTRAINT "imports_kind_check" CHECK("imports"."kind" in ('csv', 'legacy')),
	CONSTRAINT "imports_account_kind_check" CHECK(("imports"."kind" = 'csv' and "imports"."account_id" is not null) or ("imports"."kind" = 'legacy' and "imports"."account_id" is null))
);
--> statement-breakpoint
CREATE INDEX `imports_account_idx` ON `imports` (`account_id`);--> statement-breakpoint
CREATE INDEX `imports_sha_idx` ON `imports` (`file_sha256`);--> statement-breakpoint
CREATE TABLE `owners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`sort_order` integer NOT NULL,
	CONSTRAINT "owners_kind_check" CHECK("owners"."kind" in ('person', 'joint'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owners_name_unique` ON `owners` (`name`);--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`priority` integer NOT NULL,
	`match_field` text NOT NULL,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`account_id` integer,
	`direction` text,
	`set_category_id` integer NOT NULL,
	`set_owner_id` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`set_category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`set_owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rules_match_field_check" CHECK("rules"."match_field" in ('description', 'memo', 'bank_category')),
	CONSTRAINT "rules_match_type_check" CHECK("rules"."match_type" in ('contains', 'starts_with', 'equals', 'regex')),
	CONSTRAINT "rules_direction_check" CHECK("rules"."direction" is null or "rules"."direction" in ('outflow', 'inflow'))
);
--> statement-breakpoint
CREATE INDEX `rules_priority_idx` ON `rules` (`priority`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`import_id` integer NOT NULL,
	`owner_id` integer NOT NULL,
	`category_id` integer,
	`category_source` text,
	`rule_id` integer,
	`date` text NOT NULL,
	`posted_date` text,
	`amount_cents` integer NOT NULL,
	`description` text NOT NULL,
	`memo` text,
	`merchant_key` text NOT NULL,
	`bank_category` text,
	`external_id` text,
	`dedup_key` text NOT NULL,
	`occurrence` integer NOT NULL,
	`notes` text,
	`excluded` integer DEFAULT false NOT NULL,
	`raw_row` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `owners`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transactions_category_source_check" CHECK("transactions"."category_source" is null or "transactions"."category_source" in ('manual', 'rule', 'suggestion')),
	CONSTRAINT "transactions_occurrence_check" CHECK("transactions"."occurrence" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_dedup_unique` ON `transactions` (`account_id`,`dedup_key`,`occurrence`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_category_date_idx` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_owner_date_idx` ON `transactions` (`owner_id`,`date`);--> statement-breakpoint
CREATE INDEX `transactions_merchant_key_idx` ON `transactions` (`merchant_key`);--> statement-breakpoint
CREATE INDEX `transactions_import_idx` ON `transactions` (`import_id`);