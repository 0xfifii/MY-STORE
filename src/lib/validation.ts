import { z } from "zod";

/** Decimal quantity as an exact string (no float conversion). Up to 6 decimal places. */
export const qtyString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(/,/g, ""))
  .refine((v) => /^\d{1,14}(\.\d{1,6})?$/.test(v), { message: "Enter a valid number (up to 6 decimal places)" });

export const positiveQty = qtyString.refine((v) => Number(v) > 0, { message: "Quantity must be greater than zero" });

export const moneyString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(/,/g, ""))
  .refine((v) => /^\d{1,14}(\.\d{1,6})?$/.test(v), { message: "Enter a valid amount" });

const optText = (max = 500) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim() : null));

const optInt = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v > 0), { message: "Invalid selection" });

export const uuid = z.string().uuid();

export const conversionInput = z.object({
  unit_id: z.coerce.number().int().positive(),
  factor: positiveQty,
});

export const itemCreateSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(200),
  sku: optText(60),
  category_id: optInt,
  description: optText(2000),
  unit_id: z.coerce.number().int().positive({ message: "Choose a measurement unit" }),
  allow_fraction: z.boolean().optional().default(true),
  min_stock_level: qtyString.optional().default("0"),
  default_supplier_id: optInt,
  notes: optText(2000),
  opening_quantity: qtyString.optional().default("0"),
  opening_unit_cost: moneyString.optional().default("0"),
  conversions: z.array(conversionInput).max(20).optional().default([]),
  request_id: uuid.optional(),
});

export const itemUpdateSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(200),
  sku: z.string().trim().min(1, "Item code is required").max(60),
  category_id: optInt,
  description: optText(2000),
  unit_id: z.coerce.number().int().positive().optional(),
  allow_fraction: z.boolean(),
  min_stock_level: qtyString,
  default_supplier_id: optInt,
  notes: optText(2000),
});

export const stockInSchema = z.object({
  item_id: uuid,
  quantity: positiveQty,
  unit_id: z.coerce.number().int().positive(),
  unit_cost: moneyString,
  supplier_id: optInt,
  supplier_name: optText(200),
  occurred_at: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || !Number.isNaN(Date.parse(v)), { message: "Invalid date" }),
  reference: optText(120),
  notes: optText(1000),
  request_id: uuid,
});

export const stockOutSchema = z.object({
  item_id: uuid,
  quantity: positiveQty,
  unit_id: z.coerce.number().int().positive(),
  reason: z.enum(["store_usage", "kitchen_usage", "bakery_usage", "bar_usage", "cleaning_usage", "sale", "transfer", "damage", "expiry", "wastage", "other"], {
    message: "Choose a reason",
  }),
  recipient: optText(200),
  worker_id: optInt,
  reference: optText(120),
  notes: optText(1000),
  request_id: uuid,
});

export const reverseSchema = z.object({
  reason: z.string().trim().min(3, "Explain why this is being corrected").max(500),
  request_id: uuid,
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: optText(500),
});

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contact_person: optText(200),
  phone: optText(50),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), { message: "Invalid email" }),
  address: optText(500),
  notes: optText(1000),
});

export const unitSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  symbol: z.string().trim().min(1, "Symbol is required").max(20),
  allow_decimal: z.boolean().optional().default(true),
});

export const globalConversionSchema = z.object({
  from_unit_id: z.coerce.number().int().positive(),
  to_unit_id: z.coerce.number().int().positive(),
  factor: positiveQty,
});

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["owner", "staff", "viewer"]),
  password: passwordSchema,
  send_welcome: z.boolean().optional().default(true),
  include_password: z.boolean().optional().default(false),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["owner", "staff", "viewer"]).optional(),
  is_active: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const settingsSchema = z.object({
  store_name: z.string().trim().min(1).max(120),
  currency_code: z.string().trim().min(3).max(3).toUpperCase(),
  currency_symbol: z.string().trim().min(1).max(5),
  timezone: z.string().trim().min(1),
  auto_report_enabled: z.boolean(),
  auto_report_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM"),
  auto_report_covers: z.enum(["previous_day", "same_day"]),
  auto_weekly_enabled: z.boolean().optional().default(false),
  auto_monthly_enabled: z.boolean().optional().default(false),
  auto_report_formats: z.array(z.enum(["pdf", "xlsx", "csv"])).min(1, "Pick at least one format"),
  email_enabled: z.boolean(),
  email_recipients: z.array(z.string().trim().email("Invalid recipient email")).max(20),
});

export const workerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  department: optText(120),
  phone: optText(50),
  notes: optText(500),
});

export const userPermissionsSchema = z.object({
  permissions: z.array(z.string()).max(30).nullable(),
  allowed_category_ids: z.array(z.coerce.number().int().positive()).max(200).nullable(),
});

/** One or more email addresses, as an array or a comma/semicolon/space separated string. */
export const emailListSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(/[,;\s]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean))
  .pipe(z.array(z.string().email("One of the email addresses isn't valid")).min(1, "Add at least one email address").max(25, "Up to 25 recipients"));
