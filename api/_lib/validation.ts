/**
 * Shared validation utilities for API endpoints.
 *
 * Provides account whitelist validation to prevent unauthorized access.
 */

/**
 * Valid account names that the API can process.
 * This list should match the COMPANIES list in scripts/config.py.
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

/**
 * Check if an account name is valid.
 *
 * @param account - The account name to validate
 * @returns True if the account is in the whitelist
 */
export function isValidAccount(account: string): account is ValidAccount {
  return VALID_ACCOUNTS.includes(account.toLowerCase() as ValidAccount);
}

/**
 * Validate account parameter from request query.
 *
 * @param account - The account parameter from req.query
 * @returns Object with isValid boolean and normalized account string or error message
 */
export function validateAccount(account: string | string[] | undefined): {
  isValid: boolean;
  account?: string;
  error?: string;
} {
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
