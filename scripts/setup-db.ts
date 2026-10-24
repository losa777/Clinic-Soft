/**
 * ბაზის მომზადება: ცხრილები, როლები, სატესტო მომხმარებლები.
 * იდემპოტენტურია — შეიძლება გაეშვას რამდენჯერაც გინდათ.
 * გაშვება: npm run db:setup
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { SYSTEM_ROLES, type SystemRoleCode } from "@/lib/roles";
import { DEFAULT_SETTINGS } from "@/modules/finance/settings";
import { migrateLegacyVisit } from "@/modules/finance/server/legacy-migration";

/** ძველი, კატეგორიის გარეშე სერვისების კატეგორია. */
const OTHER_CATEGORY = "სხვა";

const TEST_PASSWORD = "Test1234!";

const TEST_USERS: { username: string; firstName: string; lastName: string; role: SystemRoleCode }[] = [
  { username: "admin", firstName: "გიორგი", lastName: "ბერიძე", role: "admin" },
  { username: "registrar", firstName: "ნინო", lastName: "კაპანაძე", role: "registrar" },
  { username: "doctor", firstName: "დავით", lastName: "მაისურაძე", role: "doctor" },
  { username: "nurse", firstName: "მარიამ", lastName: "გელაშვილი", role: "nurse" },
  { username: "lab", firstName: "ლევან", lastName: "ჯავახიშვილი", role: "lab" },
  { username: "accountant", firstName: "თამარ", lastName: "ლომიძე", role: "accountant" },
  { username: "director", firstName: "ირაკლი", lastName: "წერეთელი", role: "director" },
  { username: "warehouse", firstName: "ნათია", lastName: "ხარაიშვილი", role: "warehouse" },
];

const TABLE_OPTIONS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

