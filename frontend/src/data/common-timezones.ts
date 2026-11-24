/** Common IANA time zones for workspace scheduling defaults. */
export const COMMON_TIMEZONES = [
  { id: "UTC", label: "UTC" },
  { id: "America/New_York", label: "Eastern Time (US & Canada)" },
  { id: "America/Chicago", label: "Central Time (US & Canada)" },
  { id: "America/Denver", label: "Mountain Time (US & Canada)" },
  { id: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { id: "America/Sao_Paulo", label: "São Paulo" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Paris", label: "Paris" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "Europe/Amsterdam", label: "Amsterdam" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Kolkata", label: "India (IST)" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Asia/Seoul", label: "Seoul" },
  { id: "Australia/Sydney", label: "Sydney" },
  { id: "Pacific/Auckland", label: "Auckland" }
] as const;
