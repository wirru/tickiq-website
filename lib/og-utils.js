/**
 * Shared utilities for OG image generation
 * Used by /api/og/* endpoints
 */

/**
 * Truncate text to max length, respecting word boundaries
 * Handles Unicode properly (emojis, etc.)
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum character length
 * @returns {string} Truncated text with ellipsis if needed
 */
export function truncateText(text, maxLength) {
  if (!text) return '';

  // Use Array.from to handle Unicode properly (emojis, etc.)
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;

  // Find last space within limit for clean word break
  const truncated = chars.slice(0, maxLength).join('');
  const lastSpace = truncated.lastIndexOf(' ');

  // If there's a space in a reasonable position, break there
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + '...';
  }

  // Otherwise just truncate at max length
  return truncated + '...';
}

/**
 * Format count with k/m suffix for large numbers
 * Matches iOS formatting (lowercase k/m)
 *
 * @param {number} count - Number to format
 * @returns {string} Formatted count string
 */
export function formatCount(count) {
  if (typeof count !== 'number' || isNaN(count)) return '0';
  if (count < 0) return '0';

  if (count >= 1000000) {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  }
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(Math.floor(count));
}

/**
 * Format timestamp as relative time (e.g., "2h ago", "3d ago")
 * Matches iOS formatting
 *
 * @param {string} isoString - ISO timestamp string
 * @returns {string} Relative time string
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now - date;

  // Handle future dates gracefully
  if (diffMs < 0) return 'just now';

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  // For older posts, show absolute date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * SVG icon paths for social buttons
 * Using Material Design icons (simple, clean)
 */
export const ICONS = {
  // Filled heart icon
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',

  // Chat bubble icon
  comment: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
};

/**
 * Common colors used in OG images
 */
export const COLORS = {
  white: '#ffffff',
  whiteTransparent60: 'rgba(255, 255, 255, 0.6)',
  whiteTransparent12: 'rgba(255, 255, 255, 0.12)',
  gradientStart: 'rgba(0, 0, 0, 0)',
  gradientEnd: 'rgba(0, 0, 0, 0.55)',
  black: '#000000',
};