/** visits-ის სვეტები, რომლებიც პირველი ვერსიის შემდეგ დაემატა. */
const VISIT_EXTRA_COLUMNS: [string, string][] = [
  ["status", "ENUM('active', 'cancelled') NOT NULL DEFAULT 'active'"],
  ["cancel_reason", "VARCHAR(500) NULL"],
  ["cancelled_by", "INT NULL"],
  ["cancelled_at", "DATETIME NULL"],
  ["updated_by", "INT NULL"],
  ["updated_at", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
  ["visit_type", "ENUM('outpatient', 'day_hospital') NOT NULL DEFAULT 'outpatient'"],
];

/** visit_payments-ის სვეტები, რომლებიც პირველი ვერსიის შემდეგ დაემატა. */
const PAYMENT_EXTRA_COLUMNS: [string, string][] = [["method", "ENUM('cash', 'cashless') NOT NULL DEFAULT 'cash'"]];

/**
 * patients.phone მხოლოდ ციფრებით, საქართველოს კოდის (995) გარეშე: "+995 555 12-34-56" → "555123456".
 * REPLACE — MySQL 5.7-შიც და MariaDB-შიც მუშაობს, REGEXP_REPLACE-ისგან განსხვავებით.
 */
const PHONE_DIGITS = ["+", "-", "(", ")", ".", " "].reduce((sql, ch) => `REPLACE(${sql}, '${ch}', '')`, "phone");
const PHONE_DIGITS_EXPRESSION = `IF(${PHONE_DIGITS} LIKE '995_________', SUBSTRING(${PHONE_DIGITS}, 4), ${PHONE_DIGITS})`;

async function ensureColumn(table: string, column: string, definition: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `;
  if (Number(rows[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`✔ სვეტი დაემატა: ${table}.${column}`);
  }
}

async function ensureConstraint(table: string, name: string, definition: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = ${table} AND constraint_name = ${name}
  `;
  if (Number(rows[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition}`);
    console.log(`✔ შეზღუდვა დაემატა: ${table}.${name}`);
  }
}

/** ინდექსის დამატება, თუ ჯერ არ არსებობს (MySQL-ს CREATE INDEX IF NOT EXISTS არ აქვს). */
async function ensureIndex(table: string, name: string, columns: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${name}
  `;
  if (Number(rows[0]?.n ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`CREATE INDEX ${name} ON ${table} (${columns})`);
    console.log(`✔ ინდექსი დაემატა: ${table}.${name}`);
  }
}

async function tableExists(table: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${table}
  `;
  return Number(rows[0]?.n ?? 0) > 0;
}

/** DECIMAL სვეტის სიზუსტის გაზრდა (მაგ. 10,2 → 12,2), თუ ჯერ არ შეცვლილა. */
async function ensureDecimalPrecision(table: string, column: string, precision: number, definition: string) {
  const rows = await prisma.$queryRaw<{ p: bigint | number | null }[]>`
    SELECT NUMERIC_PRECISION AS p FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `;
  if (rows.length && Number(rows[0].p) !== precision) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${definition}`);
    console.log(`✔ სვეტი შეიცვალა: ${table}.${column} → ${definition}`);
  }
}

async function dropIndexIfExists(table: string, name: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = ${table} AND index_name = ${name}
  `;
  if (Number(rows[0]?.n ?? 0) > 0) {
    await prisma.$executeRawUnsafe(`DROP INDEX ${name} ON ${table}`);
    console.log(`✔ ინდექსი წაიშალა: ${table}.${name}`);
  }
}

/**
 * ძველი visits/visit_services/visit_payments: სქემის ბოლო ვერსიამდე განახლება (ძალიან ძველ ბაზაზეც),
 * რომ migrateLegacyVisits ყველა სვეტს პოულობდეს. გამოიძახება მხოლოდ თუ visits უკვე არსებობს.
 */
async function upgradeLegacyVisits() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS visits (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      patient_id   INT           NOT NULL,
      doctor_id    INT           NULL,
      doctor_name  VARCHAR(201)  NOT NULL,
      visit_at     DATETIME      NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      paid_amount  DECIMAL(10,2) NOT NULL,
      comment      TEXT          NULL,
      created_by   INT           NULL,
      created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ${VISIT_EXTRA_COLUMNS.map(([name, def]) => `${name} ${def},`).join("\n      ")}
      INDEX idx_visits_patient (patient_id, visit_at),
      INDEX idx_visits_doctor (doctor_id, visit_at),
      INDEX idx_visits_created_by (created_by),
      CONSTRAINT fk_visits_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_visits_doctor FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_visits_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS visit_services (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      visit_id     INT           NOT NULL,
      service_id   INT           NULL,
      service_code VARCHAR(30)   NULL,
      service_name VARCHAR(255)  NOT NULL,
      price        DECIMAL(10,2) NOT NULL,
      INDEX idx_visit_services_visit_id (visit_id),
      INDEX idx_visit_services_service_id (service_id),
      CONSTRAINT fk_visit_services_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE,
      CONSTRAINT fk_visit_services_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await ensureColumn("visit_services", "service_code", "VARCHAR(30) NULL AFTER service_id");

  // გაუქმება და რედაქტირების აუდიტი (ძველ ცხრილსაც ემატება)
  for (const [name, def] of VISIT_EXTRA_COLUMNS) await ensureColumn("visits", name, def);
  await ensureConstraint("visits", "fk_visits_updated_by", "FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL");
  await ensureConstraint("visits", "fk_visits_cancelled_by", "FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL");

  // გადახდები: თითო შემოტანილი თანხა ცალკე ჩანაწერია; visits.paid_amount მათი ჯამია
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS visit_payments (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      visit_id   INT           NOT NULL,
      amount     DECIMAL(10,2) NOT NULL,
      created_by INT           NULL,
      created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ${PAYMENT_EXTRA_COLUMNS.map(([name, def]) => `${name} ${def},`).join("\n      ")}
      INDEX idx_visit_payments_visit_id (visit_id),
      INDEX idx_visit_payments_created_by (created_by),
      CONSTRAINT fk_visit_payments_visit FOREIGN KEY (visit_id) REFERENCES visits (id),
      CONSTRAINT fk_visit_payments_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // გადახდის ფორმა (ძველ ცხრილსაც ემატება; არსებული გადახდები ნაღდად ჩაითვლება)
  for (const [name, def] of PAYMENT_EXTRA_COLUMNS) await ensureColumn("visit_payments", name, def);
  // გადახდების ცხრილამდე შექმნილ ვიზიტებს გადახდილი თანხა პირველ გადახდად ჩაეწერება
  const backfilled = await prisma.$executeRawUnsafe(`
    INSERT INTO visit_payments (visit_id, amount, created_by, created_at)
    SELECT v.id, v.paid_amount, v.created_by, v.created_at FROM visits v
    WHERE v.paid_amount > 0 AND NOT EXISTS (SELECT 1 FROM visit_payments p WHERE p.visit_id = v.id)
  `);
  if (backfilled) console.log(`✔ ძველ ვიზიტებს დაემატა პირველი გადახდა: ${backfilled}`);
}

/**
 * ფინანსები: დაზღვევა, ინვოისები, გადახდები, სალარო. ყველა თანხა DECIMAL(12,2).
 * დრო (created_at და სხვ.) აპლიკაციიდან იწერება UTC-ში — ბაზის CURRENT_TIMESTAMP აქ არ გამოიყენება,
 * რადგან სერვერის დროის სარტყელი (+04) Prisma-ს UTC-ს არ ემთხვევა.
 */
async function createFinanceTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS insurance_companies (
      id        INT AUTO_INCREMENT PRIMARY KEY,
      name      VARCHAR(150) NOT NULL,
      is_active TINYINT(1)   NOT NULL DEFAULT 1,
      UNIQUE INDEX uq_insurance_companies_name (name)
    ) ${TABLE_OPTIONS}
  `);
  // პირობა სერვისზე ან კატეგორიაზე — ზუსტად ერთი; NULL-ები UNIQUE-ში არ ერევა
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS insurance_contracts (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      company_id       INT           NOT NULL,
      service_id       INT           NULL,
      category_id      INT           NULL,
      coverage_percent DECIMAL(5,2)  NOT NULL,
      limit_amount     DECIMAL(12,2) NULL,
      UNIQUE INDEX uq_insurance_contracts_service (company_id, service_id),
      UNIQUE INDEX uq_insurance_contracts_category (company_id, category_id),
      INDEX idx_insurance_contracts_service_id (service_id),
      INDEX idx_insurance_contracts_category_id (category_id),
      CONSTRAINT chk_insurance_contracts_target CHECK ((service_id IS NULL) <> (category_id IS NULL)),
      CONSTRAINT chk_insurance_contracts_percent CHECK (coverage_percent BETWEEN 0 AND 100),
      CONSTRAINT chk_insurance_contracts_limit CHECK (limit_amount IS NULL OR limit_amount >= 0),
      CONSTRAINT fk_insurance_contracts_company FOREIGN KEY (company_id) REFERENCES insurance_companies (id),
      CONSTRAINT fk_insurance_contracts_service FOREIGN KEY (service_id) REFERENCES services (id),
      CONSTRAINT fk_insurance_contracts_category FOREIGN KEY (category_id) REFERENCES service_categories (id)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS patient_insurances (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      patient_id    INT         NOT NULL,
      company_id    INT         NOT NULL,
      policy_number VARCHAR(50) NOT NULL,
      valid_from    DATE        NOT NULL,
      valid_to      DATE        NOT NULL,
      is_active     TINYINT(1)  NOT NULL DEFAULT 1,
      created_by    INT         NULL,
      created_at    DATETIME    NOT NULL,
      INDEX idx_patient_insurances_patient (patient_id, is_active),
      INDEX idx_patient_insurances_company_id (company_id),
      INDEX idx_patient_insurances_created_by (created_by),
      CONSTRAINT chk_patient_insurances_dates CHECK (valid_to >= valid_from),
      CONSTRAINT fk_patient_insurances_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_patient_insurances_company FOREIGN KEY (company_id) REFERENCES insurance_companies (id),
      CONSTRAINT fk_patient_insurances_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS number_sequences (
      name       VARCHAR(20) NOT NULL,
      year       SMALLINT    NOT NULL,
      last_value INT         NOT NULL,
      PRIMARY KEY (name, year)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS invoices (
      id                        INT AUTO_INCREMENT PRIMARY KEY,
      invoice_number            VARCHAR(20)   NOT NULL,
      patient_id                INT           NOT NULL,
      appointment_id            INT           NULL,
      doctor_id                 INT           NULL,
      doctor_name               VARCHAR(201)  NULL,
      service_date              DATETIME      NOT NULL,
      visit_type                ENUM('outpatient', 'day_hospital') NOT NULL DEFAULT 'outpatient',
      status                    ENUM('unpaid', 'partial', 'paid', 'cancelled') NOT NULL DEFAULT 'unpaid',
      total_amount              DECIMAL(12,2) NOT NULL,
      discount_amount           DECIMAL(12,2) NOT NULL,
      insurance_amount          DECIMAL(12,2) NOT NULL,
      patient_amount            DECIMAL(12,2) NOT NULL,
      patient_insurance_id      INT           NULL,
      insurance_company_id      INT           NULL,
      policy_number             VARCHAR(50)   NULL,
      insurance_disabled_reason VARCHAR(500)  NULL,
      comment                   TEXT          NULL,
      cancel_reason             VARCHAR(500)  NULL,
      cancelled_by              INT           NULL,
      cancelled_at              DATETIME      NULL,
      created_by                INT           NULL,
      created_at                DATETIME      NOT NULL,
      legacy_visit_id           INT           NULL,
      UNIQUE INDEX uq_invoices_number (invoice_number),
      UNIQUE INDEX uq_invoices_legacy_visit (legacy_visit_id),
      INDEX idx_invoices_patient (patient_id),
      INDEX idx_invoices_created_at (created_at),
      INDEX idx_invoices_status (status),
      INDEX idx_invoices_appointment_id (appointment_id),
      INDEX idx_invoices_insurance (insurance_company_id, created_at),
      INDEX idx_invoices_doctor_id (doctor_id),
      INDEX idx_invoices_patient_insurance_id (patient_insurance_id),
      INDEX idx_invoices_created_by (created_by),
      INDEX idx_invoices_cancelled_by (cancelled_by),
      INDEX idx_invoices_cancelled_at (cancelled_at),
      CONSTRAINT chk_invoices_amounts CHECK (
        total_amount >= 0 AND discount_amount >= 0 AND insurance_amount >= 0 AND patient_amount >= 0
        AND insurance_amount + patient_amount = total_amount
      ),
      CONSTRAINT fk_invoices_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_invoices_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id),
      CONSTRAINT fk_invoices_doctor FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_invoices_patient_insurance FOREIGN KEY (patient_insurance_id) REFERENCES patient_insurances (id),
      CONSTRAINT fk_invoices_insurance_company FOREIGN KEY (insurance_company_id) REFERENCES insurance_companies (id),
      CONSTRAINT fk_invoices_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_invoices_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id       INT           NOT NULL,
      service_id       INT           NULL,
      service_code     VARCHAR(30)   NULL,
      service_name     VARCHAR(255)  NOT NULL,
      quantity         SMALLINT      NOT NULL DEFAULT 1,
      unit_price       DECIMAL(12,2) NOT NULL,
      discount_percent DECIMAL(5,2)  NOT NULL,
      discount_amount  DECIMAL(12,2) NOT NULL,
      total_amount     DECIMAL(12,2) NOT NULL,
      insurance_amount DECIMAL(12,2) NOT NULL,
      patient_amount   DECIMAL(12,2) NOT NULL,
      INDEX idx_invoice_items_invoice (invoice_id),
      INDEX idx_invoice_items_service (service_id),
      CONSTRAINT chk_invoice_items_values CHECK (
        quantity > 0 AND unit_price >= 0 AND discount_percent BETWEEN 0 AND 100
        AND insurance_amount >= 0 AND patient_amount >= 0 AND insurance_amount + patient_amount = total_amount
      ),
      CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id),
      CONSTRAINT fk_invoice_items_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // ერთ მომხმარებელს ერთი ღია ცვლა: open_user_id = user_id მხოლოდ ღია ცვლაზე (დახურულზე NULL), მასზე UNIQUE
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cash_shifts (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT           NOT NULL,
      opened_at     DATETIME      NOT NULL,
      opening_cash  DECIMAL(12,2) NOT NULL,
      closed_at     DATETIME      NULL,
      expected_cash DECIMAL(12,2) NULL,
      actual_cash   DECIMAL(12,2) NULL,
      difference    DECIMAL(12,2) NULL,
      close_note    VARCHAR(500)  NULL,
      status        ENUM('open', 'closed') NOT NULL DEFAULT 'open',
      open_user_id  INT GENERATED ALWAYS AS (IF(status = 'open', user_id, NULL)) STORED,
      UNIQUE INDEX uq_cash_shifts_open_user (open_user_id),
      INDEX idx_cash_shifts_user (user_id, opened_at),
      INDEX idx_cash_shifts_status (status),
      CONSTRAINT chk_cash_shifts_opening CHECK (opening_cash >= 0),
      CONSTRAINT fk_cash_shifts_user FOREIGN KEY (user_id) REFERENCES users (id)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS payments (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      receipt_number    VARCHAR(20)   NOT NULL,
      invoice_id        INT           NOT NULL,
      type              ENUM('payment', 'refund') NOT NULL DEFAULT 'payment',
      method            ENUM('cash', 'card') NOT NULL,
      amount            DECIMAL(12,2) NOT NULL,
      received_amount   DECIMAL(12,2) NULL,
      change_amount     DECIMAL(12,2) NULL,
      card_reference    VARCHAR(30)   NULL,
      reason            VARCHAR(500)  NULL,
      cash_shift_id     INT           NULL,
      created_by        INT           NULL,
      created_at        DATETIME      NOT NULL,
      legacy_payment_id INT           NULL,
      UNIQUE INDEX uq_payments_receipt (receipt_number),
      UNIQUE INDEX uq_payments_legacy (legacy_payment_id),
      INDEX idx_payments_invoice (invoice_id),
      INDEX idx_payments_created_at (created_at),
      INDEX idx_payments_cash_shift (cash_shift_id),
      INDEX idx_payments_created_by (created_by),
      CONSTRAINT chk_payments_amount CHECK (amount > 0),
      CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id),
      CONSTRAINT fk_payments_cash_shift FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts (id),
      CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS receipt_prints (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      payment_id INT      NOT NULL,
      format     ENUM('thermal', 'a4') NOT NULL,
      printed_by INT      NULL,
      printed_at DATETIME NOT NULL,
      INDEX idx_receipt_prints_payment_id (payment_id),
      INDEX idx_receipt_prints_printed_by (printed_by),
      CONSTRAINT fk_receipt_prints_payment FOREIGN KEY (payment_id) REFERENCES payments (id),
      CONSTRAINT fk_receipt_prints_printed_by FOREIGN KEY (printed_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(50) NOT NULL PRIMARY KEY,
      value   TEXT        NOT NULL
    ) ${TABLE_OPTIONS}
  `);
}

/** ENUM სვეტის გაფართოება ახალი მნიშვნელობებით (არსებული მნიშვნელობები უცვლელია), თუ ჯერ არ შეცვლილა. */
async function ensureEnum(table: string, column: string, values: string[], suffix: string) {
  const rows = await prisma.$queryRaw<{ t: string }[]>`
    SELECT COLUMN_TYPE AS t FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${table} AND column_name = ${column}
  `;
  const current = rows[0]?.t ?? "";
  if (values.every((v) => current.includes(`'${v}'`))) return;
  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${table} MODIFY COLUMN ${column} ENUM(${values.map((v) => `'${v}'`).join(", ")}) ${suffix}`,
  );
  console.log(`✔ ENUM გაფართოვდა: ${table}.${column}`);
}

/**
 * ექიმის მოდული (სამედიცინო ჩანაწერი): ICD-10, ალერგიები/ქრონიკული/მედიკამენტები, ვიზიტის ჩანაწერი,
 * დიაგნოზები, შაბლონები, რეცეპტები, დანიშნულებები, დოკუმენტები და ხელმოწერები, შეტყობინებები, აუდიტი.
 * დრო აპლიკაციიდან იწერება (UTC) — იხ. createFinanceTables.
 */
/**
 * სპეციალობის მაჩვენებლები: ცნობარი (measurement_definitions), სპეციალობის ნაკრები (specialty_measurements),
 * ვიზიტის მნიშვნელობები (encounter_measurements). ცნობარი ცარიელია — ემატება ნიმუშები (ოფთალმოლოგია, კარდიოლოგია).
 */
async function createMeasurementTables() {
  await ensureColumn("specialties", "show_common_vitals", "TINYINT(1) NOT NULL DEFAULT 1");
  await ensureColumn("encounters", "specialty_id", "INT NULL AFTER doctor_id");
  await ensureIndex("encounters", "encounters_specialty_id_idx", "specialty_id");
  await ensureConstraint("encounters", "fk_encounters_specialty", "FOREIGN KEY (specialty_id) REFERENCES specialties (id)");
  const fresh = !(await tableExists("measurement_definitions"));
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS measurement_definitions (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(150) NOT NULL,
      unit       VARCHAR(30)  NULL,
      type       ENUM('number', 'text', 'select', 'boolean') NOT NULL DEFAULT 'number',
      sides      ENUM('none', 'eyes', 'limbs') NOT NULL DEFAULT 'none',
      min_value  DECIMAL(14,4) NULL,
      max_value  DECIMAL(14,4) NULL,
      normal_min DECIMAL(14,4) NULL,
      normal_max DECIMAL(14,4) NULL,
      decimals   TINYINT      NOT NULL DEFAULT 0,
      options    TEXT         NULL,
      created_at DATETIME     NOT NULL,
      updated_at DATETIME     NOT NULL,
      UNIQUE INDEX uq_measurement_definitions_name (name)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS specialty_measurements (
      specialty_id  INT        NOT NULL,
      definition_id INT        NOT NULL,
      sort_order    INT        NOT NULL DEFAULT 0,
      required      TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (specialty_id, definition_id),
      INDEX specialty_measurements_definition_id_idx (definition_id),
      CONSTRAINT fk_specialty_measurements_specialty FOREIGN KEY (specialty_id) REFERENCES specialties (id) ON DELETE CASCADE,
      CONSTRAINT fk_specialty_measurements_definition FOREIGN KEY (definition_id) REFERENCES measurement_definitions (id)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS encounter_measurements (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      encounter_id  INT           NOT NULL,
      patient_id    INT           NOT NULL,
      definition_id INT           NOT NULL,
      side          ENUM('none', 'right', 'left') NOT NULL DEFAULT 'none',
      value_num     DECIMAL(14,4) NULL,
      value_text    VARCHAR(500)  NULL,
      UNIQUE INDEX uq_encounter_measurements (encounter_id, definition_id, side),
      INDEX idx_encounter_measurements_trend (patient_id, definition_id, encounter_id),
      INDEX encounter_measurements_definition_id_idx (definition_id),
      CONSTRAINT fk_encounter_measurements_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
      CONSTRAINT fk_encounter_measurements_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_encounter_measurements_definition FOREIGN KEY (definition_id) REFERENCES measurement_definitions (id)
    ) ${TABLE_OPTIONS}
  `);
  if (fresh) await seedMeasurements();
}

/** ნიმუშები: ოფთალმოლოგია და კარდიოლოგია (სპეციალობა სახელით, თუ არსებობს). შემდეგ ადმინი ცვლის. */
async function seedMeasurements() {
  type Def = { name: string; unit?: string; type?: string; sides?: string; min?: number; max?: number; nmin?: number; nmax?: number; decimals?: number; options?: string[] };
  const sets: { specialties: string[]; defs: Def[] }[] = [
    {
      specialties: ["ოფთალმოლოგია", "ოფთალმოლოგი"],
      defs: [
        { name: "მხედველობის სიმახვილე (Vis)", sides: "eyes", min: 0, max: 2, nmin: 0.8, decimals: 2 },
        { name: "თვალშიდა წნევა (T)", unit: "მმ Hg", sides: "eyes", min: 5, max: 60, nmin: 10, nmax: 21, decimals: 1 },
        { name: "სფერო (Sph)", unit: "D", sides: "eyes", min: -30, max: 30, decimals: 2 },
        { name: "ცილინდრი (Cyl)", unit: "D", sides: "eyes", min: -10, max: 10, decimals: 2 },
        { name: "ღერძი (Ax)", unit: "°", sides: "eyes", min: 0, max: 180 },
      ],
    },
    {
      specialties: ["კარდიოლოგი", "კარდიოლოგია"],
      defs: [
        { name: "გულის რიტმი", type: "select", options: ["სინუსური", "მოციმციმე არითმია", "ექსტრასისტოლია", "სხვა"] },
        { name: "არტერიული წნევა (სისტოლური)", unit: "მმ Hg", sides: "limbs", min: 40, max: 300, nmin: 90, nmax: 139 },
        { name: "არტერიული წნევა (დიასტოლური)", unit: "მმ Hg", sides: "limbs", min: 20, max: 200, nmin: 60, nmax: 89 },
        { name: "QTc", unit: "მწმ", min: 250, max: 700, nmin: 350, nmax: 450 },
        { name: "საერთო ქოლესტერინი", unit: "მმოლ/ლ", min: 0.5, max: 25, nmax: 5.2, decimals: 1 },
        { name: "LDL ქოლესტერინი", unit: "მმოლ/ლ", min: 0.1, max: 15, nmax: 3, decimals: 1 },
        { name: "შეშუპება ქვედა კიდურებზე", type: "boolean" },
      ],
    },
  ];
  const now = new Date();
  for (const set of sets) {
    const specialty = await prisma.specialty.findFirst({ where: { name: { in: set.specialties } } });
    for (const [i, d] of set.defs.entries()) {
      const def = await prisma.measurementDefinition.upsert({
        where: { name: d.name },
        update: {},
        create: {
          name: d.name,
          unit: d.unit ?? null,
          type: (d.type ?? "number") as "number",
          sides: (d.sides ?? "none") as "none",
          minValue: d.min ?? null,
          maxValue: d.max ?? null,
          normalMin: d.nmin ?? null,
          normalMax: d.nmax ?? null,
          decimals: d.decimals ?? 0,
          options: d.options ? JSON.stringify(d.options) : null,
          createdAt: now,
          updatedAt: now,
        },
      });
      if (specialty) {
        await prisma.specialtyMeasurement.upsert({
          where: { specialtyId_definitionId: { specialtyId: specialty.id, definitionId: def.id } },
          update: {},
          create: { specialtyId: specialty.id, definitionId: def.id, sortOrder: i },
        });
      }
    }
  }
  console.log("✔ მაჩვენებლების ნიმუშები: ოფთალმოლოგია, კარდიოლოგია");
}

async function createEmrTables() {
  // „მიღებაზე“ (in_progress) — ექიმმა დაიწყო მიღება
  await ensureEnum(
    "appointments",
    "status",
    ["booked", "arrived", "in_progress", "completed", "cancelled", "no_show"],
    "NOT NULL DEFAULT 'booked'",
  );
  // კვლევის შედეგი და გენერირებული სამედიცინო დოკუმენტი (PDF) — არსებულ პაციენტის ფაილებში
  await ensureEnum(
    "patient_documents",
    "doc_type",
    ["id_card", "passport", "insurance", "other", "lab_result", "imaging", "medical"],
    "NOT NULL",
  );
  // ცოცხალი რიგი: ინვოისი ექიმით, ჯავშნის გარეშე → ჯავშანი source = 'walk_in' (სლოტს არ იკავებს);
  // arrived_at — მოსვლის დრო, ექიმის „მომლოდინეთა“ რიგისთვის
  await ensureColumn("appointments", "source", "ENUM('booking', 'walk_in') NOT NULL DEFAULT 'booking' AFTER status");
  await ensureColumn("appointments", "arrived_at", "DATETIME NULL AFTER source");
  await ensureColumn("patients", "blood_group", "VARCHAR(3) NULL AFTER phone");
  // დანიშნულების ტიპი კატეგორიაზე (ლაბორატორია / ინსტრუმენტული / ექთნის პროცედურა); არსებულს — სახელით, ერთხელ
  await ensureColumn("service_categories", "order_type", "ENUM('lab', 'instrumental', 'procedure') NULL AFTER name");
  for (const [name, type] of [["ლაბორატორია", "lab"], ["დიაგნოსტიკა", "instrumental"], ["პროცედურა", "procedure"]]) {
    await prisma.$executeRaw`UPDATE service_categories SET order_type = ${type} WHERE name = ${name} AND order_type IS NULL`;
  }
  await ensureConstraint(
    "patients",
    "chk_patients_blood_group",
    "CHECK (blood_group IS NULL OR blood_group IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'))",
  );

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS icd10_codes (
      code    VARCHAR(10)  NOT NULL PRIMARY KEY,
      name_ka VARCHAR(500) NOT NULL,
      name_en VARCHAR(500) NULL,
      INDEX idx_icd10_name_ka (name_ka(100)),
      INDEX idx_icd10_name_en (name_en(100))
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS patient_allergies (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT          NOT NULL,
      substance  VARCHAR(200) NOT NULL,
      reaction   VARCHAR(500) NULL,
      severity   ENUM('mild', 'moderate', 'severe') NOT NULL DEFAULT 'moderate',
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      created_by INT          NULL,
      created_at DATETIME     NOT NULL,
      INDEX idx_patient_allergies_patient (patient_id, is_active),
      INDEX idx_patient_allergies_created_by (created_by),
      CONSTRAINT fk_patient_allergies_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_patient_allergies_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS patient_conditions (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT          NOT NULL,
      icd10_code VARCHAR(10)  NULL,
      name       VARCHAR(500) NOT NULL,
      since      DATE         NULL,
      note       VARCHAR(500) NULL,
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      created_by INT          NULL,
      created_at DATETIME     NOT NULL,
      INDEX idx_patient_conditions_patient (patient_id, is_active),
      INDEX idx_patient_conditions_icd10_code (icd10_code),
      INDEX idx_patient_conditions_created_by (created_by),
      CONSTRAINT fk_patient_conditions_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_patient_conditions_icd10 FOREIGN KEY (icd10_code) REFERENCES icd10_codes (code),
      CONSTRAINT fk_patient_conditions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS patient_medications (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT          NOT NULL,
      drug_name  VARCHAR(200) NOT NULL,
      dose       VARCHAR(100) NULL,
      frequency  VARCHAR(100) NULL,
      note       VARCHAR(500) NULL,
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      created_by INT          NULL,
      created_at DATETIME     NOT NULL,
      INDEX idx_patient_medications_patient (patient_id, is_active),
      INDEX idx_patient_medications_created_by (created_by),
      CONSTRAINT fk_patient_medications_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_patient_medications_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // ვიზიტის ჩანაწერი: ერთი ჯავშანზე (UNIQUE); ექიმი — users.id (სესიიდან, მფლობელობის შესამოწმებლად)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS encounters (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id    INT          NOT NULL,
      patient_id        INT          NOT NULL,
      doctor_id         INT          NOT NULL,
      status            ENUM('draft', 'completed') NOT NULL DEFAULT 'draft',
      complaints        TEXT         NULL,
      anamnesis_disease TEXT         NULL,
      anamnesis_life    TEXT         NULL,
      examination       TEXT         NULL,
      treatment_plan    TEXT         NULL,
      recommendations   TEXT         NULL,
      bp_systolic       SMALLINT     NULL,
      bp_diastolic      SMALLINT     NULL,
      pulse             SMALLINT     NULL,
      temperature       DECIMAL(4,1) NULL,
      spo2              SMALLINT     NULL,
      resp_rate         SMALLINT     NULL,
      weight_kg         DECIMAL(5,1) NULL,
      height_cm         DECIMAL(5,1) NULL,
      version           INT          NOT NULL DEFAULT 1,
      started_at        DATETIME     NOT NULL,
      updated_at        DATETIME     NOT NULL,
      completed_at      DATETIME     NULL,
      UNIQUE INDEX uq_encounters_appointment (appointment_id),
      INDEX idx_encounters_patient (patient_id, started_at),
      INDEX idx_encounters_doctor (doctor_id, started_at),
      INDEX idx_encounters_status (status),
      CONSTRAINT fk_encounters_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id),
      CONSTRAINT fk_encounters_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_encounters_doctor FOREIGN KEY (doctor_id) REFERENCES users (id)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS encounter_diagnoses (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      encounter_id INT          NOT NULL,
      icd10_code   VARCHAR(10)  NOT NULL,
      is_primary   TINYINT(1)   NOT NULL DEFAULT 0,
      note         VARCHAR(500) NULL,
      UNIQUE INDEX uq_encounter_diagnoses (encounter_id, icd10_code),
      INDEX idx_encounter_diagnoses_code (icd10_code),
      CONSTRAINT fk_encounter_diagnoses_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id) ON DELETE CASCADE,
      CONSTRAINT fk_encounter_diagnoses_icd10 FOREIGN KEY (icd10_code) REFERENCES icd10_codes (code)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS doctor_templates (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT          NOT NULL,
      field      ENUM('complaints', 'anamnesis_disease', 'anamnesis_life', 'examination', 'treatment_plan', 'recommendations') NOT NULL,
      title      VARCHAR(100) NOT NULL,
      content    TEXT         NOT NULL,
      created_at DATETIME     NOT NULL,
      INDEX idx_doctor_templates_user (user_id, field),
      CONSTRAINT fk_doctor_templates_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      encounter_id INT          NOT NULL,
      patient_id   INT          NOT NULL,
      drug_name    VARCHAR(200) NOT NULL,
      dose         VARCHAR(100) NOT NULL,
      form         VARCHAR(100) NULL,
      frequency    VARCHAR(100) NOT NULL,
      duration     VARCHAR(100) NULL,
      note         VARCHAR(500) NULL,
      created_by   INT          NULL,
      created_at   DATETIME     NOT NULL,
      INDEX idx_prescriptions_encounter_id (encounter_id),
      INDEX idx_prescriptions_patient (patient_id, created_at),
      INDEX idx_prescriptions_created_by (created_by),
      CONSTRAINT fk_prescriptions_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id),
      CONSTRAINT fk_prescriptions_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_prescriptions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // დანიშნულება არსებული სერვისიდან (ფასი → ფინანსები); რიგი ლაბორანტის/ექთნის გვერდისთვის: (type, status, created_at)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS medical_orders (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      encounter_id       INT          NOT NULL,
      patient_id         INT          NOT NULL,
      type               ENUM('lab', 'instrumental', 'procedure') NOT NULL,
      service_id         INT          NOT NULL,
      service_name       VARCHAR(255) NOT NULL,
      status             ENUM('ordered', 'sample_taken', 'ready', 'done', 'cancelled') NOT NULL DEFAULT 'ordered',
      note               VARCHAR(500) NULL,
      result_text        TEXT         NULL,
      result_document_id INT          NULL,
      created_by         INT          NULL,
      created_at         DATETIME     NOT NULL,
      performed_by       INT          NULL,
      performed_at       DATETIME     NULL,
      updated_at         DATETIME     NOT NULL,
      INDEX idx_medical_orders_queue (type, status, created_at),
      INDEX idx_medical_orders_patient (patient_id, created_at),
      INDEX idx_medical_orders_encounter_id (encounter_id),
      INDEX idx_medical_orders_service_id (service_id),
      INDEX idx_medical_orders_result_document_id (result_document_id),
      INDEX idx_medical_orders_created_by (created_by),
      INDEX idx_medical_orders_performed_by (performed_by),
      CONSTRAINT fk_medical_orders_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id),
      CONSTRAINT fk_medical_orders_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_medical_orders_service FOREIGN KEY (service_id) REFERENCES services (id),
      CONSTRAINT fk_medical_orders_result FOREIGN KEY (result_document_id) REFERENCES patient_documents (id),
      CONSTRAINT fk_medical_orders_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_medical_orders_performed_by FOREIGN KEY (performed_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await createMeasurementTables();
  // ფორმა 100: ბარათის ნომერი, გართულება, რეცეპტის რაოდენობა/ნომერი, ცნობის №, ხელმძღვანელის/ხელით ხელმოწერა
  await ensureColumn("patients", "card_number", "INT NULL");
  await ensureColumn("patients", "card_year", "SMALLINT NULL AFTER card_number");
  await ensureIndex("patients", "idx_patients_card", "card_year, card_number");
  await ensureColumn("encounter_diagnoses", "is_complication", "TINYINT(1) NOT NULL DEFAULT 0 AFTER is_primary");
  await ensureColumn("prescriptions", "quantity", "SMALLINT NULL AFTER note");
  await ensureColumn("prescriptions", "rx_number", "VARCHAR(50) NULL AFTER quantity");
  await ensureColumn("medical_documents", "doc_number", "VARCHAR(30) NULL AFTER sha256");
  await ensureEnum("document_signatures", "signer_role", ["doctor", "patient", "head"], "NOT NULL");
  await prisma.$executeRawUnsafe("ALTER TABLE document_signatures MODIFY COLUMN image_path VARCHAR(255) NULL");
  // ვიზიტის დასრულებისას დარიცხული ინვოისი (ერთი დანიშნულება — ერთხელ)
  await ensureColumn("medical_orders", "invoice_id", "INT NULL AFTER updated_at");
  await ensureIndex("medical_orders", "idx_medical_orders_invoice_id", "invoice_id");
  await ensureConstraint("medical_orders", "fk_medical_orders_invoice", "FOREIGN KEY (invoice_id) REFERENCES invoices (id)");
  // ვერსიები: previous_id UNIQUE — ერთ ვერსიას ერთი მომდევნო; ხელმოწერილი PDF — patient_documents-ში, sha256-ით
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS medical_documents (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      patient_id      INT          NOT NULL,
      encounter_id    INT          NULL,
      type            ENUM('visit_summary', 'certificate_100', 'prescription', 'referral', 'sick_leave', 'consent') NOT NULL,
      version         INT          NOT NULL DEFAULT 1,
      previous_id     INT          NULL,
      status          ENUM('draft', 'signed', 'superseded') NOT NULL DEFAULT 'draft',
      title           VARCHAR(255) NOT NULL,
      content         TEXT         NOT NULL,
      pdf_document_id INT          NULL,
      sha256          CHAR(64)     NULL,
      created_by      INT          NULL,
      created_at      DATETIME     NOT NULL,
      signed_at       DATETIME     NULL,
      UNIQUE INDEX uq_medical_documents_previous (previous_id),
      INDEX idx_medical_documents_patient (patient_id, created_at),
      INDEX idx_medical_documents_encounter_id (encounter_id),
      INDEX idx_medical_documents_pdf_document_id (pdf_document_id),
      INDEX idx_medical_documents_created_by (created_by),
      CONSTRAINT fk_medical_documents_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_medical_documents_encounter FOREIGN KEY (encounter_id) REFERENCES encounters (id),
      CONSTRAINT fk_medical_documents_previous FOREIGN KEY (previous_id) REFERENCES medical_documents (id),
      CONSTRAINT fk_medical_documents_pdf FOREIGN KEY (pdf_document_id) REFERENCES patient_documents (id),
      CONSTRAINT fk_medical_documents_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS document_signatures (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      document_id    INT          NOT NULL,
      signer_role    ENUM('doctor', 'patient') NOT NULL,
      signer_name    VARCHAR(201) NOT NULL,
      signer_user_id INT          NULL,
      image_path     VARCHAR(255) NOT NULL,
      device         VARCHAR(50)  NOT NULL,
      signed_at      DATETIME     NOT NULL,
      INDEX idx_document_signatures_document_id (document_id),
      INDEX idx_document_signatures_signer_user_id (signer_user_id),
      CONSTRAINT fk_document_signatures_document FOREIGN KEY (document_id) REFERENCES medical_documents (id),
      CONSTRAINT fk_document_signatures_user FOREIGN KEY (signer_user_id) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT          NOT NULL,
      type       VARCHAR(30)  NOT NULL,
      title      VARCHAR(200) NOT NULL,
      body       VARCHAR(500) NULL,
      link       VARCHAR(255) NULL,
      read_at    DATETIME     NULL,
      created_at DATETIME     NOT NULL,
      INDEX idx_notifications_user (user_id, read_at, created_at),
      CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
  // აუდიტი მხოლოდ ემატება; BIGINT — მილიონობით ჩანაწერისთვის
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id         BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT          NULL,
      action     VARCHAR(30)  NOT NULL,
      entity     VARCHAR(30)  NOT NULL,
      entity_id  INT          NULL,
      patient_id INT          NULL,
      details    VARCHAR(500) NULL,
      ip         VARCHAR(45)  NULL,
      created_at DATETIME     NOT NULL,
      INDEX idx_audit_log_patient (patient_id, created_at),
      INDEX idx_audit_log_user (user_id, created_at),
      INDEX idx_audit_log_created (created_at),
      CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_audit_log_patient FOREIGN KEY (patient_id) REFERENCES patients (id)
    ) ${TABLE_OPTIONS}
  `);
}

/**
 * შიდა ჩატი. შეტყობინება ფიზიკურად არ იშლება (deleted_at), ცვლილებები/წაშლა — message_revisions-ში.
 * BIGINT — მილიონობით შეტყობინებისთვის. წაუკითხავები ითვლება last_read_message_id-ით, ინდექსით (conversation_id, id).
 */
async function createChatTables() {
  // direct_key = "<მცირე id>:<დიდი id>" — ორ ადამიანს შორის ერთი პირადი საუბარი (ჯგუფში NULL, UNIQUE არ ზღუდავს)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS conversations (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      type            ENUM('direct', 'group') NOT NULL,
      name            VARCHAR(100) NULL,
      direct_key      VARCHAR(23)  NULL,
      created_by      INT          NULL,
      created_at      DATETIME     NOT NULL,
      last_message_id BIGINT       NULL,
      last_message_at DATETIME     NULL,
      UNIQUE INDEX uq_conversations_direct_key (direct_key),
      INDEX idx_conversations_created_by (created_by),
      CONSTRAINT fk_conversations_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // ჯგუფიდან გასვლა/წაშლა — ჩანაწერი იშლება (საუბარი აღარ ჩანს), შეტყობინებები რჩება
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id      INT        NOT NULL,
      user_id              INT        NOT NULL,
      role                 ENUM('owner', 'member') NOT NULL DEFAULT 'member',
      joined_at            DATETIME   NOT NULL,
      last_read_message_id BIGINT     NOT NULL DEFAULT 0,
      muted                TINYINT(1) NOT NULL DEFAULT 0,
      pinned               TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (conversation_id, user_id),
      INDEX idx_conversation_members_user (user_id),
      CONSTRAINT fk_conversation_members_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
      CONSTRAINT fk_conversation_members_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
  // „საუბრის წაშლა ჩემთვის“: ამ id-მდე შეტყობინებები მონაწილეს აღარ უჩანს (ბაზაში რჩება)
  await ensureColumn("conversation_members", "cleared_message_id", "BIGINT NOT NULL DEFAULT 0 AFTER last_read_message_id");
  // kind = system: ჯგუფის მოვლენა (event: created/renamed/member_added/member_removed/member_left, target_user_id)
  // client_id — კლიენტის UUID: ხელახლა გაგზავნა დუბლიკატს არ ქმნის
  // sender_id-ზე RESTRICT: შეტყობინებების ავტორი არ იშლება (მხოლოდ ითიშება)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS messages (
      id              BIGINT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT         NOT NULL,
      sender_id       INT         NOT NULL,
      kind            ENUM('text', 'system') NOT NULL DEFAULT 'text',
      body            TEXT        NULL,
      event           VARCHAR(30) NULL,
      target_user_id  INT         NULL,
      reply_to_id     BIGINT      NULL,
      client_id       CHAR(36)    NULL,
      created_at      DATETIME(3) NOT NULL,
      edited_at       DATETIME    NULL,
      deleted_at      DATETIME    NULL,
      INDEX idx_messages_conversation (conversation_id, id),
      INDEX idx_messages_sender (sender_id),
      INDEX idx_messages_reply_to (reply_to_id),
      INDEX idx_messages_target_user (target_user_id),
      UNIQUE INDEX uq_messages_client (sender_id, client_id),
      CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id),
      CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id),
      CONSTRAINT fk_messages_target_user FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_messages_reply_to FOREIGN KEY (reply_to_id) REFERENCES messages (id)
    ) ${TABLE_OPTIONS}
  `);
  // ტექსტის წინა ვერსია ყოველ რედაქტირებასა და წაშლაზე (მხოლოდ ემატება)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS message_revisions (
      id         BIGINT AUTO_INCREMENT PRIMARY KEY,
      message_id BIGINT   NOT NULL,
      action     ENUM('edit', 'delete') NOT NULL,
      old_body   TEXT     NULL,
      user_id    INT      NULL,
      created_at DATETIME NOT NULL,
      INDEX idx_message_revisions_message (message_id),
      INDEX idx_message_revisions_user (user_id),
      CONSTRAINT fk_message_revisions_message FOREIGN KEY (message_id) REFERENCES messages (id),
      CONSTRAINT fk_message_revisions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // ფაილი დისკზეა (DOCUMENTS_DIR/chat/...), აქ მხოლოდ მეტამონაცემები; width/height — სურათის preview-სთვის
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS message_attachments (
      id           BIGINT AUTO_INCREMENT PRIMARY KEY,
      message_id   BIGINT       NOT NULL,
      file_name    VARCHAR(255) NOT NULL,
      mime_type    VARCHAR(100) NOT NULL,
      size         INT          NOT NULL,
      storage_path VARCHAR(255) NOT NULL,
      width        SMALLINT     NULL,
      height       SMALLINT     NULL,
      INDEX idx_message_attachments_message (message_id),
      CONSTRAINT fk_message_attachments_message FOREIGN KEY (message_id) REFERENCES messages (id)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_favorites (
      user_id          INT      NOT NULL,
      favorite_user_id INT      NOT NULL,
      created_at       DATETIME NOT NULL,
      PRIMARY KEY (user_id, favorite_user_id),
      INDEX idx_user_favorites_favorite (favorite_user_id),
      CONSTRAINT chk_user_favorites_self CHECK (user_id <> favorite_user_id),
      CONSTRAINT fk_user_favorites_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT fk_user_favorites_favorite FOREIGN KEY (favorite_user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
  // მიმდინარე სტატუსი (აქტიური/არ არის კომპიუტერთან/გასულია) სოკეტის კავშირებიდან ითვლება მეხსიერებაში;
  // აქ ინახება ხელით დაყენებული („არ შემაწუხოთ“) და ბოლო აქტივობა/ყოფნის დრო
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_presence (
      user_id        INT      NOT NULL PRIMARY KEY,
      manual_status  ENUM('dnd') NULL,
      last_active_at DATETIME NULL,
      last_seen_at   DATETIME NULL,
      CONSTRAINT fk_user_presence_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_chat_settings (
      user_id               INT        NOT NULL PRIMARY KEY,
      sound_enabled         TINYINT(1) NOT NULL DEFAULT 1,
      notifications_enabled TINYINT(1) NOT NULL DEFAULT 1,
      CONSTRAINT fk_user_chat_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
}

/**
 * საწყობი (src/modules/inventory/). ნაშთი პარტიებშია (inventory_batches.quantity — ვადით, სერიით, ფასით);
 * ყოველი ცვლილება inventory_movements-ში იწერება (+ შემოსავალი, − გახარჯვა/ჩამოწერა) — არ იცვლება და არ იშლება.
 * რაოდენობები DECIMAL(12,2): ცალი, მლ, ამპულა...
 */
async function createInventoryTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_suppliers (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(200) NOT NULL,
      tax_id     VARCHAR(20)  NULL,
      phone      VARCHAR(50)  NULL,
      note       VARCHAR(500) NULL,
      is_active  TINYINT(1)   NOT NULL DEFAULT 1,
      created_at DATETIME     NOT NULL,
      UNIQUE INDEX uq_inventory_suppliers_name (name)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(200)  NOT NULL,
      category      ENUM('medication', 'consumable', 'reagent') NOT NULL,
      unit          VARCHAR(20)   NOT NULL,
      min_quantity  DECIMAL(12,2) NOT NULL DEFAULT 0,
      tracks_expiry TINYINT(1)    NOT NULL DEFAULT 1,
      note          VARCHAR(500)  NULL,
      is_active     TINYINT(1)    NOT NULL DEFAULT 1,
      created_at    DATETIME      NOT NULL,
      updated_at    DATETIME      NOT NULL,
      UNIQUE INDEX uq_inventory_items_name (name),
      INDEX idx_inventory_items_category (category, is_active),
      CONSTRAINT chk_inventory_items_min CHECK (min_quantity >= 0)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_receipts (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      supplier_id     INT          NULL,
      document_number VARCHAR(50)  NULL,
      received_on     DATE         NOT NULL,
      note            VARCHAR(500) NULL,
      created_by      INT          NULL,
      created_at      DATETIME     NOT NULL,
      INDEX idx_inventory_receipts_received (received_on),
      INDEX idx_inventory_receipts_supplier (supplier_id),
      INDEX idx_inventory_receipts_created_by (created_by),
      CONSTRAINT fk_inventory_receipts_supplier FOREIGN KEY (supplier_id) REFERENCES inventory_suppliers (id),
      CONSTRAINT fk_inventory_receipts_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id                INT AUTO_INCREMENT PRIMARY KEY,
      item_id           INT           NOT NULL,
      receipt_id        INT           NULL,
      lot_number        VARCHAR(50)   NULL,
      expiry_date       DATE          NULL,
      unit_cost         DECIMAL(12,2) NULL,
      received_quantity DECIMAL(12,2) NOT NULL,
      quantity          DECIMAL(12,2) NOT NULL,
      created_at        DATETIME      NOT NULL,
      INDEX idx_inventory_batches_item (item_id, expiry_date),
      INDEX idx_inventory_batches_expiry (expiry_date),
      INDEX idx_inventory_batches_receipt (receipt_id),
      CONSTRAINT chk_inventory_batches_quantity CHECK (quantity >= 0 AND received_quantity > 0),
      CONSTRAINT chk_inventory_batches_cost CHECK (unit_cost IS NULL OR unit_cost >= 0),
      CONSTRAINT fk_inventory_batches_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
      CONSTRAINT fk_inventory_batches_receipt FOREIGN KEY (receipt_id) REFERENCES inventory_receipts (id)
    ) ${TABLE_OPTIONS}
  `);
  // BIGINT — ყოველი გახარჯვა ჩანაწერია; patient_id / medical_order_id — პროცედურისას გახარჯვა (ეტაპი 2)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id               BIGINT AUTO_INCREMENT PRIMARY KEY,
      item_id          INT           NOT NULL,
      batch_id         INT           NOT NULL,
      type             ENUM('receipt', 'consumption', 'writeoff', 'adjustment') NOT NULL,
      quantity         DECIMAL(12,2) NOT NULL,
      reason           ENUM('expired', 'damaged', 'lost', 'other') NULL,
      note             VARCHAR(500)  NULL,
      receipt_id       INT           NULL,
      patient_id       INT           NULL,
      medical_order_id INT           NULL,
      created_by       INT           NULL,
      created_at       DATETIME      NOT NULL,
      INDEX idx_inventory_movements_item (item_id, created_at),
      INDEX idx_inventory_movements_created (created_at),
      INDEX idx_inventory_movements_batch (batch_id),
      INDEX idx_inventory_movements_receipt (receipt_id),
      INDEX idx_inventory_movements_patient (patient_id),
      INDEX idx_inventory_movements_order (medical_order_id),
      INDEX idx_inventory_movements_created_by (created_by),
      CONSTRAINT chk_inventory_movements_quantity CHECK (quantity <> 0),
      CONSTRAINT fk_inventory_movements_item FOREIGN KEY (item_id) REFERENCES inventory_items (id),
      CONSTRAINT fk_inventory_movements_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches (id),
      CONSTRAINT fk_inventory_movements_receipt FOREIGN KEY (receipt_id) REFERENCES inventory_receipts (id),
      CONSTRAINT fk_inventory_movements_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_inventory_movements_order FOREIGN KEY (medical_order_id) REFERENCES medical_orders (id),
      CONSTRAINT fk_inventory_movements_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // სერვისის ნორმა: რა მასალა იხარჯება ერთ შესრულებაზე (ექთანი/ლაბორანტი შესრულებისას ხედავს და ასწორებს)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS service_materials (
      service_id INT           NOT NULL,
      item_id    INT           NOT NULL,
      quantity   DECIMAL(12,2) NOT NULL,
      PRIMARY KEY (service_id, item_id),
      INDEX idx_service_materials_item (item_id),
      CONSTRAINT chk_service_materials_quantity CHECK (quantity > 0),
      CONSTRAINT fk_service_materials_service FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE,
      CONSTRAINT fk_service_materials_item FOREIGN KEY (item_id) REFERENCES inventory_items (id)
    ) ${TABLE_OPTIONS}
  `);
}

/**
 * შესვლის დაცვა (src/lib/login-guard.ts): ყოველი მცდელობა — მომხმარებლის სახელით და IP-ით. kind: failed — არასწორი
 * მონაცემები, blocked — დაბლოკვის დროს ცდა (ბლოკს არ აგრძელებს), success, unlock — ადმინმა განბლოკა (ათვლა თავიდან).
 * users.session_version — პაროლის შეცვლისას იზრდება: ძველი სესიები (სხვა კომპიუტერებზე) მაშინვე წყდება.
 */
async function createSecurityTables() {
  await ensureColumn("users", "session_version", "INT NOT NULL DEFAULT 0 AFTER is_active");
  await ensureColumn("users", "password_changed_at", "DATETIME NULL AFTER session_version");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id         BIGINT AUTO_INCREMENT PRIMARY KEY,
      username   VARCHAR(50) NOT NULL,
      ip         VARCHAR(45) NULL,
      kind       ENUM('failed', 'blocked', 'success', 'unlock') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      INDEX idx_login_attempts_username (username, created_at),
      INDEX idx_login_attempts_ip (ip, created_at),
      INDEX idx_login_attempts_created (created_at)
    ) ${TABLE_OPTIONS}
  `);
}

