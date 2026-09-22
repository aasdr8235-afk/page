(() => {
  'use strict';

  const themeToggle = document.querySelector('.theme-toggle');
  if (themeToggle && window.archiveTheme) {
    window.archiveTheme.sync();
    themeToggle.hidden = false;
    themeToggle.addEventListener('click', () => window.archiveTheme.toggle());
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const desktopPointer = matchMedia('(pointer: fine) and (hover: hover) and (min-width: 1025px)');
  const mobileNav = matchMedia('(max-width: 800px)');
  const onLoad = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));

  // Smoothly visualize readiness milestones on every full-page visit. Progress
  // never outruns settled assets; failed assets use their normal page fallbacks.
  const startup = window.archiveStartup;
  if (startup) {
    const { loader, finish, started } = startup;
    const bar = loader.querySelector('.loader-progress');
    const label = loader.querySelector('.loader-state');
    const count = loader.querySelector('.loader-count');
    let completed = 0;
    let displayed = 1;
    let target = 1;
    let frame = 0;
    let previousTime = performance.now();
    const render = now => {
      frame = 0;
      if (loader.hidden) return;
      const step = Math.max(0, Math.min(1, (now - previousTime) / 90));
      previousTime = now;
      // A brief entrance makes cached visits legible without a long timed intro.
      const entrance = Math.min(100, 1 + 99 * Math.max(0, now - started) / 600);
      displayed = Math.min(entrance, displayed + (target - displayed) * step);
      if (target - displayed < .5 && entrance >= target) displayed = target;
      bar.style.transform = `scaleX(${displayed / 100})`;
      count.textContent = `${Math.floor(displayed)}%`;
      if (displayed === 100) {
        label.textContent = 'READY';
        loader.classList.add('is-leaving');
        setTimeout(finish, 160);
      } else if (displayed < target) {
        frame = requestAnimationFrame(render);
      }
    };
    const milestone = () => {
      completed += 1;
      if (loader.hidden) return;
      target = Math.round(completed / 4 * 100);
      if (!frame) {
        previousTime = performance.now();
        frame = requestAnimationFrame(render);
      }
    };
    const imageReady = Promise.allSettled(
      [...document.querySelectorAll('.hero-profile-img, .loader-mark')]
        .map(image => image.decode ? image.decode() : Promise.resolve())
    );
    const fontsReady = document.fonts
      ? Promise.all([document.fonts.load('500 16px Inter'), document.fonts.load('400 12px "JetBrains Mono"')])
      : Promise.resolve();
    Promise.all([Promise.resolve(), fontsReady, imageReady, onLoad].map(promise =>
      promise.catch(() => {}).then(milestone)
    ));
  }

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav-list');
  const navigation = document.querySelector('.site-nav');
  const setMenu = (open, returnFocus = false) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Index: close navigation' : 'Index: open navigation');
    nav.inert = mobileNav.matches && !open;
    if (returnFocus) toggle.focus();
  };
  if (toggle && nav && navigation) {
    navigation.classList.add('nav-ready');
    setMenu(false);
    document.documentElement.classList.remove('nav-pending');
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      setMenu(false);
      // Keep native fragment/history navigation and place keyboard focus at destination.
      const section = document.getElementById(link.hash.slice(1));
      if (section) {
        section.setAttribute('tabindex', '-1');
        section.focus({ preventScroll: true });
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') setMenu(false, true);
    });
    document.addEventListener('click', event => {
      if (toggle.getAttribute('aria-expanded') === 'true' && !navigation.contains(event.target)) setMenu(false);
    });
    navigation.addEventListener('focusout', event => {
      if (!navigation.contains(event.relatedTarget)) setMenu(false);
    });
    mobileNav.addEventListener('change', () => setMenu(false));
  }

  // A single scheduled scroll update, with no layout work on pointer movement.
  const progress = document.querySelector('.reading-progress-bar');
  let scrollFrame = 0;
  let scrollRange = 1;
  const renderProgress = () => {
    scrollFrame = 0;
    progress.style.transform = `scaleX(${Math.max(0, Math.min(1, window.scrollY / scrollRange))})`;
  };
  const scheduleProgress = () => {
    if (!scrollFrame && !document.hidden) scrollFrame = requestAnimationFrame(renderProgress);
  };
  let pageHeight = 0;
  const measurePage = () => {
    scrollRange = Math.max(1, pageHeight - window.innerHeight);
    scheduleProgress();
  };
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', measurePage, { passive: true });
  if ('ResizeObserver' in window) {
    new ResizeObserver(entries => {
      pageHeight = entries[0].contentRect.height;
      measurePage();
    }).observe(document.body);
  } else {
    onLoad.then(() => { pageHeight = document.documentElement.scrollHeight; measurePage(); });
  }

  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!reducedMotion.matches && entry.boundingClientRect.top > 0) entry.target.classList.add('reveal-enter');
        reveal.unobserve(entry.target);
      }
    }, { threshold: .08 });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      reveal.observe(element);
      element.addEventListener('animationend', () => element.classList.remove('reveal-enter'), { once: true });
    });
    const sectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        document.querySelectorAll('.nav-link').forEach(link => {
          if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('main > section').forEach(section => sectionObserver.observe(section));
  }

  // Optional desktop cursor companion. Native cursor always remains available.
  // No perpetual animation loop, and no pointer listeners at all on touch devices.
  let cursorController;
  let cursorFrame = 0;
  const ring = document.querySelector('.cursor-ring');
  const hideCursor = () => {
    if (cursorFrame) cancelAnimationFrame(cursorFrame);
    cursorFrame = 0;
    ring.classList.remove('is-active');
  };
  const configureCursor = () => {
    cursorController?.abort();
    hideCursor();
    const constrained = navigator.connection?.saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    if (!desktopPointer.matches || reducedMotion.matches || navigator.maxTouchPoints > 0 || constrained) return;
    cursorController = new AbortController();
    const { signal } = cursorController;
    let x = 0, y = 0;
    document.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || document.hidden) return;
      x = event.clientX;
      y = event.clientY;
      if (!cursorFrame) cursorFrame = requestAnimationFrame(() => {
        cursorFrame = 0;
        ring.style.transform = `translate3d(${x - 12}px, ${y - 12}px, 0)`;
        ring.classList.add('is-active');
      });
    }, { passive: true, signal });
    document.documentElement.addEventListener('pointerleave', hideCursor, { signal });
    window.addEventListener('blur', hideCursor, { signal });
    document.addEventListener('keydown', hideCursor, { signal });
  };
  desktopPointer.addEventListener('change', configureCursor);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) startup?.finish();
    configureCursor();
  });
  configureCursor();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hideCursor();
      cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    } else measurePage();
  });

  // The shell is independent of the optional search module and startup milestones.
  const assistant = document.querySelector('.archive-assistant');
  const launcher = assistant.querySelector('.assistant-launcher');
  const panel = assistant.querySelector('.assistant-panel');
  const close = assistant.querySelector('.assistant-close');
  const status = assistant.querySelector('.assistant-status');
  const form = assistant.querySelector('.assistant-form');
  const input = assistant.querySelector('input');
  const suggestions = assistant.querySelector('.assistant-suggestions');
  let searchModule;
  let searchLoading;
  let panelOpen = false;
  const mobileAssistant = matchMedia('(max-width: 600px)');
  const background = [...document.querySelectorAll('.site-header, main, .site-footer, .skip-link')];
  const updateAssistantMode = () => {
    const sheet = panelOpen && mobileAssistant.matches;
    background.forEach(element => { element.inert = sheet; });
    if (sheet) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
    }
  };
  const viewport = window.visualViewport;
  const fitAssistant = () => {
    if (!panelOpen || !viewport) return;
    // Visual viewport shrinks/pans above the on-screen keyboard on iOS as well.
    panel.style.setProperty('--assistant-viewport', `${viewport.height}px`);
    panel.style.setProperty('--assistant-bottom', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
  };
  const setAssistant = open => {
    panelOpen = open;
    panel.hidden = !open;
    launcher.hidden = open;
    launcher.setAttribute('aria-expanded', String(open));
    updateAssistantMode();
    if (open) {
      fitAssistant();
      viewport?.addEventListener('resize', fitAssistant);
      viewport?.addEventListener('scroll', fitAssistant);
      // Avoid opening the software keyboard before the visitor asks a question.
      close.focus({ preventScroll: true });
    } else {
      viewport?.removeEventListener('resize', fitAssistant);
      viewport?.removeEventListener('scroll', fitAssistant);
      launcher.focus({ preventScroll: true });
    }
  };
  const loadSearch = async () => {
    if (searchModule) return searchModule;
    if (searchLoading) return searchLoading;
    status.textContent = 'Opening the index…';
    searchLoading = Promise.race([
      import('./archive-search.js'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Index timeout')), 6000))
    ]).then(module => {
      searchModule = module.createIndex(document);
      status.textContent = '';
      return searchModule;
    }).catch(() => {
      status.textContent = 'The index could not load. Browse Projects, Writing, or Labs on the page, or try again.';
      return null;
    }).finally(() => { searchLoading = null; });
    return searchLoading;
  };
  const ask = async query => {
    form.querySelector('button').disabled = true;
    suggestions.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      const index = await loadSearch();
      if (index) {
        index.reply(query, assistant.querySelector('.assistant-messages'));
        input.value = '';
      }
    } finally {
      form.querySelector('button').disabled = false;
      suggestions.querySelectorAll('button').forEach(button => { button.disabled = false; });
      if (panelOpen && !mobileAssistant.matches) input.focus({ preventScroll: true });
    }
  };
  launcher.addEventListener('click', () => { setAssistant(true); void loadSearch(); });
  close.addEventListener('click', () => setAssistant(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panelOpen) { event.preventDefault(); setAssistant(false); }
  });
  mobileAssistant.addEventListener('change', () => { updateAssistantMode(); fitAssistant(); });
  // Desktop remains non-modal. The phone sheet keeps focus in its visible UI.
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || !mobileAssistant.matches) return;
    const focusable = [...panel.querySelectorAll('button:not(:disabled), input, a, [tabindex="0"]')]
      .filter(element => element.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query && !form.querySelector('button').disabled) void ask(query);
  });
  suggestions.addEventListener('click', event => {
    const button = event.target.closest('[data-query]');
    if (button) void ask(button.dataset.query);
  });
  assistant.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    setAssistant(false);
    const target = document.querySelector(link.hash);
    target?.setAttribute('tabindex', '-1');
    target?.focus({ preventScroll: true });
  });
  assistant.hidden = false;
  // At the footer, use the reserved space below it so the launcher cannot cover
  // the closing text or Back to top link while the visitor reads the directory.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      assistant.classList.toggle('at-footer', entries[0].isIntersecting);
    }).observe(document.querySelector('.site-footer'));
  }

  // Preserve the existing public analytics ID, outside the critical render path.
  onLoad.then(() => {
    const analytics = () => {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', 'G-RPMN5MJ42C');
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=G-RPMN5MJ42C';
      document.head.append(script);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(analytics, { timeout: 2000 });
    else setTimeout(analytics, 0);
  });
})();
