import { VALID_ACCOUNTS, type ValidAccount } from "@/lib/types";

export type ValidationResult =
  | { isValid: true; account: ValidAccount }
  | { isValid: false; error: string };

export function validateAccount(
  account: string | null | undefined
): ValidationResult {
  if (!account || typeof account !== "string") {
    return { isValid: false, error: "account parameter required" };
  }

  const normalized = account.toLowerCase();

  if (!VALID_ACCOUNTS.includes(normalized as ValidAccount)) {
    return {
      isValid: false,
      error: `Invalid account: ${account}. Must be one of: ${VALID_ACCOUNTS.join(", ")}`,
    };
  }

  return { isValid: true, account: normalized as ValidAccount };
}
