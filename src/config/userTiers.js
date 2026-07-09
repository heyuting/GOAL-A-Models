/**
 * User access tiers control per-run location limits (SCEPTER / DRN).
 *
 * Resolution order (highest wins):
 * 1. VITE_MANAGER_EMAILS — unlimited (Manager)
 * 2. VITE_DEVELOPER_EMAILS — unlimited (Developer)
 * 3. VITE_ELEVATED_EMAILS — 20 locations
 * 4. user.tier from Firestore / profile
 * 5. default: standard (5 locations)
 *
 * Configure in .env.local (gitignored), not in source:
 *   VITE_MANAGER_EMAILS=you@yale.edu
 *   VITE_DEVELOPER_EMAILS=dev@yale.edu
 *   VITE_ELEVATED_EMAILS=collaborator@yale.edu
 */

export const USER_TIERS = {
  standard: {
    id: 'standard',
    label: 'Standard',
    locationLimit: 5,
  },
  elevated: {
    id: 'elevated',
    label: 'Elevated',
    locationLimit: 20,
  },
  developer: {
    id: 'developer',
    label: 'Developer',
    locationLimit: Infinity,
  },
  manager: {
    id: 'manager',
    label: 'Manager',
    locationLimit: Infinity,
  },
};

export const DEFAULT_USER_TIER = 'standard';

const TIER_RANK = {
  standard: 0,
  elevated: 1,
  developer: 2,
  manager: 3,
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const parseEmailList = (raw) =>
  String(raw || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

export const getManagerEmailAllowlist = () =>
  parseEmailList(import.meta.env.VITE_MANAGER_EMAILS);

export const getDeveloperEmailAllowlist = () =>
  parseEmailList(import.meta.env.VITE_DEVELOPER_EMAILS);

export const getElevatedEmailAllowlist = () =>
  parseEmailList(import.meta.env.VITE_ELEVATED_EMAILS);

export const isManagerEmail = (email) =>
  getManagerEmailAllowlist().includes(normalizeEmail(email));

export const isDeveloperEmail = (email) =>
  getDeveloperEmailAllowlist().includes(normalizeEmail(email));

export const isElevatedEmail = (email) =>
  getElevatedEmailAllowlist().includes(normalizeEmail(email));

export const normalizeUserTier = (raw) => {
  const key = String(raw || '')
    .trim()
    .toLowerCase();
  if (key === 'manager' || key === 'owner') return 'manager';
  if (key === 'dev' || key === 'admin') return 'developer';
  if (key === 'elevated' || key === 'premium' || key === 'pro') return 'elevated';
  if (USER_TIERS[key]) return key;
  return DEFAULT_USER_TIER;
};

/** Tier implied by env email allowlists only (no profile). */
export const tierFromEmailAllowlists = (email) => {
  if (isManagerEmail(email)) return 'manager';
  if (isDeveloperEmail(email)) return 'developer';
  if (isElevatedEmail(email)) return 'elevated';
  return null;
};

export const maxTier = (...tiers) => {
  let best = DEFAULT_USER_TIER;
  let bestRank = TIER_RANK[best];
  for (const raw of tiers) {
    if (raw == null) continue;
    const t = normalizeUserTier(raw);
    const rank = TIER_RANK[t] ?? 0;
    if (rank > bestRank) {
      best = t;
      bestRank = rank;
    }
  }
  return best;
};

/**
 * Resolve effective tier for a user object (or email string).
 * Env allowlists and stored profile tier are merged (highest wins).
 */
export const resolveUserTier = (userOrEmail) => {
  if (!userOrEmail) return DEFAULT_USER_TIER;
  const email =
    typeof userOrEmail === 'string' ? userOrEmail : userOrEmail.email;
  const fromAllowlist = tierFromEmailAllowlists(email);
  const stored =
    typeof userOrEmail === 'object' ? userOrEmail.tier : undefined;
  return maxTier(fromAllowlist, stored);
};

export const getTierConfig = (userOrEmail) => {
  const tierId = resolveUserTier(userOrEmail);
  return USER_TIERS[tierId] || USER_TIERS[DEFAULT_USER_TIER];
};

/** Max locations per model run. Infinity = unlimited. */
export const getLocationLimit = (userOrEmail) => getTierConfig(userOrEmail).locationLimit;

export const hasUnlimitedLocations = (userOrEmail) =>
  !Number.isFinite(getLocationLimit(userOrEmail));

export const formatLocationLimit = (limit) =>
  Number.isFinite(limit) ? String(limit) : 'Unlimited';

export const canAddMoreLocations = (userOrEmail, currentCount) => {
  const limit = getLocationLimit(userOrEmail);
  if (!Number.isFinite(limit)) return true;
  return currentCount < limit;
};

export const remainingLocationSlots = (userOrEmail, currentCount) => {
  const limit = getLocationLimit(userOrEmail);
  if (!Number.isFinite(limit)) return Infinity;
  return Math.max(0, limit - currentCount);
};
