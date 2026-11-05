/**
 * ==============================================================================
 * Centralized API & Formatting Utilities (api.js)
 * ==============================================================================
 * Provides a standardized HTTP client wrapper (`API.request`) with cookie handling,
 * automatic redirection on unauthenticated requests (HTTP 401), HTML sanitization,
 * and numeric/byte formatting for dashboard cards and tables.
 * ==============================================================================
 */

const API = {
  /**
   * Dispatches an asynchronous fetch request to an admin API endpoint.
   * Automatically sets credentials, headers, and handles HTTP 401 unauthorized redirects.
   *
   * @param {string} path - Relative endpoint path (e.g., '/overview', '/tables')
   * @param {RequestInit} [options={}] - Standard Fetch options (method, headers, body, etc.)
   * @returns {Promise<any>} Parsed JSON response body
   * @throws {Error} When response status is non-2xx
   */
  async request(path, options = {}) {
    // Prefix path with the administrative API route
    const response = await fetch(`/api/admin${path}`, {
      credentials: 'same-origin', // Send session cookies with the request
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    // Parse JSON body or default to an empty object
    const data = await response.json().catch(() => ({}));

    // If session is expired or invalid, redirect to login page
    if (response.status === 401) {
      if (!location.pathname.endsWith('/login.html')) {
        location.href = '/login.html';
      }
      throw new Error(data.message || 'Please sign in again.');
    }

    // Reject non-successful HTTP responses
    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
  },

  /**
   * Sanitizes untrusted user strings to prevent Cross-Site Scripting (XSS).
   *
   * @param {any} value - String or value to be escaped
   * @returns {string} HTML-escaped safe string
   */
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  },

  /**
   * Formats numbers using the user's localized digit grouping (e.g., 1,234,567).
   *
   * @param {number|string} value - Raw number to format
   * @returns {string} Formatted localized string
   */
  number(value) {
    return new Intl.NumberFormat().format(Number(value || 0));
  },

  /**
   * Converts raw byte counts into human-readable storage units (B, KB, MB, GB, TB).
   *
   * @param {number|string} value - Byte size
   * @returns {string} Readable string (e.g., '192.00 KB', '4.20 MB')
   */
  bytes(value) {
    const n = Number(value || 0);
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
    return `${(n / Math.pow(1024, idx)).toFixed(idx ? 2 : 0)} ${units[idx]}`;
  }
};
