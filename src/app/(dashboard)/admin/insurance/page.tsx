import type { Metadata } from "next";
import { requirePermission } from "@/lib/dal";
import { InsuranceManager } from "@/modules/finance/components/admin/insurance-manager";
import { loadInsuranceAdmin } from "@/modules/finance/server/insurance";

export const instant = false;

export const metadata: Metadata = { title: "დაზღვევა" };

export default async function InsurancePage() {
  await requirePermission("insurance.manage");
  const { companies, services, categories } = await loadInsuranceAdmin();

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">სადაზღვევო კომპანიები</h1>
        <p className="text-sm text-muted-foreground">
          პირობა: დაფარვის პროცენტი და ლიმიტი სერვისზე ან კატეგორიაზე. პირობის ცვლილება მხოლოდ ახალ ინვოისებზე მოქმედებს. პაციენტის
          პოლისი ემატება პაციენტის ბარათზე („დაზღვევა“).
        </p>
      </div>
      <InsuranceManager companies={companies} services={services} categories={categories} />
    </section>
  );
}
