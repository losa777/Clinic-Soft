/**
 * ჯავშნების სატესტო მონაცემები: სპეციალობები, ექიმები (მომხმარებლები როლით „ექიმი“) გრაფიკით, 20 პაციენტი.
 * იდემპოტენტურია — განმეორებით გაშვებისას არსებული ჩანაწერები ახლდება, დუბლიკატი არ იქმნება.
 * ცხრილები ჯერ უნდა შეიქმნას: npm run db:setup. გაშვება: npm run db:seed
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { transliterate } from "@/lib/transliterate";

const TEST_PASSWORD = "Test1234!";

const SPECIALTIES = ["თერაპევტი", "კარდიოლოგი", "პედიატრი", "ნევროლოგი", "ენდოკრინოლოგი"];

type Hours = [string, string];

/** weekday: 1 — ორშაბათი ... 7 — კვირა; დრო თბილისის დროით. */
const DOCTORS: {
  username: string;
  firstName: string;
  lastName: string;
  specialty: string;
  duration: number;
  room: string;
  schedule: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, Hours[]>>;
}[] = [
  {
    // setup-db.ts-ის სატესტო ექიმი
    username: "doctor",
    firstName: "დავით",
    lastName: "მაისურაძე",
    specialty: "თერაპევტი",
    duration: 30,
    room: "101",
    schedule: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [["09:00", "13:00"], ["14:00", "18:00"]]])),
  },
  {
    username: "dr.kharaishvili",
    firstName: "ეკა",
    lastName: "ხარაიშვილი",
    specialty: "თერაპევტი",
    duration: 20,
    room: "102",
    schedule: { 1: [["10:00", "16:00"]], 3: [["10:00", "16:00"]], 5: [["10:00", "16:00"]], 6: [["10:00", "14:00"]] },
  },
  {
    username: "dr.tsiklauri",
    firstName: "ზურაბ",
    lastName: "წიკლაური",
    specialty: "კარდიოლოგი",
    duration: 30,
    room: "201",
    schedule: { 2: [["09:00", "15:00"]], 4: [["09:00", "15:00"]], 6: [["10:00", "13:00"]] },
  },
  {
    username: "dr.bakradze",
    firstName: "ნათია",
    lastName: "ბაქრაძე",
    specialty: "პედიატრი",
    duration: 20,
    room: "105",
    schedule: Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, [["09:00", "14:00"]]])),
  },
  {
    username: "dr.nadiradze",
    firstName: "გოგი",
    lastName: "ნადირაძე",
    specialty: "ნევროლოგი",
    duration: 40,
    room: "204",
    schedule: { 1: [["12:00", "18:00"]], 3: [["12:00", "18:00"]], 5: [["09:00", "13:00"]] },
  },
  {
    username: "dr.kavtaradze",
    firstName: "სოფო",
    lastName: "ქავთარაძე",
    specialty: "ენდოკრინოლოგი",
    duration: 30,
    room: "207",
    schedule: { 2: [["10:00", "15:00"]], 4: [["10:00", "15:00"]], 6: [["10:00", "14:00"]] },
  },
];

const PATIENTS: [firstName: string, lastName: string, gender: "male" | "female", birthDate: string, phone: string][] = [
  ["ნინო", "ბერიძე", "female", "1985-03-12", "555 10 20 01"],
  ["გიორგი", "კაპანაძე", "male", "1978-07-25", "555 10 20 02"],
  ["მარიამ", "ლომიძე", "female", "1992-11-03", "555 10 20 03"],
  ["ლევან", "გელაშვილი", "male", "1965-01-30", "555 10 20 04"],
  ["თამარ", "ჯავახიშვილი", "female", "2001-05-17", "555 10 20 05"],
  ["ირაკლი", "წერეთელი", "male", "1989-09-09", "555 10 20 06"],
  ["ანა", "მაჭავარიანი", "female", "2015-02-14", "555 10 20 07"],
  ["დავით", "ჩხეიძე", "male", "1972-12-01", "555 10 20 08"],
  ["ეკატერინე", "ღლონტი", "female", "1958-06-21", "555 10 20 09"],
  ["ნიკოლოზ", "ქუთათელაძე", "male", "2018-08-08", "555 10 20 10"],
  ["სალომე", "ხუციშვილი", "female", "1995-04-04", "555 10 20 11"],
  ["ალექსანდრე", "შენგელია", "male", "1983-10-10", "555 10 20 12"],
  ["ქეთევან", "ცინცაძე", "female", "1976-03-28", "555 10 20 13"],
  ["ზვიად", "მეტრეველი", "male", "1969-07-07", "555 10 20 14"],
  ["ლიკა", "ფანცულაია", "female", "2010-12-25", "555 10 20 15"],
  ["თორნიკე", "ბოლქვაძე", "male", "1998-01-19", "555 10 20 16"],
  ["ნათელა", "კვარაცხელია", "female", "1950-09-30", "555 10 20 17"],
  ["ბექა", "ჯანელიძე", "male", "1990-05-05", "555 10 20 18"],
  ["მაკა", "დოლიძე", "female", "1987-02-22", "555 10 20 19"],
  ["საბა", "ხვედელიძე", "male", "2012-06-15", "555 10 20 20"],
];

