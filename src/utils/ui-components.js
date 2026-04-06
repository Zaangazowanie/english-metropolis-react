/**
 * English Metropolis Design System
 * Standardized UI Components for Enterprise Consistency
 * @version 1.0.0
 */

(function(global) {
  'use strict';

  // Design Tokens
  const DesignTokens = {
    colors: {
      primary: {
        50: '#eff6ff',
        100: '#dbeafe',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8'
      },
      slate: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a'
      },
      success: '#059669',
      warning: '#d97706',
      error: '#dc2626'
    },
    spacing: {
      px: '1px',
      0: '0',
      1: '0.25rem',   // 4px
      2: '0.5rem',    // 8px
      3: '0.75rem',   // 12px
      4: '1rem',      // 16px
      5: '1.25rem',   // 20px
      6: '1.5rem',    // 24px
      8: '2rem',      // 32px
      10: '2.5rem',   // 40px
      12: '3rem'      // 48px
    },
    radius: {
      none: '0',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      '2xl': '20px',
      full: '9999px'
    },
    typography: {
      headline: '"Playfair Display", serif',
      body: 'Inter, system-ui, sans-serif',
      mono: '"JetBrains Mono", monospace'
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
    }
  };

  // Button Component
  const Button = {
    // Base classes
    base: 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
    
    // Variants
    variants: {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-md hover:shadow-lg',
      secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400',
      ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500'
    },
    
    // Sizes
    sizes: {
      sm: 'px-3 py-1.5 text-sm rounded-md gap-1.5',
      md: 'px-4 py-2 text-base rounded-lg gap-2',
      lg: 'px-6 py-3 text-lg rounded-xl gap-2.5'
    },

    /**
     * Create button HTML
     * @param {Object} options
     * @param {string} options.variant - primary|secondary|ghost|danger|success
     * @param {string} options.size - sm|md|lg
     * @param {string} options.text - Button text
     * @param {string} options.icon - Material icon name (optional)
     * @param {Object} options.attrs - Additional attributes
     * @returns {string} HTML string
     */
    render(options = {}) {
      const variant = this.variants[options.variant] || this.variants.primary;
      const size = this.sizes[options.size] || this.sizes.md;
      const icon = options.icon ? `<span class="material-symbols-outlined" style="font-size:inherit">${options.icon}</span>` : '';
      const attrs = this.buildAttrs(options.attrs || {});
      
      return `<button class="${this.base} ${variant} ${size}" ${attrs}>${icon}${options.text || ''}</button>`;
    },

    buildAttrs(attrs) {
      return Object.entries(attrs)
        .map(([k, v]) => {
          if (k === 'className') k = 'class';
          if (typeof v === 'boolean') return v ? k : '';
          return `${k}="${SecurityUtils?.escapeHtml(String(v)) || v}"`;
        })
        .filter(Boolean)
        .join(' ');
    }
  };

  // Empty State Component
  const EmptyState = {
    /**
     * Create empty state HTML
     * @param {Object} options
     * @param {string} options.icon - Material icon name
     * @param {string} options.title - Title text
     * @param {string} options.description - Description text
     * @param {Object} options.action - { text: string, onClick: string }
     * @returns {string} HTML string
     */
    render(options = {}) {
      const icon = options.icon || 'inbox';
      const title = SecurityUtils?.escapeHtml(options.title) || options.title || 'No data';
      const description = SecurityUtils?.escapeHtml(options.description) || options.description || '';
      
      let actionHtml = '';
      if (options.action) {
        const actionText = SecurityUtils?.escapeHtml(options.action.text) || options.action.text;
        actionHtml = Button.render({
          variant: options.action.variant || 'primary',
          size: 'md',
          text: actionText,
          attrs: { onclick: options.action.onClick }
        });
      }

      return `
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center" role="status" aria-live="polite">
          <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <span class="material-symbols-outlined text-slate-400 text-3xl">${icon}</span>
          </div>
          <h3 class="font-headline text-xl text-slate-900 mb-2">${title}</h3>
          ${description ? `<p class="text-slate-500 max-w-sm mb-6">${description}</p>` : ''}
          ${actionHtml}
        </div>
      `;
    }
  };

  // Card Component
  const Card = {
    base: 'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
    
    render(options = {}) {
      const padding = options.padding === false ? '' : 'p-6';
      const className = options.className || '';
      const children = options.children || '';
      
      return `<div class="${this.base} ${padding} ${className}">${children}</div>`;
    }
  };

  // Alert/Toast Component
  const Alert = {
    variants: {
      info: 'bg-blue-50 border-blue-200 text-blue-800',
      success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      warning: 'bg-amber-50 border-amber-200 text-amber-800',
      error: 'bg-red-50 border-red-200 text-red-800'
    },

    render(options = {}) {
      const variant = this.variants[options.variant] || this.variants.info;
      const icon = options.icon || this.getDefaultIcon(options.variant);
      const title = SecurityUtils?.escapeHtml(options.title) || options.title;
      const message = SecurityUtils?.escapeHtml(options.message) || options.message;
      
      return `
        <div class="rounded-lg border p-4 ${variant}" role="alert">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-lg mt-0.5">${icon}</span>
            <div class="flex-1">
              ${title ? `<h4 class="font-semibold text-sm">${title}</h4>` : ''}
              ${message ? `<p class="text-sm mt-1">${message}</p>` : ''}
            </div>
          </div>
        </div>
      `;
    },

    getDefaultIcon(variant) {
      const icons = {
        info: 'info',
        success: 'check_circle',
        warning: 'warning',
        error: 'error'
      };
      return icons[variant] || 'info';
    }
  };

  // Loading Skeleton Component
  const Skeleton = {
    render(options = {}) {
      const width = options.width || '100%';
      const height = options.height || '1rem';
      const rounded = options.rounded || 'rounded-md';
      
      return `<div class="animate-pulse bg-slate-200 ${rounded}" style="width:${width};height:${height}"></div>`;
    }
  };

  // Badge Component
  const Badge = {
    variants: {
      default: 'bg-slate-100 text-slate-700',
      primary: 'bg-blue-100 text-blue-700',
      success: 'bg-emerald-100 text-emerald-700',
      warning: 'bg-amber-100 text-amber-700',
      error: 'bg-red-100 text-red-700'
    },

    render(options = {}) {
      const variant = this.variants[options.variant] || this.variants.default;
      const size = options.size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm';
      const text = SecurityUtils?.escapeHtml(options.text) || options.text || '';
      
      return `<span class="inline-flex items-center font-medium rounded-full ${variant} ${size}">${text}</span>`;
    }
  };

  // Input Component
  const Input = {
    base: 'w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors',
    
    error: 'border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50',
    
    render(options = {}) {
      const type = options.type || 'text';
      const placeholder = options.placeholder ? `placeholder="${SecurityUtils?.escapeHtml(options.placeholder)}"` : '';
      const value = options.value ? `value="${SecurityUtils?.escapeHtml(options.value)}"` : '';
      const errorClass = options.error ? this.error : '';
      const attrs = options.attrs || {};
      
      let attrString = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      
      return `<input type="${type}" class="${this.base} ${errorClass}" ${placeholder} ${value} ${attrString} />`;
    }
  };

  // Expose all components
  global.EMComponents = {
    DesignTokens,
    Button,
    EmptyState,
    Card,
    Alert,
    Skeleton,
    Badge,
    Input
  };

})(typeof window !== 'undefined' ? window : global);
