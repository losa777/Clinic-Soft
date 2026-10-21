/**
 * ბაზის მომზადება: ცხრილები, როლები, სატესტო მომხმარებლები.
 * იდემპოტენტურია — შეიძლება გაეშვას რამდენჯერაც გინდათ.
 * გაშვება: npm run db:setup
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { SYSTEM_ROLES, type SystemRoleCode } from "@/lib/roles";

const TEST_PASSWORD = "Test1234!";

const TEST_USERS: { username: string; firstName: string; lastName: string; role: SystemRoleCode }[] = [
  { username: "admin", firstName: "გიორგი", lastName: "ბერიძე", role: "admin" },
  { username: "registrar", firstName: "ნინო", lastName: "კაპანაძე", role: "registrar" },
  { username: "doctor", firstName: "დავით", lastName: "მაისურაძე", role: "doctor" },
  { username: "nurse", firstName: "მარიამ", lastName: "გელაშვილი", role: "nurse" },
  { username: "lab", firstName: "ლევან", lastName: "ჯავახიშვილი", role: "lab" },
  { username: "accountant", firstName: "თამარ", lastName: "ლომიძე", role: "accountant" },
  { username: "director", firstName: "ირაკლი", lastName: "წერეთელი", role: "director" },
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
    CREATE TABLE IF NOT EXISTS services (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      code       VARCHAR(30)   NULL,
      name       VARCHAR(255)  NOT NULL,
      price      DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_services_code (code),
      UNIQUE INDEX uq_services_name (name)
    ) ${TABLE_OPTIONS}
  `);
  // ICD-10 კოდი, არასავალდებულო (ძველ ცხრილსაც ემატება).
  // უნიკალური არ არის — ერთი კოდი ბევრ სერვისს შეიძლება ჰქონდეს (ადრე უნიკალური იყო, ის შეზღუდვა იშლება).
  await ensureColumn("services", "code", "VARCHAR(30) NULL AFTER id");
  await dropIndexIfExists("services", "uq_services_code");
  await ensureIndex("services", "idx_services_code", "code");
  // ექიმის სახელი და სერვისის დასახელება/ფასი ინახება მიღების მომენტისთვის — ისტორია არ იცვლება
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
  console.log("✔ ცხრილები მზადაა (roles, users, patients, patient_documents, services, visits, visit_services, visit_payments)");

  for (const [code, name] of Object.entries(SYSTEM_ROLES)) {
    // არსებულ როლს სახელს არ ვუცვლით — ადმინს შეიძლება გადაერქმია პანელიდან
    await prisma.$executeRaw`
      INSERT INTO roles (code, name) VALUES (${code}, ${name})
      ON DUPLICATE KEY UPDATE code = code
    `;
  }
  console.log(`✔ როლები: ${Object.keys(SYSTEM_ROLES).length}`);

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
