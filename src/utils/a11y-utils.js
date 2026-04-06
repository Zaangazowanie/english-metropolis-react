/**
 * English Metropolis Accessibility (a11y) Utilities
 * WCAG 2.1 AA Compliance Helpers
 * @version 1.0.0
 */

(function(global) {
  'use strict';

  const A11yUtils = {
    /**
     * Create a focus trap for modals/dialogs
     * @param {HTMLElement} container - The modal container element
     * @returns {Function} - Call to remove the trap
     */
    createFocusTrap(container) {
      if (!container) return () => {};

      const focusableSelectors = [
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable]'
      ].join(', ');

      const getFocusableElements = () => 
        Array.from(container.querySelectorAll(focusableSelectors))
          .filter(el => el.offsetParent !== null); // Only visible elements

      const handleKeyDown = (e) => {
        if (e.key !== 'Tab') return;

        const focusable = getFocusableElements();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          // Tab
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      };

      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          const closeBtn = container.querySelector('[data-a="close"], [aria-label*="close" i], .close-btn');
          if (closeBtn) closeBtn.click();
        }
      };

      container.addEventListener('keydown', handleKeyDown);
      container.addEventListener('keydown', handleEscape);

      // Store previously focused element
      const previousActiveElement = document.activeElement;

      // Focus first element
      setTimeout(() => {
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
          // Prefer focusing the close button or heading for better UX
          const closeBtn = container.querySelector('[data-a="close"]');
          const heading = container.querySelector('h1, h2, h3, [role="heading"]');
          if (closeBtn) {
            closeBtn.focus();
          } else if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus();
          } else {
            focusable[0].focus();
          }
        }
      }, 100);

      // Return cleanup function
      return function removeFocusTrap() {
        container.removeEventListener('keydown', handleKeyDown);
        container.removeEventListener('keydown', handleEscape);
        // Restore previous focus
        if (previousActiveElement && previousActiveElement.focus) {
          previousActiveElement.focus();
        }
      };
    },

    /**
     * Announce message to screen readers
     * @param {string} message - Message to announce
     * @param {string} priority - 'polite' or 'assertive'
     */
    announce(message, priority = 'polite') {
      const ariaLive = priority === 'assertive' ? 'assertive' : 'polite';
      
      // Find or create live region
      let liveRegion = document.getElementById(`a11y-live-${ariaLive}`);
      if (!liveRegion) {
        liveRegion = document.createElement('div');
        liveRegion.id = `a11y-live-${ariaLive}`;
        liveRegion.setAttribute('aria-live', ariaLive);
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        liveRegion.style.cssText = 'position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(liveRegion);
      }

      // Clear and set new message
      liveRegion.textContent = '';
      setTimeout(() => {
        liveRegion.textContent = message;
      }, 100);
    },

    /**
     * Add skip link to page
     * @param {string} targetId - ID of main content
     * @param {string} label - Link text
     */
    addSkipLink(targetId = 'main-content', label = 'Skip to main content') {
      // Check if skip link already exists
      if (document.getElementById('a11y-skip-link')) return;

      const skipLink = document.createElement('a');
      skipLink.id = 'a11y-skip-link';
      skipLink.href = `#${targetId}`;
      skipLink.textContent = label;
      skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:bg-white focus:text-slate-900 focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg';
      skipLink.style.cssText = `
        position: absolute;
        left: -10000px;
        top: auto;
        width: 1px;
        height: 1px;
        overflow: hidden;
      `;

      // Show on focus
      skipLink.addEventListener('focus', () => {
        skipLink.style.cssText = `
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 9999;
          background: white;
          color: #1e293b;
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          text-decoration: none;
          font-weight: 600;
          width: auto;
          height: auto;
          overflow: visible;
        `;
      });

      skipLink.addEventListener('blur', () => {
        skipLink.style.cssText = `
          position: absolute;
          left: -10000px;
          top: auto;
          width: 1px;
          height: 1px;
          overflow: hidden;
        `;
      });

      // Handle click
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(targetId);
        if (target) {
          target.setAttribute('tabindex', '-1');
          target.focus();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });

      document.body.insertBefore(skipLink, document.body.firstChild);
    },

    /**
     * Check if user prefers reduced motion
     * @returns {boolean}
     */
    prefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    /**
     * Apply reduced motion styles
     */
    applyReducedMotion() {
      if (!this.prefersReducedMotion()) return;

      const style = document.createElement('style');
      style.id = 'a11y-reduced-motion';
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
        .animate-pulse, .animate-bounce, .animate-spin {
          animation: none !important;
        }
      `;
      document.head.appendChild(style);
    },

    /**
     * Make element focusable and focus it
     * @param {HTMLElement} element
     */
    focusElement(element) {
      if (!element) return;
      if (!element.hasAttribute('tabindex')) {
        element.setAttribute('tabindex', '-1');
      }
      element.focus();
    },

    /**
     * Validate form field and show error
     * @param {HTMLElement} input - Input element
     * @param {string} errorMessage - Error message
     * @returns {boolean} - Is valid
     */
    validateField(input, errorMessage) {
      const isValid = input.checkValidity();
      const errorId = `${input.id}-error`;
      
      // Find or create error element
      let errorEl = document.getElementById(errorId);
      if (!errorEl) {
        errorEl = document.createElement('span');
        errorEl.id = errorId;
        errorEl.className = 'a11y-field-error';
        errorEl.style.cssText = 'color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem; display: block;';
        input.parentNode.insertBefore(errorEl, input.nextSibling);
      }

      if (!isValid) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', errorId);
        errorEl.textContent = errorMessage || input.validationMessage;
        input.classList.add('input-error');
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
        errorEl.textContent = '';
        input.classList.remove('input-error');
      }

      return isValid;
    },

    /**
     * Add keyboard navigation to custom components
     * @param {HTMLElement} container
     * @param {string} itemSelector
     * @param {Object} options
     */
    addKeyboardNavigation(container, itemSelector, options = {}) {
      const items = Array.from(container.querySelectorAll(itemSelector));
      if (items.length === 0) return;

      const { 
        horizontal = false, 
        loop = true,
        activateOnEnter = true 
      } = options;

      items.forEach((item, index) => {
        item.setAttribute('tabindex', index === 0 ? '0' : '-1');
        
        item.addEventListener('keydown', (e) => {
          let nextIndex = index;

          if (horizontal) {
            if (e.key === 'ArrowRight') nextIndex = index + 1;
            if (e.key === 'ArrowLeft') nextIndex = index - 1;
          } else {
            if (e.key === 'ArrowDown') nextIndex = index + 1;
            if (e.key === 'ArrowUp') nextIndex = index - 1;
          }

          if (e.key === 'Home') nextIndex = 0;
          if (e.key === 'End') nextIndex = items.length - 1;

          // Handle wrapping
          if (loop) {
            if (nextIndex < 0) nextIndex = items.length - 1;
            if (nextIndex >= items.length) nextIndex = 0;
          } else {
            nextIndex = Math.max(0, Math.min(nextIndex, items.length - 1));
          }

          if (nextIndex !== index) {
            e.preventDefault();
            items[index].setAttribute('tabindex', '-1');
            items[nextIndex].setAttribute('tabindex', '0');
            items[nextIndex].focus();
          }

          if (activateOnEnter && e.key === 'Enter') {
            item.click();
          }
        });
      });
    },

    /**
     * Set page title with site name
     * @param {string} pageTitle
     * @param {string} siteName
     */
    setPageTitle(pageTitle, siteName = 'English Metropolis') {
      document.title = pageTitle ? `${pageTitle} | ${siteName}` : siteName;
    },

    /**
     * Initialize common accessibility features
     */
    init() {
      // Add skip link
      this.addSkipLink('main-content');

      // Apply reduced motion if preferred
      this.applyReducedMotion();

      // Listen for reduced motion changes
      const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      motionQuery.addEventListener('change', (e) => {
        if (e.matches) {
          this.applyReducedMotion();
        } else {
          const style = document.getElementById('a11y-reduced-motion');
          if (style) style.remove();
        }
      });

      // Add main landmark if missing
      if (!document.querySelector('main')) {
        const main = document.querySelector('#root') || document.querySelector('#app');
        if (main) {
          main.setAttribute('role', 'main');
          main.id = main.id || 'main-content';
        }
      }

      console.log('[A11y] Accessibility utilities initialized');
    }
  };

  // Expose globally
  global.A11yUtils = A11yUtils;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => A11yUtils.init());
  } else {
    A11yUtils.init();
  }

})(typeof window !== 'undefined' ? window : global);
