/**
 * Country-of-origin choices for an SKU (customs / HSN declarations). A static
 * list on purpose: the Grow shell has no session (Vercel build, no proxy), so
 * it cannot read staging's geofence country list. The Nueva SKU form merges
 * the live list on top of this one when the proxy answers.
 */
export const ORIGIN_COUNTRIES: string[] = [
  'Philippines', 'South Africa', 'Namibia', 'Botswana', 'India', 'China', 'Japan', 'South Korea',
  'Taiwan', 'Vietnam', 'Thailand', 'Malaysia', 'Singapore', 'Indonesia', 'Australia', 'New Zealand',
  'United States', 'Canada', 'Mexico', 'Brazil', 'United Kingdom', 'Ireland', 'Germany', 'France',
  'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland', 'Sweden', 'Poland', 'Turkey',
  'United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Kenya', 'Nigeria',
]
