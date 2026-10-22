/**
 * კლინიკის რეკვიზიტები ქვითრისთვის (settings ცხრილი, key → value). ადმინი ცვლის: /admin/settings.
 * db:setup წერს მხოლოდ არარსებულ გასაღებებს.
 */
export const DEFAULT_SETTINGS = {
  clinic_name: "კლინიკა",
  clinic_legal_name: "",
  clinic_tax_id: "",
  clinic_address: "",
  clinic_phone: "",
  receipt_footer: "გმადლობთ, გისურვებთ ჯანმრთელობას!",
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type ClinicSettings = Record<SettingKey, string>;

export const SETTING_LABELS: Record<SettingKey, string> = {
  clinic_name: "კლინიკის დასახელება",
  clinic_legal_name: "იურიდიული დასახელება",
  clinic_tax_id: "საიდენტიფიკაციო კოდი",
  clinic_address: "მისამართი",
  clinic_phone: "ტელეფონი",
  receipt_footer: "ქვითრის ბოლო ტექსტი",
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingKey[];
