/**
 * Enterprise Security Utilities for English Metropolis
 * XSS Prevention, Input Sanitization, and Data Validation
 * @version 1.0.0
 */

(function(global) {
  'use strict';

  const SecurityUtils = {
    /**
     * XSS Protection: Escape HTML entities to prevent script injection
     * @param {string} str - Raw input string
     * @returns {string} - Escaped string safe for HTML insertion
     */
    escapeHtml(str) {
      if (typeof str !== 'string') return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    /**
     * Sanitize user input by removing dangerous characters
     * @param {string} input - Raw user input
     * @returns {string} - Sanitized string
     */
    sanitizeInput(input) {
      if (typeof input !== 'string') return '';
      return input
        .trim()
        .replace(/[<>\"']/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '');
    },

    /**
     * Validate and sanitize student slug
     * @param {string} slug - Student slug
     * @returns {Object} - { valid: boolean, value?: string, error?: string }
     */
    validateSlug(slug) {
      const sanitized = this.sanitizeInput(slug).toLowerCase();
      if (!sanitized) return { valid: false, error: 'Slug is required' };
      if (!/^[a-z0-9-]+$/.test(sanitized)) {
        return { valid: false, error: 'Slug contains invalid characters' };
      }
      if (sanitized.length < 2 || sanitized.length > 50) {
        return { valid: false, error: 'Slug must be 2-50 characters' };
      }
      return { valid: true, value: sanitized };
    },

    /**
     * Validate PIN (4 digits)
     * @param {string} pin - PIN code
     * @returns {Object} - { valid: boolean, value?: string, error?: string }
     */
    validatePin(pin) {
      const sanitized = this.sanitizeInput(pin);
      if (!sanitized) return { valid: false, error: 'PIN is required' };
      if (!/^\d{4}$/.test(sanitized)) {
        return { valid: false, error: 'PIN must be 4 digits' };
      }
      return { valid: true, value: sanitized };
    },

    /**
     * Safely render verbatim quotes with XSS protection
     * @param {Object} quotes - Raw quote data
     * @returns {Object} - Sanitized quote data
     */
    sanitizeVerbatimQuotes(quotes) {
      if (!quotes || typeof quotes !== 'object') return {};
      
      const sanitized = {};
      for (const [student, dates] of Object.entries(quotes)) {
        const safeStudent = this.sanitizeInput(student);
        sanitized[safeStudent] = {};
        
        for (const [date, categories] of Object.entries(dates)) {
          const safeDate = this.sanitizeInput(date);
          sanitized[safeStudent][safeDate] = {};
          
          for (const [category, quotesList] of Object.entries(categories)) {
            const safeCategory = this.sanitizeInput(category);
            if (Array.isArray(quotesList)) {
              sanitized[safeStudent][safeDate][safeCategory] = quotesList.map(q => ({
                q: this.escapeHtml(q.q || ''),
                c: this.escapeHtml(q.c || ''),
                t: this.escapeHtml(q.t || '')
              }));
            }
          }
        }
      }
      return sanitized;
    },

    /**
     * Create a safe HTML element with sanitized content
     * @param {string} tag - HTML tag name
     * @param {Object} options - { text?: string, html?: string, attrs?: Object }
     * @returns {HTMLElement} - Safe element
     */
    createSafeElement(tag, options = {}) {
      const el = document.createElement(tag);
      
      if (options.text) {
        el.textContent = options.text;
      }
      
      if (options.attrs && typeof options.attrs === 'object') {
        for (const [key, value] of Object.entries(options.attrs)) {
          // Only allow safe attribute names
          if (/^[a-z][a-z0-9-]*$/i.test(key) && !key.startsWith('on')) {
            el.setAttribute(key, this.sanitizeInput(String(value)));
          }
        }
      }
      
      return el;
    },

    /**
     * Safe JSON parse with error handling
     * @param {string} jsonString - JSON string to parse
     * @param {*} defaultValue - Default value if parsing fails
     * @returns {*} - Parsed object or default value
     */
    safeJsonParse(jsonString, defaultValue = null) {
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        console.warn('JSON parse error:', e);
        return defaultValue;
      }
    },

    /**
     * Content Security Policy helper - validate external URLs
     * @param {string} url - URL to validate
     * @returns {boolean} - Whether URL is allowed
     */
    isAllowedUrl(url) {
      if (typeof url !== 'string') return false;
      
      const allowedProtocols = ['https:', 'http:'];
      const allowedDomains = [
        'lexicon.monexusmedia.uk',
        'voice.monexusmedia.uk',
        'fonts.googleapis.com',
        'fonts.gstatic.com'
      ];
      
      try {
        const parsed = new URL(url, window.location.origin);
        if (!allowedProtocols.includes(parsed.protocol)) return false;
        if (parsed.protocol === 'https:') return true;
        return allowedDomains.some(domain => parsed.hostname.includes(domain));
      } catch (e) {
        return false;
      }
    },

    /**
     * Rate limiting helper for API calls
     * @param {string} key - Rate limit key
     * @param {number} maxRequests - Max requests allowed
     * @param {number} windowMs - Time window in milliseconds
     * @returns {boolean} - Whether request is allowed
     */
    checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
      const now = Date.now();
      const storageKey = `rl_${key}`;
      const data = this.safeJsonParse(localStorage.getItem(storageKey), { count: 0, windowStart: now });
      
      if (now - data.windowStart > windowMs) {
        data.count = 1;
        data.windowStart = now;
      } else {
        data.count++;
      }
      
      localStorage.setItem(storageKey, JSON.stringify(data));
      return data.count <= maxRequests;
    }
  };

  // Expose to global scope
  global.SecurityUtils = SecurityUtils;

  // Auto-sanitize window.__VERBATIM_QUOTES if present
  if (global.window && window.__VERBATIM_QUOTES) {
    window.__VERBATIM_QUOTES = SecurityUtils.sanitizeVerbatimQuotes(window.__VERBATIM_QUOTES);
  }

})(typeof window !== 'undefined' ? window : global);