/** სატესტო პირადი ნომერი: 01099000001 ... (11 ციფრი, უნიკალური). */
const personalIdOf = (i: number) => `010990000${String(i + 1).padStart(2, "0")}`;

/** "09:30" → TIME სვეტის მნიშვნელობა Prisma-სთვის (1970-01-01, UTC). */
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

async function main() {
  for (const name of SPECIALTIES) {
    await prisma.specialty.upsert({ where: { name }, create: { name }, update: {} });
  }
  const specialties = new Map((await prisma.specialty.findMany()).map((s) => [s.name, s.id]));
  console.log(`✔ სპეციალობები: ${SPECIALTIES.length}`);

  const doctorRole = await prisma.role.findUnique({ where: { code: "doctor" } });
  if (!doctorRole) throw new Error("როლი „doctor“ ვერ მოიძებნა — ჯერ გაუშვით npm run db:setup");
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  for (const d of DOCTORS) {
    // არსებულ მომხმარებელს პაროლს არ ვუცვლით
    const user = await prisma.user.upsert({
      where: { username: d.username },
      create: { username: d.username, passwordHash, firstName: d.firstName, lastName: d.lastName, roleId: doctorRole.id },
      update: { firstName: d.firstName, lastName: d.lastName, roleId: doctorRole.id },
    });
    const profile = { specialtyId: specialties.get(d.specialty)!, visitDuration: d.duration, room: d.room, isActive: true };
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...profile },
      update: profile,
    });
    // გრაფიკი მთლიანად იცვლება სკრიპტის მიხედვით
    await prisma.$transaction([
      prisma.doctorSchedule.deleteMany({ where: { doctorId: doctor.id } }),
      prisma.doctorSchedule.createMany({
        data: Object.entries(d.schedule).flatMap(([weekday, hours]) =>
          hours.map(([start, end]) => ({ doctorId: doctor.id, weekday: Number(weekday), startTime: time(start), endTime: time(end) })),
        ),
      }),
    ]);
  }
  console.log(`✔ ექიმები გრაფიკით: ${DOCTORS.length} (სატესტო პაროლი: ${TEST_PASSWORD})`);

  for (const [i, [firstName, lastName, gender, birthDate, phone]] of PATIENTS.entries()) {
    const data = {
      firstName,
      lastName,
      firstNameEn: transliterate(firstName),
      lastNameEn: transliterate(lastName),
      gender,
      birthDate: new Date(`${birthDate}T00:00:00Z`),
      phone,
      country: "საქართველო",
      city: "თბილისი",
      actualAddress: `ჭავჭავაძის გამზ. ${i + 1}`,
    };
    await prisma.patient.upsert({ where: { personalId: personalIdOf(i) }, create: { personalId: personalIdOf(i), ...data }, update: {} });
  }
  console.log(`✔ სატესტო პაციენტები: ${PATIENTS.length} (პირადი ნომრები ${personalIdOf(0)} — ${personalIdOf(PATIENTS.length - 1)})`);

  const doctors = await prisma.doctor.findMany({
    include: { user: true, specialty: true, schedules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] } },
    orderBy: { id: "asc" },
  });
  const weekdays = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];
  console.table(
    doctors.map((d) => ({
      username: d.user.username,
      ექიმი: `${d.user.firstName} ${d.user.lastName}`,
      სპეციალობა: d.specialty.name,
      წუთი: d.visitDuration,
      კაბინეტი: d.room ?? "",
      გრაფიკი: d.schedules
        .map((s) => `${weekdays[s.weekday - 1]} ${s.startTime.toISOString().slice(11, 16)}–${s.endTime.toISOString().slice(11, 16)}`)
        .join(", "),
    })),
  );
}

main()
  .catch((err) => {
    console.error("✖ სატესტო მონაცემების ჩაწერა ვერ მოხერხდა:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
