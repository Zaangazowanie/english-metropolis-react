/**
 * English Metropolis Application Configuration
 * Centralized constants, API endpoints, and environment settings
 * @version 1.0.0
 */

(function(global) {
  'use strict';

  // Environment detection
  const ENV = {
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname.includes('dev'),
    isStaging: window.location.hostname.includes('staging') || window.location.hostname.includes('beta'),
    isProduction: !window.location.hostname.includes('localhost') && 
                  !window.location.hostname.includes('dev') && 
                  !window.location.hostname.includes('staging') &&
                  !window.location.hostname.includes('beta')
  };

  // API Configuration
  const API = {
    // Base URLs
    base: ENV.isProduction 
      ? 'https://voice.monexusmedia.uk' 
      : ENV.isStaging 
        ? 'https://voice-staging.monexusmedia.uk'
        : 'http://localhost:8000',
    
    // Endpoints
    endpoints: {
      tts: '/api/tts',
      chat: '/api/chat',
      stt: '/api/stt',
      health: '/api/health'
    },

    // Request defaults
    defaults: {
      timeout: 30000,
      retries: 2,
      retryDelay: 1000
    },

    // Build full URL
    url(endpoint) {
      return `${this.base}${endpoint}`;
    }
  };

  // Application Constants
  const CONSTANTS = {
    // App metadata
    app: {
      name: 'English Metropolis',
      version: '1.0.0',
      tagline: 'Master English through conversation'
    },

    // Quiz/Ascent Tiers
    tiers: {
      1: { name: 'Street Level', tag: 'Fresh off the boat', icon: 'location_city' },
      2: { name: 'The Grind', tag: 'Forging precision through persistence', icon: 'bolt' },
      3: { name: 'Side Hustle', tag: 'Building real momentum', icon: 'trending_up' },
      4: { name: 'Making Moves', tag: 'Starting to talk the talk', icon: 'directions_run' },
      5: { name: 'The Pivot', tag: 'Strategic mastery kicks in', icon: 'rotate_right' },
      6: { name: 'Blue Chip', tag: 'High-value vocabulary territory', icon: 'diamond' },
      7: { name: 'The Boardroom', tag: 'Executive-level command', icon: 'corporate_fare' },
      8: { name: 'Power Player', tag: 'Influencer-tier English', icon: 'star' },
      9: { name: 'The Penthouse', tag: 'Near-native sophistication', icon: 'apartment' },
      10: { name: 'Icon Status', tag: 'Legendary, untouchable fluency', icon: 'workspace_premium' }
    },

    // Quiz categories
    categories: {
      grammar: { 
        label: 'Grammar', 
        icon: 'account_tree', 
        color: 'rose',
        gradient: 'from-rose-500 to-pink-500'
      },
      vocabulary: { 
        label: 'Vocabulary', 
        icon: 'menu_book', 
        color: 'emerald',
        gradient: 'from-emerald-500 to-teal-500'
      },
      fluency: { 
        label: 'Fluency', 
        icon: 'record_voice_over', 
        color: 'amber',
        gradient: 'from-amber-500 to-orange-500'
      },
      pronunciation: { 
        label: 'Pronunciation', 
        icon: 'mic', 
        color: 'violet',
        gradient: 'from-violet-500 to-purple-500'
      }
    },

    // CEFR Levels
    cefr: {
      A1: { name: 'Beginner', color: 'text-slate-500' },
      A2: { name: 'Elementary', color: 'text-blue-500' },
      B1: { name: 'Intermediate', color: 'text-emerald-500' },
      B2: { name: 'Upper-Intermediate', color: 'text-amber-500' },
      C1: { name: 'Advanced', color: 'text-violet-500' },
      C2: { name: 'Mastery', color: 'text-rose-500' }
    },

    // Validation rules
    validation: {
      studentSlug: {
        pattern: /^[a-z0-9-]+$/,
        minLength: 2,
        maxLength: 50
      },
      pin: {
        pattern: /^\d{4}$/,
        length: 4
      },
      email: {
        pattern: /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/,
        maxLength: 254
      },
      password: {
        minLength: 8,
        maxLength: 128,
        requireLowercase: true,
        requireUppercase: true,
        requireNumber: true
      }
    },

    // Progress thresholds
    thresholds: {
      tierPass: 0.7,        // 70% to pass tier
      dailyQuestions: 5,    // Questions per day
      maxRetries: 3,        // Quiz attempt retries
      streakBonus: 7        // Days for streak bonus
    },

    // Storage keys
    storage: {
      prefix: 'em_',
      keys: {
        token: 'em_token',
        user: 'em_user',
        quizProgress: 'em_quiz_v1',
        voice: 'em_voice',
        settings: 'em_settings',
        tourCompleted: 'em_tour'
      }
    },

    // UI Constants
    ui: {
      // Animation durations (ms)
      animation: {
        fast: 150,
        normal: 300,
        slow: 500
      },
      
      // Debounce delays (ms)
      debounce: {
        search: 300,
        resize: 250,
        scroll: 100,
        save: 1000
      },
      
      // Breakpoints (px)
      breakpoints: {
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280
      }
    },

    // Error messages
    errors: {
      network: 'Network error. Please check your connection and try again.',
      timeout: 'Request timed out. Please try again.',
      server: 'Server error. Our team has been notified.',
      auth: 'Authentication failed. Please log in again.',
      notFound: 'Resource not found.',
      validation: 'Please check your input and try again.',
      quota: 'Daily quota exceeded. Try again tomorrow.',
      tts: 'Voice generation failed. Please try again.'
    }
  };

  // Feature flags
  const FEATURES = {
    // Enable/disable features based on environment
    enableTTS: true,
    enableSTT: true,
    enableChat: true,
    enableQuiz: true,
    enableAnalytics: ENV.isProduction,
    enableDebug: ENV.isDevelopment,
    
    // Beta features
    beta: {
      newFlashcardUI: false,
      advancedAnalytics: false,
      socialFeatures: false
    }
  };

  // Utility functions
  const Utils = {
    /**
     * Get storage key with prefix
     * @param {string} key
     * @returns {string}
     */
    storageKey(key) {
      return `${CONSTANTS.storage.prefix}${key}`;
    },

    /**
     * Safe JSON parse with fallback
     * @param {string} str
     * @param {*} fallback
     * @returns {*}
     */
    safeJsonParse(str, fallback = null) {
      try {
        return JSON.parse(str);
      } catch (e) {
        return fallback;
      }
    },

    /**
     * Debounce function
     * @param {Function} fn
     * @param {number} delay
     * @returns {Function}
     */
    debounce(fn, delay = CONSTANTS.ui.debounce.normal) {
      let timeoutId;
      return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    /**
     * Throttle function
     * @param {Function} fn
     * @param {number} limit
     * @returns {Function}
     */
    throttle(fn, limit = CONSTANTS.ui.debounce.scroll) {
      let inThrottle;
      return function(...args) {
        if (!inThrottle) {
          fn.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },

    /**
     * Format percentage
     * @param {number} value
     * @param {number} decimals
     * @returns {string}
     */
    formatPercent(value, decimals = 0) {
      return `${(value * 100).toFixed(decimals)}%`;
    },

    /**
     * Format date
     * @param {string|Date} date
     * @param {Object} options
     * @returns {string}
     */
    formatDate(date, options = {}) {
      const d = new Date(date);
      const defaults = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        ...options 
      };
      return d.toLocaleDateString('en-US', defaults);
    },

    /**
     * Get tier info by progress
     * @param {number} progress
     * @returns {Object}
     */
    getTierByProgress(progress) {
      const tierNum = Math.min(Math.ceil(progress / 10), 10);
      return CONSTANTS.tiers[tierNum];
    },

    /**
     * Check if feature is enabled
     * @param {string} featureName
     * @returns {boolean}
     */
    isFeatureEnabled(featureName) {
      return FEATURES[featureName] || FEATURES.beta[featureName] || false;
    }
  };

  // Expose configuration
  global.AppConfig = {
    ENV,
    API,
    CONSTANTS,
    FEATURES,
    Utils,
    
    // Helper to check environment
    isDev: () => ENV.isDevelopment,
    isStaging: () => ENV.isStaging,
    isProd: () => ENV.isProduction
  };

  // Log configuration in development
  if (ENV.isDevelopment) {
    console.log('[AppConfig] Initialized:', {
      environment: ENV.isProduction ? 'production' : ENV.isStaging ? 'staging' : 'development',
      apiBase: API.base,
      version: CONSTANTS.app.version
    });
  }

})(typeof window !== 'undefined' ? window : global);
