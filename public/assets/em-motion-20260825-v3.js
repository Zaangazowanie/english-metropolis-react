(() => {
  'use strict'

  const PALETTES = {
    dark: { grid: '105,225,255', violet: '139,92,246', fuchsia: '236,72,153', sky: '96,165,250' },
    light: { grid: '96,165,250', violet: '124,58,237', fuchsia: '219,39,119', sky: '14,165,233' },
  }
  const fields = new Map()
  const carouselCleanups = new Map()
  const polished = new WeakSet()
  const revealed = new WeakSet()
  let enhanceFrame = 0
  let signalFrame = 0
  let queuedSignal = null
  let carouselShaderModule = null
  let loginShaderModule = null
  let lastCarouselIntent = { at: -Infinity, clientX: 0, clientY: 0 }

  function seededRandom(seed) {
    let value = seed >>> 0
    return () => {
      value += 0x6D2B79F5
      let next = value
      next = Math.imul(next ^ (next >>> 15), next | 1)
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296
    }
  }

  function publishSurfaceSignal(event, intensity = 0.42) {
    queuedSignal = { clientX: event.clientX, clientY: event.clientY, intensity }
    if (signalFrame) return
    signalFrame = requestAnimationFrame(() => {
      signalFrame = 0
      if (!queuedSignal) return
      window.dispatchEvent(new CustomEvent('englishmetro:surface-signal', { detail: queuedSignal }))
      queuedSignal = null
    })
  }

  function setPointerPolish(element, event) {
    const bounds = element.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    element.style.setProperty('--motion-x', `${(x * 100).toFixed(2)}%`)
    element.style.setProperty('--motion-y', `${(y * 100).toFixed(2)}%`)
    element.style.setProperty('--motion-tilt-x', `${((0.5 - y) * 4.5).toFixed(2)}deg`)
    element.style.setProperty('--motion-tilt-y', `${((x - 0.5) * 5.5).toFixed(2)}deg`)
    element.style.setProperty('--motion-shift-x', `${((x - 0.5) * 5).toFixed(2)}px`)
    element.style.setProperty('--motion-shift-y', `${((y - 0.5) * 3.5).toFixed(2)}px`)
    element.style.setProperty('--motion-angle', `${(Math.atan2(y - 0.5, x - 0.5) * 180 / Math.PI + 90).toFixed(2)}deg`)
    publishSurfaceSignal(event)
  }

  function bindPolish(element, extraClass = '') {
    if (!element || polished.has(element)) return
    polished.add(element)
    element.classList.add('em-motion-polish')
    if (extraClass) element.classList.add(extraClass)
    element.addEventListener('pointermove', event => setPointerPolish(element, event), { passive: true })
    element.addEventListener('pointerdown', event => publishSurfaceSignal(event, 0.92), { passive: true })
    element.addEventListener('pointerleave', () => {
      element.style.setProperty('--motion-x', '50%')
      element.style.setProperty('--motion-y', '50%')
      element.style.setProperty('--motion-tilt-x', '0deg')
      element.style.setProperty('--motion-tilt-y', '0deg')
      element.style.setProperty('--motion-shift-x', '0px')
      element.style.setProperty('--motion-shift-y', '0px')
      element.style.setProperty('--motion-angle', '0deg')
    }, { passive: true })
  }

  function ensureCarouselShader(host) {
    if (!host || host.dataset.emThreeMounted === 'true' || host.dataset.emThreeLoading === 'true') return
    host.dataset.emThreeLoading = 'true'
    const startLoad = () => {
      const loadModule = carouselShaderModule
        ? Promise.resolve(carouselShaderModule)
        : import('./em-carousel-three-20260825.js?v=7').then(module => {
            carouselShaderModule = module
            return module
          })

      loadModule.then(module => {
        if (!host.isConnected) return
        module.mountCarouselShader(host)
        host.dataset.emThreeMounted = 'true'
        host.classList.add('em-carousel-three-ready')
      }).catch(() => {
        host.classList.add('em-carousel-three-fallback')
      }).finally(() => {
        delete host.dataset.emThreeLoading
      })
    }
    if ('requestIdleCallback' in window) window.requestIdleCallback(startLoad, { timeout: 850 })
    else window.setTimeout(startLoad, 260)
  }

  function ensureLoginShader(page) {
    if (!page || page.dataset.emLoginThreeMounted === 'true' || page.dataset.emLoginThreeLoading === 'true') return
    page.dataset.emLoginThreeLoading = 'true'
    page.classList.add('em-login-spatial-root')
    let host = page.querySelector('.em-login-three-host')
    if (!host) {
      host = document.createElement('div')
      host.className = 'em-login-three-host'
      host.setAttribute('aria-hidden', 'true')
      page.prepend(host)
    }

    const startLoad = () => {
      const loadModule = loginShaderModule
        ? Promise.resolve(loginShaderModule)
        : import('./em-login-three-20260825.js?v=2').then(module => {
            loginShaderModule = module
            return module
          })

      loadModule.then(module => {
        if (!host.isConnected) return
        module.mountLoginShader(host)
        page.dataset.emLoginThreeMounted = 'true'
        page.classList.add('em-login-three-ready')
      }).catch(() => {
        page.classList.add('em-login-three-fallback')
      }).finally(() => {
        delete page.dataset.emLoginThreeLoading
      })
    }

    if ('requestIdleCallback' in window) window.requestIdleCallback(startLoad, { timeout: 420 })
    else window.setTimeout(startLoad, 120)
  }

  function bindDramaticCarousel(host, shaderHost = host) {
    if (!host) return
    host.classList.add('em-carousel-dramatic')
    host.classList.remove('em-motion-polish')
    host.querySelectorAll('.gh-hs-btn,.gh-hs-arrow,.gh-hs-dot').forEach((control, index) => {
      control.style.setProperty('--em-control-index', index)
      bindPolish(control, 'em-liquid-control')
    })
    host.querySelectorAll('.gh-hs-slide').forEach((slide, index) => {
      slide.style.setProperty('--em-slide-index', index)
    })
    ensureCarouselShader(shaderHost)
    if (shaderHost !== host) ensureCarouselShader(host)
    if (carouselCleanups.has(host)) return

    let activeSlide = null
    let transitionTimer = 0
    let entryTimer = 0
    let lastInput = { clientX: host.getBoundingClientRect().left + host.clientWidth * 0.72,
      clientY: host.getBoundingClientRect().top + host.clientHeight * 0.45 }

    function announceTransition(intensity = 1) {
      window.dispatchEvent(new CustomEvent('englishmetro:carousel-transition', {
        detail: { ...lastInput, intensity },
      }))
    }

    function setSwitching() {
      host.classList.add('em-carousel-switching')
      clearTimeout(transitionTimer)
      transitionTimer = window.setTimeout(() => host.classList.remove('em-carousel-switching'), 520)
    }

    function syncActiveSlide(initial = false) {
      const next = host.querySelector('.gh-hs-slide[data-active="true"]')
      if (!next || next === activeSlide) return
      activeSlide = next
      host.querySelectorAll('.gh-hs-slide.em-slide-enter').forEach(slide => {
        if (slide !== next) slide.classList.remove('em-slide-enter')
      })
      next.classList.remove('em-slide-enter')
      requestAnimationFrame(() => next.classList.add('em-slide-enter'))
      clearTimeout(entryTimer)
      entryTimer = window.setTimeout(() => next.classList.remove('em-slide-enter'), 620)
      if (!initial) {
        setSwitching()
        announceTransition(1)
      }
    }

    function recordInput(event) {
      if (event.type === 'keydown' && !['Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
      if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        lastInput = { clientX: event.clientX, clientY: event.clientY }
      }
      lastCarouselIntent = { at: performance.now(), ...lastInput }
      announceTransition(event.type === 'pointerdown' ? 0.94 : 0.62)
    }

    const controls = [...host.querySelectorAll('.gh-hs-arrow,.gh-hs-dot')]
    controls.forEach(control => {
      control.addEventListener('pointerdown', recordInput, { passive: true })
      control.addEventListener('keydown', recordInput)
    })
    const observer = new MutationObserver(() => syncActiveSlide(false))
    observer.observe(host, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-active', 'aria-hidden', 'aria-selected'],
    })
    syncActiveSlide(true)
    if (performance.now() - lastCarouselIntent.at < 1100) {
      lastInput = { clientX: lastCarouselIntent.clientX, clientY: lastCarouselIntent.clientY }
      requestAnimationFrame(() => {
        if (!host.isConnected) return
        setSwitching()
        announceTransition(1)
      })
    }

    carouselCleanups.set(host, () => {
      observer.disconnect()
      clearTimeout(transitionTimer)
      clearTimeout(entryTimer)
      controls.forEach(control => {
        control.removeEventListener('pointerdown', recordInput)
        control.removeEventListener('keydown', recordInput)
      })
    })
  }

  function createSignalField(host, mode, density, className) {
    if (!host || host.querySelector(`canvas.${className}`)) return
    const canvas = document.createElement('canvas')
    canvas.className = `em-motion-field ${className}`
    canvas.setAttribute('aria-hidden', 'true')
    host.prepend(canvas)

    const context = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!context) return
    const palette = PALETTES[mode] || PALETTES.dark
    const random = seededRandom(mode === 'dark' ? 918273 : 192837)
    const nodes = Array.from({ length: density }, (_, index) => ({
      x: random(), y: random(), radius: 0.7 + random() * 1.7,
      phase: random() * Math.PI * 2, speed: 0.45 + random() * 0.9,
      color: index % 7 === 0 ? palette.fuchsia : index % 5 === 0 ? palette.sky : palette.violet,
    }))
    const routes = nodes.slice(0, 12).map((node, index) => [node, nodes[(index * 5 + 17) % nodes.length]])
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointer = { x: 0.5, y: 0.42, tx: 0.5, ty: 0.42 }
    let reduced = motionQuery.matches
    let visible = true
    let frame = 0
    let width = 0
    let height = 0
    let ratio = 1
    let energy = 0.08
    let targetEnergy = 0.08

    function nodePosition(node, seconds, still) {
      const drift = still ? 0 : Math.sin(seconds * node.speed + node.phase) * 0.006
      const depth = 0.72 + node.y * 0.48
      return {
        x: (node.x + drift + (pointer.x - 0.5) * 0.012 * depth) * width,
        y: (node.y - drift * 0.7 + (pointer.y - 0.5) * 0.009 * depth) * height,
      }
    }

    function draw(time = 0, forceStill = false) {
      if (!width || !height) return
      const seconds = time / 1000
      const still = reduced || forceStill
      pointer.x += (pointer.tx - pointer.x) * 0.055
      pointer.y += (pointer.ty - pointer.y) * 0.055
      energy += (targetEnergy - energy) * (still ? 1 : 0.085)
      targetEnergy = Math.max(0.075, targetEnergy * (still ? 1 : 0.965))
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)

      const lens = context.createRadialGradient(pointer.x * width, pointer.y * height, 0, pointer.x * width, pointer.y * height, Math.max(width, height) * 0.45)
      lens.addColorStop(0, `rgba(${palette.violet},${(mode === 'dark' ? 0.13 : 0.075) + energy * 0.07})`)
      lens.addColorStop(0.45, `rgba(${palette.fuchsia},${mode === 'dark' ? 0.055 : 0.032})`)
      lens.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = lens
      context.fillRect(0, 0, width, height)

      context.lineWidth = 1
      for (let row = 0; row < 8; row += 1) {
        const progress = row / 7
        const y = height * (0.16 + progress * progress * 0.82)
        context.strokeStyle = `rgba(${palette.grid},${0.018 + progress * 0.025})`
        context.beginPath(); context.moveTo(-width * 0.08, y); context.lineTo(width * 1.08, y - height * 0.045); context.stroke()
      }
      for (let column = -2; column <= 10; column += 1) {
        const topX = width * (0.5 + (column - 4) * 0.045)
        const bottomX = width * (0.5 + (column - 4) * 0.16)
        context.strokeStyle = `rgba(${palette.grid},0.026)`
        context.beginPath(); context.moveTo(topX, height * 0.08); context.lineTo(bottomX, height * 1.04); context.stroke()
      }

      routes.forEach(([from, to], index) => {
        const a = nodePosition(from, seconds, still)
        const b = nodePosition(to, seconds, still)
        const pulse = still ? 0.38 : 0.22 + (Math.sin(seconds * 0.72 + index) + 1) * 0.11
        context.strokeStyle = `rgba(${index % 2 ? palette.sky : palette.fuchsia},${pulse * 0.34})`
        context.lineWidth = index % 3 === 0 ? 1.2 : 0.7
        context.beginPath(); context.moveTo(a.x, a.y)
        const arc = Math.min(height * 0.18, Math.abs(b.x - a.x) * 0.15 + 18)
        context.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - arc, b.x, b.y); context.stroke()
      })

      nodes.forEach((node, index) => {
        const position = nodePosition(node, seconds, still)
        const breathe = still ? 1 : 0.82 + Math.sin(seconds * node.speed + node.phase) * 0.18
        const distance = Math.hypot(position.x / width - pointer.x, position.y / height - pointer.y)
        const attention = Math.max(0, 1 - distance * 3.7)
        const radius = node.radius * breathe + attention * 2.2
        if (index % 9 === 0) {
          const halo = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, radius * 7)
          halo.addColorStop(0, `rgba(${node.color},${0.18 + attention * 0.18})`)
          halo.addColorStop(1, `rgba(${node.color},0)`)
          context.fillStyle = halo; context.beginPath(); context.arc(position.x, position.y, radius * 7, 0, Math.PI * 2); context.fill()
        }
        context.fillStyle = `rgba(${node.color},${0.22 + attention * 0.48})`
        context.beginPath(); context.arc(position.x, position.y, radius, 0, Math.PI * 2); context.fill()
      })

      if (energy > 0.09) {
        for (let ring = 0; ring < 3; ring += 1) {
          const radius = (38 + ring * 42) * (0.7 + energy * 0.55)
          context.strokeStyle = `rgba(${ring === 1 ? palette.fuchsia : palette.sky},${Math.max(0, energy * 0.12 - ring * 0.018)})`
          context.lineWidth = 1
          context.beginPath(); context.arc(pointer.x * width, pointer.y * height, radius, 0, Math.PI * 2); context.stroke()
        }
      }

      if (!still) {
        const travel = ((seconds * 0.055) % 1.35) - 0.18
        const beamX = travel * width
        const beam = context.createLinearGradient(beamX - 90, 0, beamX + 90, 0)
        beam.addColorStop(0, 'rgba(0,0,0,0)')
        beam.addColorStop(0.5, `rgba(${palette.sky},${mode === 'dark' ? 0.075 : 0.04})`)
        beam.addColorStop(1, 'rgba(0,0,0,0)')
        context.fillStyle = beam; context.fillRect(beamX - 90, 0, 180, height)
      }
    }

    function animate(time) {
      draw(time)
      if (visible && !reduced && canvas.isConnected) frame = requestAnimationFrame(animate)
    }
    function resize() {
      const bounds = host.getBoundingClientRect()
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height)
      ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
      draw(performance.now(), true)
    }
    function handlePointer(event) {
      const bounds = host.getBoundingClientRect()
      pointer.tx = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
      pointer.ty = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    }
    function handleSurfaceSignal(event) {
      const detail = event.detail || {}
      if (Number.isFinite(detail.clientX) && Number.isFinite(detail.clientY)) {
        const bounds = host.getBoundingClientRect()
        pointer.tx = Math.min(1, Math.max(0, (detail.clientX - bounds.left) / bounds.width))
        pointer.ty = Math.min(1, Math.max(0, (detail.clientY - bounds.top) / bounds.height))
      }
      targetEnergy = Math.max(targetEnergy, Math.min(1, detail.intensity || 0.42))
    }
    function handleMotion(event) {
      reduced = event.matches; cancelAnimationFrame(frame)
      if (reduced) draw(performance.now(), true)
      else if (visible) frame = requestAnimationFrame(animate)
    }
    const resizeObserver = new ResizeObserver(resize)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; cancelAnimationFrame(frame)
      if (visible && !reduced) frame = requestAnimationFrame(animate)
    }, { rootMargin: '160px 0px' })
    resizeObserver.observe(host); visibilityObserver.observe(canvas)
    window.addEventListener('pointermove', handlePointer, { passive: true })
    window.addEventListener('englishmetro:surface-signal', handleSurfaceSignal)
    motionQuery.addEventListener?.('change', handleMotion)
    resize(); if (!reduced) frame = requestAnimationFrame(animate)
    fields.set(canvas, () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect(); visibilityObserver.disconnect()
      window.removeEventListener('pointermove', handlePointer)
      window.removeEventListener('englishmetro:surface-signal', handleSurfaceSignal)
      motionQuery.removeEventListener?.('change', handleMotion)
    })
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      revealObserver.unobserve(entry.target)
    })
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })

  function bindReveal(element, index, direction = '') {
    if (!element || revealed.has(element)) return
    revealed.add(element)
    element.classList.add('em-motion-reveal')
    if (direction) element.classList.add(direction)
    element.style.setProperty('--em-reveal-delay', `${(index % 4) * 45}ms`)
    revealObserver.observe(element)
  }

  function ensureHeroProcession(hero) {
    if (!hero) return
    hero.querySelectorAll(':scope > .em-hero-procession--foreground').forEach(element => element.remove())
    let procession = hero.querySelector(':scope > .em-hero-procession')
    if (!procession) {
      procession = document.createElement('div')
      procession.className = 'em-hero-procession'
      procession.setAttribute('aria-hidden', 'true')
      procession.innerHTML = `
        <div class="em-hero-procession__pass em-hero-procession__pass--skyline">
          <span class="em-hero-procession__trace"></span>
          <span class="em-hero-procession__beam"></span>
        </div>`
      hero.prepend(procession)
    } else {
      const pass = procession.querySelector('.em-hero-procession__pass--skyline')
      if (pass && !pass.querySelector('.em-hero-procession__beam')) {
        const beam = document.createElement('span')
        beam.className = 'em-hero-procession__beam'
        pass.append(beam)
      }
    }
  }

  function enhance() {
    enhanceFrame = 0
    fields.forEach((cleanup, canvas) => {
      if (!canvas.isConnected) { cleanup(); fields.delete(canvas) }
    })
    carouselCleanups.forEach((cleanup, host) => {
      if (!host.isConnected) { cleanup(); carouselCleanups.delete(host) }
    })

    const home = document.querySelector('.gh-root')
    if (home) {
      const hero = home.querySelector('.gh-hero') || home.querySelector('.gh-hero-grid')
      home.querySelectorAll('canvas.gh-hero-signal').forEach(canvas => canvas.remove())
      hero?.classList.add('em-hero-three-field')
      ensureHeroProcession(hero)
      home.querySelectorAll('.gh-header,.gh-action,.gh-lang-btn,.gh-theme-btn,.gh-menu-toggle,.gh-slider-arrow,.gh-arcade-viewport,.gh-photo-frame').forEach(element => bindPolish(element))
      home.querySelectorAll('.gh-arcade-tab,.gh-proof-item,.gh-city-feature,.gh-step').forEach(element => bindPolish(element, 'em-shader-surface'))
      home.querySelectorAll('.gh-pack,.gh-door').forEach(element => bindPolish(element, 'gh-spatial-card'))
      const stage = home.querySelector('.gh-hero-stage-wrap')
      bindPolish(stage)
      stage?.querySelector('.gh-photo-frame')?.classList.add('gh-spatial-frame')
      bindDramaticCarousel(stage?.querySelector('.gh-hs'), hero)
      home.querySelectorAll('.gh-lessons-media').forEach((element, index) => bindReveal(element, index, 'em-reveal-left'))
      home.querySelectorAll('.gh-lessons-copy').forEach((element, index) => bindReveal(element, index, 'em-reveal-right'))
      home.querySelectorAll('.gh-city-copy').forEach((element, index) => bindReveal(element, index, 'em-reveal-left'))
      home.querySelectorAll('.gh-three-reveal').forEach((element, index) => bindReveal(element, index, 'em-reveal-up'))
    }

    const pricing = document.querySelector('.lp-page')
    if (pricing) {
      createSignalField(pricing.querySelector('.lp-hero'), 'light', 66, 'lp-hero-signal')
      pricing.querySelectorAll('.lp-nav,.lp-button').forEach(element => bindPolish(element))
      pricing.querySelectorAll('.lp-hero-panel,.lp-package,.lp-course-card,.lp-policy-item').forEach(element => bindPolish(element, 'em-motion-tilt'))
      const selectors = '.lp-intro,.lp-section-head,.lp-package-grid,.lp-specialist-block,.lp-readiness,.lp-policy-grid,.lp-signup-copy,.lp-form'
      pricing.querySelectorAll(selectors).forEach((element, index) => bindReveal(element, index, element.classList.contains('lp-section-head') ? 'em-reveal-left' : ''))
    }

    const loginForm = document.querySelector('#root input[autocomplete="username"]')?.closest('form')
    const loginPage = loginForm?.closest('#root > div')
    if (loginPage && /^\/login\/?$/.test(window.location.pathname)) {
      ensureLoginShader(loginPage)
      const card = loginForm.parentElement
      const layout = [...loginPage.children].find(element => element.matches?.('div') && getComputedStyle(element).display === 'grid')
      const copy = layout?.firstElementChild
      const photo = loginPage.querySelector('.emlv3-photo')
      const skyline = loginPage.querySelector('svg[viewBox="0 0 1600 400"]')
      layout?.classList.add('em-login-spatial-layout')
      copy?.classList.add('em-login-spatial-copy')
      photo?.classList.add('em-login-spatial-photo')
      skyline?.classList.add('em-login-motion-skyline')
      bindPolish(copy)
      bindPolish(photo)
      bindPolish(card, 'em-login-spatial-card')
      loginForm.querySelectorAll('.v3-field-input').forEach(input => {
        bindPolish(input.parentElement, 'em-login-spatial-field')
      })
      const submit = loginForm.querySelector('button[type="submit"]')
      bindPolish(submit, 'em-login-spatial-submit')
    }
  }

  function scheduleEnhance() {
    if (!enhanceFrame) enhanceFrame = requestAnimationFrame(enhance)
  }

  new MutationObserver(scheduleEnhance).observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('popstate', scheduleEnhance)
  window.addEventListener('hashchange', scheduleEnhance)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true })
  else scheduleEnhance()
})()