async function createPermissionTables() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS permissions (
      id   INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50)  NOT NULL,
      name VARCHAR(100) NOT NULL,
      UNIQUE INDEX uq_permissions_code (code)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id       INT NOT NULL,
      permission_id INT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      INDEX idx_role_permissions_permission_id (permission_id),
      CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
      CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
}

/**
 * უფლებები: ახალი უფლება ემატება და ნაგულისხმევ როლებს ენიჭება (DEFAULT_ROLE_PERMISSIONS).
 * უკვე არსებული უფლების მინიჭებას არ ვცვლით — ადმინის პანელიდან შეცვლილი რჩება.
 */
async function seedPermissions() {
  let added = 0;
  for (const [code, name] of Object.entries(PERMISSIONS)) {
    const exists = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
    if (exists) {
      await prisma.permission.update({ where: { code }, data: { name } });
      continue;
    }
    const permission = await prisma.permission.create({ data: { code, name } });
    added++;
    const roles = Object.entries(DEFAULT_ROLE_PERMISSIONS)
      .filter(([, codes]) => (codes as string[]).includes(code))
      .map(([role]) => role);
    for (const role of await prisma.role.findMany({ where: { code: { in: roles } }, select: { id: true } })) {
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
  }
  console.log(`✔ უფლებები: ${Object.keys(PERMISSIONS).length}${added ? ` (ახალი: ${added}, მიენიჭა ნაგულისხმევ როლებს)` : ""}`);
}

/** კლინიკის რეკვიზიტები ქვითრისთვის: იწერება მხოლოდ არარსებული გასაღები (შეცვლილი რჩება). */
async function seedSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.$executeRaw`INSERT IGNORE INTO settings (\`key\`, value) VALUES (${key}, ${value})`;
  }
}

