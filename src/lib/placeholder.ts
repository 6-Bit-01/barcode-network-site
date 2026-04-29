/**
 * Placeholder image system for database entries without custom portraits.
 *
 * Priority order:
 * 1. Custom image (entry.image is set)
 * 2. RESTRICTED clearance → restricted placeholder
 * 3. Production category → production poster placeholder
 * 4. UNKNOWN status → unknown/no-image placeholder
 * 5. All others → deterministic-random from general pool
 */

const GENERAL_PLACEHOLDERS = [
  "/placeholder-1.png",
  "/placeholder-2.png",
];

const RESTRICTED_PLACEHOLDER = "/placeholder-restricted.png";
const UNKNOWN_PLACEHOLDER = "/placeholder-unknown.png";
const PRODUCTION_PLACEHOLDER = "/placeholder-production.png";

/** Simple deterministic hash from a string → number */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Returns the appropriate placeholder image path for a database entry.
 * If the entry already has a custom image, returns that instead.
 */
export function getEntryImage(entry: {
  id: string;
  image: string;
  clearance: string;
  category?: string;
  status?: string;
}): string {
  // Use custom image if available
  if (entry.image) return entry.image;

  // RESTRICTED clearance entries get the restricted placeholder
  if (entry.clearance === "RESTRICTED") return RESTRICTED_PLACEHOLDER;

  // Production category entries get the production poster
  if (entry.category === "Production") return PRODUCTION_PLACEHOLDER;

  // UNKNOWN status entries get the unknown/no-image placeholder
  if (entry.status === "UNKNOWN") return UNKNOWN_PLACEHOLDER;

  // All others get a deterministic-random general placeholder
  const index = hashCode(entry.id) % GENERAL_PLACEHOLDERS.length;
  return GENERAL_PLACEHOLDERS[index];
}
