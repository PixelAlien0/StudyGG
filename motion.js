(() => {
  'use strict';

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const noop = () => {};

  if (!gsap || !ScrollTrigger) {
    window.StudyMotion = {
      init: noop,
      enterView: noop,
      listIn: noop,
      swapCard: noop,
      reveal: noop,
      detailsOpen: noop,
      refresh: noop
    };
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  let initialized = false;
  let motionAllowed = false;
  const media = gsap.matchMedia();

  function targets(value) {
    return gsap.utils.toArray(value).filter((node) => node && !node.hidden);
  }

  function clearStudyTriggers() {
    ScrollTrigger.getAll()
      .filter((trigger) => String(trigger.vars.id || '').startsWith('study-'))
      .forEach((trigger) => {
        trigger.animation?.revert?.();
        trigger.kill(true);
      });
    gsap.set('.topic-card, .module-row, .study-dashboard > *, .knowledge-scope', { clearProps: 'transform,opacity' });
  }

  function overviewEntrance() {
    const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } });
    timeline
      .from('.masthead > *', { y: -10, opacity: 0, duration: 0.32, stagger: 0.035 })
      .from('.hero-margin', { x: -14, opacity: 0, duration: 0.38 }, '-=0.16')
      .from('.hero-copy .eyebrow', { y: 10, opacity: 0, duration: 0.32 }, '-=0.22')
      .from('.hero-copy h1', { y: 22, opacity: 0, duration: 0.48 }, '-=0.20')
      .from('.hero-lede', { y: 14, opacity: 0, duration: 0.38 }, '-=0.24')
      .from('.hero-copy .hero-actions > *', { y: 9, opacity: 0, duration: 0.24, stagger: 0.045 }, '-=0.20')
      .from('.source-note', { x: 18, y: 8, rotation: 3, opacity: 0, duration: 0.46 }, '-=0.38');
  }

  function setupOverviewScroll() {
    clearStudyTriggers();

    ScrollTrigger.batch('.topic-card, .module-row', {
      id: 'study-module-rows',
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.fromTo(batch,
        { y: 16 },
        { y: 0, duration: 0.4, stagger: 0.045, ease: 'power2.out', overwrite: true, clearProps: 'transform' }
      )
    });

    gsap.from('.study-dashboard > *', {
      scrollTrigger: { id: 'study-dashboard', trigger: '.study-dashboard', start: 'top 86%', once: true },
      y: 16,
      duration: 0.42,
      stagger: 0.045,
      ease: 'power2.out',
      clearProps: 'transform'
    });

    gsap.from('.knowledge-scope', {
      scrollTrigger: { id: 'study-scope', trigger: '.knowledge-scope', start: 'top 88%', once: true },
      x: -16,
      duration: 0.42,
      ease: 'power2.out',
      clearProps: 'transform'
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    gsap.config({ nullTargetWarn: false });

    media.add(
      {
        motionOK: '(prefers-reduced-motion: no-preference)',
        reduceMotion: '(prefers-reduced-motion: reduce)'
      },
      (context) => {
        motionAllowed = context.conditions.motionOK;
        if (!motionAllowed) {
          clearStudyTriggers();
          return;
        }
        overviewEntrance();
        setupOverviewScroll();
      }
    );
  }

  function enterView(name, view) {
    if (!initialized || !motionAllowed || !view) return;
    const heading = targets(view.querySelectorAll('.page-title > *, .compact-title > *'));
    const controls = targets(view.querySelectorAll('.study-controls, .quiz-setup, .atlas-toolbar, .filter-rail'));
    gsap.killTweensOf([...heading, ...controls]);
    if (heading.length) {
      gsap.fromTo(heading, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.34, stagger: 0.04, ease: 'power2.out', overwrite: true });
    }
    if (controls.length) {
      gsap.fromTo(controls, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.035, ease: 'power2.out', overwrite: true });
    }
    if (name === 'overview') setupOverviewScroll();
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  function listIn(value) {
    if (!initialized || !motionAllowed) return;
    const items = targets(value).slice(0, 14);
    if (!items.length) return;
    gsap.killTweensOf(items);
    gsap.fromTo(items,
      { y: 10, opacity: 0.72 },
      { y: 0, opacity: 1, duration: 0.32, stagger: 0.025, ease: 'power2.out', overwrite: true }
    );
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  function swapCard(value, direction = 1) {
    if (!initialized || !motionAllowed) return;
    const card = targets(value)[0];
    if (!card) return;
    gsap.killTweensOf(card);
    gsap.fromTo(card,
      { x: direction * 14, opacity: 0.72 },
      { x: 0, opacity: 1, duration: 0.18, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity' }
    );
  }

  function reveal(value) {
    if (!initialized || !motionAllowed) return;
    const nodes = targets(value);
    if (!nodes.length) return;
    gsap.killTweensOf(nodes);
    gsap.fromTo(nodes,
      { y: 8, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.18, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity' }
    );
  }

  function detailsOpen(details) {
    if (!initialized || !motionAllowed || !details?.open) return;
    reveal(details.querySelector('.slide-note-body'));
  }

  function refresh() {
    if (!initialized || !motionAllowed) return;
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  window.StudyMotion = { init, enterView, listIn, swapCard, reveal, detailsOpen, refresh };
})();
