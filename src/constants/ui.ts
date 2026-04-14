import type { ConnectFormValues, RiskLevel } from "../types";

export const RISK_COLORS: Record<RiskLevel, string> = {
  high: "#b54a2a",
  medium: "#df8e2f",
  low: "#2e7d5b",
};

export const DEFAULT_FORM: ConnectFormValues = {
  profileName: "",
  baseUrl: "",
  token: "",
  username: "",
  password: "",
  saveProfile: true,
};
