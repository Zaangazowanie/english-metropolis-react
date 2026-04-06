/**
 * English Metropolis Lazy Loading Utilities
 * Performance-optimized image and content loading
 * @version 1.0.0
 */

(function(global) {
  'use strict';

  const LazyLoader = {
    // Configuration
    config: {
      rootMargin: '50px 0px',
      threshold: 0.01,
      placeholderColor: '#e2e8f0'
    },

    // Store observers
    observers: new Map(),

    /**
     * Initialize lazy loading for images
     */
    initImages() {
      // Check for IntersectionObserver support
      if (!('IntersectionObserver' in window)) {
        // Fallback: load all images immediately
        this.loadAllImages();
        return;
      }

      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadImage(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold
      });

      // Observe all lazy images
      document.querySelectorAll('img[data-src], img[data-srcset]').forEach(img => {
        // Add placeholder styling
        if (!img.style.backgroundColor) {
          img.style.backgroundColor = this.config.placeholderColor;
        }
        imageObserver.observe(img);
      });

      this.observers.set('images', imageObserver);
    },

    /**
     * Load a single image
     * @param {HTMLImageElement} img
     */
    loadImage(img) {
      const src = img.dataset.src;
      const srcset = img.dataset.srcset;
      const sizes = img.dataset.sizes;

      if (!src && !srcset) return;

      // Create new image to preload
      const preloadImg = new Image();
      
      preloadImg.onload = () => {
        if (src) img.src = src;
        if (srcset) img.srcset = srcset;
        if (sizes) img.sizes = sizes;
        
        img.classList.add('loaded');
        img.removeAttribute('data-src');
        img.removeAttribute('data-srcset');
        img.removeAttribute('data-sizes');
        img.style.backgroundColor = '';
        
        // Trigger custom event
        img.dispatchEvent(new CustomEvent('lazyLoaded', { detail: { src } }));
      };

      preloadImg.onerror = () => {
        img.classList.add('load-error');
        img.dispatchEvent(new CustomEvent('lazyError', { detail: { src } }));
      };

      preloadImg.src = src;
    },

    /**
     * Load all images immediately (fallback)
     */
    loadAllImages() {
      document.querySelectorAll('img[data-src], img[data-srcset]').forEach(img => {
        this.loadImage(img);
      });
    },

    /**
     * Initialize lazy loading for iframes
     */
    initIframes() {
      if (!('IntersectionObserver' in window)) {
        this.loadAllIframes();
        return;
      }

      const iframeObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadIframe(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold
      });

      document.querySelectorAll('iframe[data-src]').forEach(iframe => {
        iframeObserver.observe(iframe);
      });

      this.observers.set('iframes', iframeObserver);
    },

    /**
     * Load a single iframe
     * @param {HTMLIFrameElement} iframe
     */
    loadIframe(iframe) {
      const src = iframe.dataset.src;
      if (src) {
        iframe.src = src;
        iframe.removeAttribute('data-src');
        iframe.classList.add('loaded');
      }
    },

    /**
     * Load all iframes immediately
     */
    loadAllIframes() {
      document.querySelectorAll('iframe[data-src]').forEach(iframe => {
        this.loadIframe(iframe);
      });
    },

    /**
     * Initialize lazy loading for content (infinite scroll)
     * @param {string} selector - Selector for container
     * @param {Function} loadMore - Function to call when scrolled to bottom
     * @param {Object} options
     */
    initInfiniteScroll(selector, loadMore, options = {}) {
      const container = document.querySelector(selector);
      if (!container) return;

      const sentinel = document.createElement('div');
      sentinel.className = 'lazy-sentinel';
      sentinel.style.height = '10px';
      sentinel.setAttribute('aria-hidden', 'true');
      container.appendChild(sentinel);

      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && typeof loadMore === 'function') {
            loadMore();
          }
        });
      }, {
        rootMargin: options.rootMargin || '100px 0px',
        threshold: 0
      });

      observer.observe(sentinel);
      this.observers.set('infiniteScroll', observer);

      return {
        disconnect: () => {
          observer.disconnect();
          sentinel.remove();
        }
      };
    },

    /**
     * Preload critical images
     * @param {Array<string>} urls - Image URLs to preload
     */
    preloadCritical(urls) {
      if (!Array.isArray(urls)) return;

      urls.forEach(url => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = url;
        document.head.appendChild(link);
      });
    },

    /**
     * Batch load images with priority
     * @param {Array<HTMLImageElement>} images
     * @param {number} batchSize
     */
    async batchLoad(images, batchSize = 3) {
      const batches = [];
      for (let i = 0; i < images.length; i += batchSize) {
        batches.push(images.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(
          batch.map(img => new Promise((resolve) => {
            img.addEventListener('lazyLoaded', resolve, { once: true });
            img.addEventListener('lazyError', resolve, { once: true });
            this.loadImage(img);
          }))
        );
        // Small delay between batches
        await new Promise(r => setTimeout(r, 50));
      }
    },

    /**
     * Cleanup all observers
     */
    cleanup() {
      this.observers.forEach(observer => observer.disconnect());
      this.observers.clear();
    },

    /**
     * Initialize all lazy loading
     */
    init() {
      // Add CSS for smooth transitions
      const style = document.createElement('style');
      style.textContent = `
        img[data-src], img[data-srcset] {
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        img.loaded {
          opacity: 1;
        }
        iframe[data-src] {
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        iframe.loaded {
          opacity: 1;
        }
      `;
      document.head.appendChild(style);

      // Initialize lazy loading
      this.initImages();
      this.initIframes();

      console.log('[LazyLoader] Initialized');
    }
  };

  // Expose globally
  global.LazyLoader = LazyLoader;

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => LazyLoader.init());
  } else {
    LazyLoader.init();
  }

})(typeof window !== 'undefined' ? window : global);
