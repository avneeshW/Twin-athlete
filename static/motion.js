/**
 * Digital Twin Athlete — WHOOP-Style Motion & Cinematic Animation Engine
 * Inspired by WHOOP.com "Unlock Human Performance & Healthspan"
 * High-framerate scroll-linked timelines, 3D tilt, parallax layers,
 * progressive disclosure, and biometric cardiac pulses.
 */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lenisInstance = null;

  // ==============================================================================
  // 1. SMOOTH SCROLL FOUNDATION (LENIS + GSAP TICKER)
  // ==============================================================================
  function initSmoothScroll() {
    if (prefersReducedMotion) return;

    if (typeof Lenis !== 'undefined') {
      try {
        lenisInstance = new Lenis({
          duration: 1.15,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          orientation: 'vertical',
          gestureOrientation: 'vertical',
          smoothWheel: true,
          wheelMultiplier: 0.92,
          touchMultiplier: 1.4,
        });

        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
          gsap.registerPlugin(ScrollTrigger);
          lenisInstance.on('scroll', ScrollTrigger.update);
          gsap.ticker.add((time) => {
            lenisInstance.raf(time * 1000);
          });
          gsap.ticker.lagSmoothing(0);
        } else {
          function raf(time) {
            lenisInstance.raf(time);
            requestAnimationFrame(raf);
          }
          requestAnimationFrame(raf);
        }
      } catch (e) {
        console.warn('[motion] Lenis smooth scroll fallback:', e);
      }
    }
  }

  // ==============================================================================
  // 2. NUMBER COUNTER ANIMATION HELPER
  // ==============================================================================
  function animateCounter(element, targetVal, duration = 1.2, suffix = '%') {
    if (!element) return;
    const numericTarget = parseFloat(targetVal);
    if (isNaN(numericTarget)) return;

    const startVal = 0;
    const startTime = performance.now();
    const durationMs = duration * 1000;

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (numericTarget - startVal) * ease);

      element.textContent = `${current}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        element.textContent = `${numericTarget}${suffix}`;
      }
    }

    requestAnimationFrame(step);
  }

  // ==============================================================================
  // 3. 3D INTERACTIVE PERSPECTIVE CARD TILT
  // ==============================================================================
  function initCardTiltInteractions() {
    if (prefersReducedMotion) return;

    const tiltCards = document.querySelectorAll(
      '.vitals-grid-row .metric-card, .athlete-digital-twin-card, .ai-recommendation-card, .overview-card, .injury-risk-card, .precautions-card, .scenario-comp-card, .live-kpi-card'
    );

    tiltCards.forEach((card) => {
      let bounds = null;

      card.addEventListener('mouseenter', () => {
        bounds = card.getBoundingClientRect();
      });

      card.addEventListener('mousemove', (e) => {
        if (!bounds) bounds = card.getBoundingClientRect();
        const mouseX = e.clientX - bounds.left;
        const mouseY = e.clientY - bounds.top;

        const xPct = (mouseX / bounds.width - 0.5) * 2; // -1 to 1
        const yPct = (mouseY / bounds.height - 0.5) * 2; // -1 to 1

        const rotateX = yPct * -6; // max 6 deg
        const rotateY = xPct * 6; // max 6 deg

        card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)';
      });
    });
  }

  // ==============================================================================
  // 4. HERO GREETING & AMBIENT PARALLAX
  // ==============================================================================
  function initHeroAnimations() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const heroCard = document.querySelector('.hero-banner-card');
    const heroH1 = document.querySelector('#heroGreeting');
    const heroSub = document.querySelector('#heroSubtext');

    if (heroCard && heroH1) {
      // Cinematic Entrance Timeline
      const tl = gsap.timeline({ delay: 0.1 });
      tl.fromTo(
        heroCard,
        { opacity: 0, y: 30, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.85, ease: 'power3.out' }
      )
        .fromTo(
          heroH1,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out' },
          '-=0.5'
        )
        .fromTo(
          heroSub,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' },
          '-=0.4'
        );

      // Subtle Parallax Layering on Scroll
      if (typeof ScrollTrigger !== 'undefined') {
        gsap.to(heroCard, {
          scrollTrigger: {
            trigger: heroCard,
            start: 'top top+=80',
            end: 'bottom top',
            scrub: 1.2,
          },
          yPercent: -10,
          opacity: 0.85,
        });
      }
    }
  }

  // ==============================================================================
  // 5. ATHLETE DIGITAL TWIN STATUS CARD & SCORE REVEALS
  // ==============================================================================
  function initTwinStatusAnimations() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const twinCard = document.querySelector('#athleteTwinStatusCard');
    if (!twinCard) return;

    // Trigger on scroll into view
    ScrollTrigger.create({
      trigger: twinCard,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.fromTo(
          twinCard,
          { opacity: 0, y: 35, scale: 0.98 },
          { opacity: 1, y: 0, scale: 1, duration: 0.75, ease: 'power3.out' }
        );

        // Progress bar smooth fill from 0 to data values
        const readinessBar = document.querySelector('#twinReadinessBar');
        const recoveryBar = document.querySelector('#twinRecoveryBar');
        const fatigueBar = document.querySelector('#twinFatigueBar');
        const perfBar = document.querySelector('#twinPerformanceBar');

        const readinessVal = document.querySelector('#twinReadinessVal');
        const recoveryVal = document.querySelector('#twinRecoveryVal');
        const fatigueVal = document.querySelector('#twinFatigueVal');
        const perfVal = document.querySelector('#twinPerformanceVal');

        if (readinessBar) {
          const w = readinessBar.style.width || '82%';
          readinessBar.style.width = '0%';
          setTimeout(() => {
            readinessBar.style.width = w;
            animateCounter(readinessVal, w.replace('%', ''), 1.2, '%');
          }, 150);
        }

        if (recoveryBar) {
          const w = recoveryBar.style.width || '78%';
          recoveryBar.style.width = '0%';
          setTimeout(() => {
            recoveryBar.style.width = w;
            animateCounter(recoveryVal, w.replace('%', ''), 1.2, '%');
          }, 250);
        }

        if (fatigueBar) {
          const w = fatigueBar.style.width || '38%';
          fatigueBar.style.width = '0%';
          setTimeout(() => {
            fatigueBar.style.width = w;
            animateCounter(fatigueVal, w.replace('%', ''), 1.2, '%');
          }, 350);
        }

        if (perfBar) {
          const w = perfBar.style.width || '87%';
          perfBar.style.width = '0%';
          setTimeout(() => {
            perfBar.style.width = w;
            animateCounter(perfVal, w.replace('%', ''), 1.2, '%');
          }, 450);
        }
      },
    });
  }

  // ==============================================================================
  // 6. TODAY'S AI RECOMMENDATION & PROGRESSIVE DISCLOSURE
  // ==============================================================================
  function initAiRecommendationAnimations() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const aiCard = document.querySelector('#aiRecommendationCard');
    if (!aiCard) return;

    ScrollTrigger.create({
      trigger: aiCard,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.fromTo(
          aiCard,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
        );

        const chips = aiCard.querySelectorAll('.rec-chip');
        if (chips.length > 0) {
          gsap.fromTo(
            chips,
            { opacity: 0, y: 16, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.5, ease: 'back.out(1.2)', delay: 0.2 }
          );
        }

        const reasonBox = aiCard.querySelector('.ai-rec-reason-box');
        if (reasonBox) {
          gsap.fromTo(
            reasonBox,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', delay: 0.4 }
          );
        }
      },
    });
  }

  // ==============================================================================
  // 7. QUICK VITALS METRIC CARDS STAGGER
  // ==============================================================================
  function initVitalsAnimations() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const vitalsRow = document.querySelector('.vitals-grid-row');
    if (!vitalsRow) return;

    const metricCards = vitalsRow.querySelectorAll('.metric-card');
    if (metricCards.length === 0) return;

    ScrollTrigger.create({
      trigger: vitalsRow,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.fromTo(
          metricCards,
          { opacity: 0, y: 28, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, stagger: 0.09, duration: 0.65, ease: 'power3.out' }
        );
      },
    });
  }

  // ==============================================================================
  // 8. TODAY'S OVERVIEW DONUT GAUGE SCRUB
  // ==============================================================================
  function initDonutGaugeAnimation() {
    if (prefersReducedMotion) return;

    const overviewCard = document.querySelector('.overview-card');
    const donutCircle = document.querySelector('#donutRecoveryCircle');
    const donutVal = document.querySelector('#donutRecoveryVal');

    if (overviewCard && donutCircle) {
      ScrollTrigger.create({
        trigger: overviewCard,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          // Circumference 251.32. Target: 78% -> 55.29 offset
          donutCircle.style.strokeDashoffset = '251.32';
          setTimeout(() => {
            donutCircle.style.strokeDashoffset = '55.29';
            if (donutVal) {
              animateCounter(donutVal, 78, 1.3, '%');
            }
          }, 150);

          const items = overviewCard.querySelectorAll('.overview-metric-item');
          if (items.length > 0 && typeof gsap !== 'undefined') {
            gsap.fromTo(
              items,
              { opacity: 0, x: 20 },
              { opacity: 1, x: 0, stagger: 0.12, duration: 0.6, ease: 'power2.out', delay: 0.25 }
            );
          }
        },
      });
    }
  }

  // ==============================================================================
  // 9. INJURY RISK & PRECAUTIONS PROGRESSIVE REVEALS
  // ==============================================================================
  function initInjuryAndPrecautionsAnimations() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const injuryCard = document.querySelector('.injury-risk-card');
    if (injuryCard) {
      ScrollTrigger.create({
        trigger: injuryCard,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.fromTo(
            injuryCard,
            { opacity: 0, y: 25 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
          );

          const rows = injuryCard.querySelectorAll('.injury-row-item');
          if (rows.length > 0) {
            gsap.fromTo(
              rows,
              { opacity: 0, x: -16 },
              { opacity: 1, x: 0, stagger: 0.07, duration: 0.45, ease: 'power2.out', delay: 0.15 }
            );
          }
        },
      });
    }

    const precautionsCard = document.querySelector('.precautions-card');
    if (precautionsCard) {
      ScrollTrigger.create({
        trigger: precautionsCard,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.fromTo(
            precautionsCard,
            { opacity: 0, y: 25 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
          );

          const items = precautionsCard.querySelectorAll('.precaution-item');
          if (items.length > 0) {
            gsap.fromTo(
              items,
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, stagger: 0.08, duration: 0.45, ease: 'power2.out', delay: 0.18 }
            );
          }
        },
      });
    }
  }

  // ==============================================================================
  // 10. RECENT TRAINING SESSIONS TABLE CASCADE
  // ==============================================================================
  function initTrainingSessionsAnimation() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const sessionsCard = document.querySelector('.training-sessions-card');
    if (!sessionsCard) return;

    ScrollTrigger.create({
      trigger: sessionsCard,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.fromTo(
          sessionsCard,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }
        );

        const rows = sessionsCard.querySelectorAll('.custom-data-table tbody tr');
        if (rows.length > 0) {
          gsap.fromTo(
            rows,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, stagger: 0.06, duration: 0.4, ease: 'power2.out', delay: 0.2 }
          );
        }
      },
    });
  }

  // ==============================================================================
  // 11. WHAT-IF PREDICTIVE SIMULATOR & PERIODIZATION MOTION
  // ==============================================================================
  function initWhatIfViewAnimations() {
    if (prefersReducedMotion || typeof gsap === 'undefined') return;

    const whatIfSection = document.querySelector('#view-what-if');
    if (!whatIfSection) return;

    // Transition Flow Card
    const flowCard = whatIfSection.querySelector('.whatif-state-flow-card');
    if (flowCard) {
      ScrollTrigger.create({
        trigger: flowCard,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.fromTo(
            flowCard,
            { opacity: 0, y: 25 },
            { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }
          );

          const nodes = flowCard.querySelectorAll('.flow-node');
          if (nodes.length > 0) {
            gsap.fromTo(
              nodes,
              { opacity: 0, scale: 0.92, y: 12 },
              { opacity: 1, scale: 1, y: 0, stagger: 0.12, duration: 0.5, ease: 'back.out(1.2)', delay: 0.15 }
            );
          }
        },
      });
    }

    // Comparison Scenario Cards
    const compCards = whatIfSection.querySelectorAll('.scenario-comp-card');
    if (compCards.length > 0) {
      ScrollTrigger.create({
        trigger: compCards[0],
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.fromTo(
            compCards,
            { opacity: 0, y: 30, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, stagger: 0.08, duration: 0.65, ease: 'power3.out' }
          );
        },
      });
    }
  }

  // ==============================================================================
  // 12. VIEW SWITCHING HOOK FOR SEAMLESS CINEMATIC TRANSITIONS
  // ==============================================================================
  function initViewTransitionHooks() {
    // Whenever URL hash changes or navigation items are clicked, smoothly animate
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      const targetPanel = document.getElementById(`view-${hash}`);
      if (targetPanel && typeof gsap !== 'undefined' && !prefersReducedMotion) {
        gsap.fromTo(
          targetPanel,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }
        );

        if (lenisInstance) {
          lenisInstance.scrollTo(0, { immediate: true });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (typeof ScrollTrigger !== 'undefined') {
          setTimeout(() => ScrollTrigger.refresh(), 100);
        }
      }
    });

    // Auto-pause Lenis when any modal or drawer is active to prevent scroll jitter
    try {
      const modalObserver = new MutationObserver(() => {
        const hasActiveModal = document.querySelector('.modal.active, .modal-backdrop.active, aside.sidebar.open');
        if (hasActiveModal) {
          if (lenisInstance) lenisInstance.stop();
        } else {
          if (lenisInstance) lenisInstance.start();
        }
      });
      modalObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    } catch (e) {
      console.warn('[motion] Modal observer error:', e);
    }
  }

  // ==============================================================================
  // 13. MASTER INITIALIZATION & PUBLIC API
  // ==============================================================================
  function initAllMotion() {
    initSmoothScroll();
    initHeroAnimations();
    initTwinStatusAnimations();
    initAiRecommendationAnimations();
    initVitalsAnimations();
    initDonutGaugeAnimation();
    initInjuryAndPrecautionsAnimations();
    initTrainingSessionsAnimation();
    initWhatIfViewAnimations();
    initCardTiltInteractions();
    initViewTransitionHooks();

    window.TwinMotion = {
      get lenis() { return lenisInstance; },
      stopScroll: () => { if (lenisInstance) lenisInstance.stop(); },
      startScroll: () => { if (lenisInstance) lenisInstance.start(); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllMotion);
  } else {
    initAllMotion();
  }
})();