/**
 * ძველი ვიზიტები → ინვოისები (ერთხელ: legacy_visit_id/legacy_payment_id UNIQUE-ია, უკვე გადატანილი გამოტოვდება).
 * ვიზიტი → ინვოისი (დაზღვევის გარეშე), სერვისები → ხაზები, გადახდები → გადახდები ქვითრის ნომრებით.
 */
async function migrateLegacyVisits() {
  const pending = await prisma.$queryRaw<{ id: number }[]>`
    SELECT v.id FROM visits v
    WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.legacy_visit_id = v.id)
    ORDER BY v.created_at, v.id
  `;
  for (const { id } of pending) {
    await prisma.$transaction((tx) => migrateLegacyVisit(tx, Number(id)), { timeout: 30_000 });
  }
  if (pending.length) console.log(`✔ ძველი ვიზიტები გადავიდა ინვოისებში: ${pending.length}`);
}

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS roles (
      id   INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(50) NOT NULL
    ) ${TABLE_OPTIONS}
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(50)  NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      first_name    VARCHAR(100) NOT NULL,
      last_name     VARCHAR(100) NOT NULL,
      role_id       INT          NOT NULL,
      is_active     TINYINT(1)   NOT NULL DEFAULT 1,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_users_role_id (role_id),
      CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
    ) ${TABLE_OPTIONS}
  `);
  // personal_id-ზე UNIQUE ინდექსი: ძებნა მილიონობით ჩანაწერში ინდექსით ხდება
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS patients (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      personal_id    CHAR(11)     NOT NULL,
      first_name     VARCHAR(100) NOT NULL,
      last_name      VARCHAR(100) NOT NULL,
      father_name    VARCHAR(100) NULL,
      first_name_en  VARCHAR(100) NOT NULL,
      last_name_en   VARCHAR(100) NOT NULL,
      birth_date     DATE         NOT NULL,
      gender         ENUM('male', 'female') NOT NULL,
      marital_status ENUM('married', 'single', 'divorced', 'widowed') NULL,
      phone          VARCHAR(30)  NULL,
      email          VARCHAR(255) NULL,
      country        VARCHAR(100) NULL DEFAULT 'საქართველო',
      city           VARCHAR(100) NULL,
      actual_address VARCHAR(255) NULL,
      legal_address  VARCHAR(255) NULL,
      workplace      VARCHAR(255) NULL,
      position       VARCHAR(255) NULL,
      education      VARCHAR(255) NULL,
      comment        TEXT         NULL,
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by     INT          NULL,
      updated_by     INT          NULL,
      UNIQUE INDEX uq_patients_personal_id (personal_id),
      INDEX idx_patients_created_by (created_by),
      INDEX idx_patients_updated_by (updated_by),
      CONSTRAINT fk_patients_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_patients_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);

  // სახელით/გვარით ძებნის ინდექსები (არსებულ ცხრილსაც ემატება)
  await ensureIndex("patients", "idx_patients_name", "last_name, first_name");
  await ensureIndex("patients", "idx_patients_first_name", "first_name");
  await ensureIndex("patients", "idx_patients_name_en", "last_name_en, first_name_en");
  await ensureIndex("patients", "idx_patients_first_name_en", "first_name_en");

  // ფაილი თვითონ დისკზეა (DOCUMENTS_DIR), აქ მხოლოდ მეტამონაცემები
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS patient_documents (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      patient_id    INT          NOT NULL,
      doc_type      ENUM('id_card', 'passport', 'insurance', 'other') NOT NULL,
      title         VARCHAR(255) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      storage_path  VARCHAR(255) NOT NULL,
      mime_type     VARCHAR(100) NOT NULL,
      size_bytes    INT          NOT NULL,
      uploaded_by   INT          NULL,
      uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_patient_documents_patient_id (patient_id),
      INDEX idx_patient_documents_uploaded_by (uploaded_by),
      CONSTRAINT fk_patient_documents_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_patient_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id   INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      UNIQUE INDEX uq_service_categories_name (name)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS services (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      code        VARCHAR(30)   NULL,
      name        VARCHAR(255)  NOT NULL,
      category_id INT           NULL,
      price       DECIMAL(12,2) NOT NULL,
      is_active   TINYINT(1)    NOT NULL DEFAULT 1,
      created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_services_code (code),
      UNIQUE INDEX uq_services_name (name)
    ) ${TABLE_OPTIONS}
  `);
  // ICD-10 კოდი, არასავალდებულო (ძველ ცხრილსაც ემატება).
  // უნიკალური არ არის — ერთი კოდი ბევრ სერვისს შეიძლება ჰქონდეს (ადრე უნიკალური იყო, ის შეზღუდვა იშლება).
  await ensureColumn("services", "code", "VARCHAR(30) NULL AFTER id");
  await dropIndexIfExists("services", "uq_services_code");
  await ensureIndex("services", "idx_services_code", "code");
  // ფინანსები: კატეგორია, დეაქტივაცია (სერვისი აღარ იშლება), ფასი DECIMAL(12,2)
  await ensureColumn("services", "category_id", "INT NULL AFTER name");
  await ensureColumn("services", "is_active", "TINYINT(1) NOT NULL DEFAULT 1 AFTER price");
  await ensureDecimalPrecision("services", "price", 12, "DECIMAL(12,2) NOT NULL");
  await ensureIndex("services", "idx_services_category", "category_id, is_active");
  await ensureConstraint("services", "fk_services_category", "FOREIGN KEY (category_id) REFERENCES service_categories (id)");
  // კატეგორიის გარეშე დარჩენილი (ძველი) სერვისები → „სხვა“
  const uncategorized = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM services WHERE category_id IS NULL`;
  if (Number(uncategorized[0].n) > 0) {
    await prisma.$executeRaw`INSERT IGNORE INTO service_categories (name) VALUES (${OTHER_CATEGORY})`;
    const moved = await prisma.$executeRaw`
      UPDATE services SET category_id = (SELECT id FROM service_categories WHERE name = ${OTHER_CATEGORY}) WHERE category_id IS NULL
    `;
    console.log(`✔ კატეგორიის გარეშე სერვისები → „${OTHER_CATEGORY}“: ${moved}`);
  }
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS service_price_history (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      service_id INT           NOT NULL,
      old_price  DECIMAL(12,2) NOT NULL,
      new_price  DECIMAL(12,2) NOT NULL,
      changed_by INT           NULL,
      changed_at DATETIME      NOT NULL,
      INDEX idx_service_price_history_service (service_id, changed_at),
      INDEX idx_service_price_history_changed_by (changed_by),
      CONSTRAINT fk_service_price_history_service FOREIGN KEY (service_id) REFERENCES services (id),
      CONSTRAINT fk_service_price_history_changed_by FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);

  // ძველი „პაციენტის მიღება“ (visits): ჩანაცვლდა ინვოისებით. ცხრილები რჩება არქივად და მონაცემები ქვემოთ
  // ინვოისებში გადადის (migrateLegacyVisits). ახალ ბაზაზე ეს ცხრილები აღარ იქმნება.
  const hasLegacyVisits = await tableExists("visits");
  if (hasLegacyVisits) await upgradeLegacyVisits();

  // ტელეფონით ძებნა: ნომერი მხოლოდ ციფრებით ("+995 555 12-34-56" → "555123456").
  // გენერირებულ სვეტს ბაზა თვითონ ავსებს (არსებულ ჩანაწერებსაც), ძებნა ინდექსით, სიტყვის დასაწყისით ხდება.
  await ensureColumn(
    "patients",
    "phone_digits",
    `VARCHAR(30) GENERATED ALWAYS AS (${PHONE_DIGITS_EXPRESSION}) STORED AFTER phone`,
  );
  await ensureIndex("patients", "idx_patients_phone_digits", "phone_digits");

  // ჯავშნები: სპეციალობები → ექიმები (users-ის პროფილი) → გრაფიკი → ჯავშნები
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS specialties (
      id   INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      UNIQUE INDEX uq_specialties_name (name)
    ) ${TABLE_OPTIONS}
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS doctors (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      user_id        INT         NOT NULL,
      specialty_id   INT         NOT NULL,
      visit_duration SMALLINT    NOT NULL DEFAULT 30,
      room           VARCHAR(20) NULL,
      is_active      TINYINT(1)  NOT NULL DEFAULT 1,
      UNIQUE INDEX uq_doctors_user_id (user_id),
      INDEX idx_doctors_specialty (specialty_id, is_active),
      CONSTRAINT chk_doctors_visit_duration CHECK (visit_duration BETWEEN 5 AND 240),
      CONSTRAINT fk_doctors_user FOREIGN KEY (user_id) REFERENCES users (id),
      CONSTRAINT fk_doctors_specialty FOREIGN KEY (specialty_id) REFERENCES specialties (id)
    ) ${TABLE_OPTIONS}
  `);
  // დრო თბილისის დროით; weekday: 1 — ორშაბათი ... 7 — კვირა
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS doctor_schedules (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id  INT     NOT NULL,
      weekday    TINYINT NOT NULL,
      start_time TIME    NOT NULL,
      end_time   TIME    NOT NULL,
      INDEX idx_doctor_schedules_doctor (doctor_id, weekday),
      CONSTRAINT chk_doctor_schedules_weekday CHECK (weekday BETWEEN 1 AND 7),
      CONSTRAINT chk_doctor_schedules_time CHECK (end_time > start_time),
      CONSTRAINT fk_doctor_schedules_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE
    ) ${TABLE_OPTIONS}
  `);
  // start_time/end_time — UTC (ისევე როგორც visits.visit_at); ორმაგი ჯავშნის შემოწმება აპლიკაციაში, ტრანზაქციით
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS appointments (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      patient_id    INT           NOT NULL,
      doctor_id     INT           NOT NULL,
      start_time    DATETIME      NOT NULL,
      end_time      DATETIME      NOT NULL,
      status        ENUM('booked', 'arrived', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'booked',
      comment       VARCHAR(1000) NULL,
      cancel_reason VARCHAR(500)  NULL,
      cancelled_by  INT           NULL,
      cancelled_at  DATETIME      NULL,
      created_by    INT           NULL,
      created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by    INT           NULL,
      updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_appointments_doctor_start (doctor_id, start_time),
      INDEX idx_appointments_patient (patient_id, start_time),
      INDEX idx_appointments_start (start_time),
      INDEX idx_appointments_created_by (created_by),
      INDEX idx_appointments_updated_by (updated_by),
      INDEX idx_appointments_cancelled_by (cancelled_by),
      CONSTRAINT chk_appointments_time CHECK (end_time > start_time),
      CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
      CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id) REFERENCES doctors (id),
      CONSTRAINT fk_appointments_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_appointments_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT fk_appointments_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL
    ) ${TABLE_OPTIONS}
  `);
  // ექიმის კონსულტაციის სერვისი: ჯავშნიდან ინვოისში ავტომატურად ჩაჯდება
  await ensureColumn("doctors", "consultation_service_id", "INT NULL");
  await ensureIndex("doctors", "idx_doctors_consultation_service_id", "consultation_service_id");
  await ensureConstraint(
    "doctors",
    "fk_doctors_consultation_service",
    "FOREIGN KEY (consultation_service_id) REFERENCES services (id) ON DELETE SET NULL",
  );

  await createFinanceTables();
  await createEmrTables();
  await createPermissionTables();
  await createChatTables();
  await createInventoryTables();
  await createSecurityTables();
  console.log("✔ ცხრილები მზადაა");

  if (hasLegacyVisits) await migrateLegacyVisits();
  await seedSettings();

  for (const [code, name] of Object.entries(SYSTEM_ROLES)) {
    // არსებულ როლს სახელს არ ვუცვლით — ადმინს შეიძლება გადაერქმია პანელიდან
    await prisma.$executeRaw`
      INSERT INTO roles (code, name) VALUES (${code}, ${name})
      ON DUPLICATE KEY UPDATE code = code
    `;
  }
  console.log(`✔ როლები: ${Object.keys(SYSTEM_ROLES).length}`);
  await seedPermissions();

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  for (const u of TEST_USERS) {
    // არსებულ მომხმარებელს პაროლს არ ვუცვლით, მხოლოდ სახელს/როლს ვაახლებთ
    await prisma.$executeRaw`
      INSERT INTO users (username, password_hash, first_name, last_name, role_id)
      VALUES (${u.username}, ${passwordHash}, ${u.firstName}, ${u.lastName},
              (SELECT id FROM roles WHERE code = ${u.role}))
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name  = VALUES(last_name),
        role_id    = VALUES(role_id)
    `;
  }

  const users = await prisma.user.findMany({ include: { role: true }, orderBy: { id: "asc" } });
  console.log(`✔ მომხმარებლები (სატესტო პაროლი: ${TEST_PASSWORD}):`);
  console.table(
    users.map((u) => ({
      username: u.username,
      სახელი: u.firstName,
      გვარი: u.lastName,
      როლი: `${u.role.code} (${u.role.name})`,
      აქტიური: u.isActive ? "კი" : "არა",
    })),
  );
}

main()
  .catch((err) => {
    console.error("✖ ბაზის მომზადება ვერ მოხერხდა:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
