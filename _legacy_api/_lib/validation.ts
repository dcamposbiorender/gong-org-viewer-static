/**
 * Shared validation utilities for API endpoints.
 * Returns discriminated union — no more non-null assertions.
 */

export const VALID_ACCOUNTS = [
  'abbvie',
  'astrazeneca',
  'gsk',
  'lilly',
  'novartis',
  'regeneron',
  'roche',
] as const;

export type ValidAccount = (typeof VALID_ACCOUNTS)[number];

export function isValidAccount(account: string): account is ValidAccount {
  return VALID_ACCOUNTS.includes(account.toLowerCase() as ValidAccount);
}

export type ValidationResult =
  | { isValid: true; account: ValidAccount }
  | { isValid: false; error: string };

export function validateAccount(account: string | string[] | undefined): ValidationResult {
  if (!account || typeof account !== 'string') {
    return { isValid: false, error: 'account parameter required' };
  }

  const normalized = account.toLowerCase();

  if (!isValidAccount(normalized)) {
    return {
      isValid: false,
      error: `Invalid account: ${account}. Must be one of: ${VALID_ACCOUNTS.join(', ')}`,
    };
  }

  return { isValid: true, account: normalized };
}
