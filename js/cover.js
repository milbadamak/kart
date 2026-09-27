/* ============================================================================
   Cover — state machine (idle → opening → opened) + master GSAP timeline.
   Sub-timelines: seal break · heart light · flap · letter · cover exit.
   Graceful fallback to pure-CSS opening when GSAP is missing / reduced motion.
   ========================================================================== */

(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(pointer: fine)');
  const $ = sel => document.querySelector(sel);

  /* — synthesized sound (no audio files needed) —--------------- */
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function noiseBurst(ctx, duration) {
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const p = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, 1.6) * Math.sin(Math.PI * p);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /* شکستن مهر موم: ترق + کوبه */
  function playCrack() {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    const src = noiseBurst(ctx, .16);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.55, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .16);
    src.connect(bp).connect(hp).connect(g).connect(ctx.destination);
    src.start(t);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + .13);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(.4, t);
    g2.gain.exponentialRampToValueAtTime(.001, t + .15);
    osc.connect(g2).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + .16);
  }

  /* بالا آمدن نامه: هوووو نرم */
  function playWhoosh() {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = .95;

    const src = noiseBurst(ctx, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(5200, t + dur * .65);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.001, t);
    g.gain.linearRampToValueAtTime(.18, t + dur * .3);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(t);
  }

  /* گشودن نهایی: زنگ ظریف طلایی */
  function playShimmer() {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1318.5, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      const start = t + i * .05;
      g.gain.setValueAtTime(.001, start);
      g.gain.linearRampToValueAtTime(.1, start + .04);
      g.gain.exponentialRampToValueAtTime(.001, start + 1.2);
      osc.connect(g).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1.3);
    });
  }

  /* — particles --------------------------------------------------------- */
  function spawnDust(layer, count) {
    for (let i = 0; i < count; i++) {
      const d = document.createElement('span');
      d.className = 'dust';
      const size = 1 + Math.random() * 1.2;
      d.style.width = d.style.height = size.toFixed(1) + 'px';
      d.style.left = (Math.random() * 100).toFixed(2) + '%';
      d.style.top = (Math.random() * 100).toFixed(2) + '%';
      d.style.opacity = (.08 + Math.random() * .17).toFixed(2);
      layer.appendChild(d);
      if (window.gsap && !reduced.matches) {
        gsap.to(d, {
          x: (Math.random() - .5) * 40,
          y: -(14 + Math.random() * 40),
          opacity: .06 + Math.random() * .18,
          duration: 5 + Math.random() * 5,
          delay: Math.random() * 5,
          ease: 'sine.inOut',
          yoyo: true, repeat: -1
        });
      }
    }
  }

  /* gold sparks — only at seal break / heart / opening */
  function sparksAt(layer, x, y, count, minDist, maxDist) {
    if (!window.gsap) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const size = 1.6 + Math.random() * 2.4;
      s.style.width = s.style.height = size.toFixed(1) + 'px';
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      layer.appendChild(s);
      const angle = (Math.PI * 2 * i) / count + Math.random() * .7;
      const dist = minDist + Math.random() * (maxDist - minDist);
      gsap.fromTo(s,
        { x: 0, y: 0, opacity: .9, scale: 1 },
        {
          x: Math.cos(angle) * dist, y: Math.sin(angle) * dist,
          opacity: 0, scale: .2,
          duration: .8 + Math.random() * .5, ease: 'power2.out',
          onComplete: () => s.remove()
        });
    }
  }

  function pointRelativeTo(layer, el) {
    const host = layer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - host.left,
      y: r.top + r.height / 2 - host.top
    };
  }

  /* Champagne bloom — soft, never a white screen (spec 12) */
  function flashBloom(cover) {
    const flash = document.createElement('div');
    flash.className = 'burst-flash';
    cover.appendChild(flash);

    gsap.timeline({ onComplete: () => flash.remove() })
      .set(flash, { scale: 0, opacity: 0 })
      .to(flash, { scale: 1, opacity: .5, duration: .42, ease: 'power2.out' })
      .to(flash, { opacity: 0, duration: .85, ease: 'power2.in' }, '-=0.15');

    const layer = $('#coverParticles');
    if (layer) {
      const p = pointRelativeTo(layer, cover);
      sparksAt(layer, p.x, p.y, 14, 50, 170);
    }
  }

  /* دو نیمهی مهر موم */
  function spawnSealShards(stage) {
    if (!stage || !window.gsap) return;
    [['s-l', -1], ['s-r', 1]].forEach(([cls, dir]) => {
      const wrap = document.createElement('span');
      wrap.className = 'seal-shard-wrap';
      wrap.innerHTML = `<span class="seal-shard ${cls}"></span>`;
      stage.appendChild(wrap);
      gsap.set(wrap, { xPercent: -50, yPercent: -50 });
      gsap.fromTo(wrap,
        { x: 0, y: 0, rotate: 0, opacity: 1 },
        {
          x: dir * (70 + Math.random() * 45), y: 36 + Math.random() * 60,
          rotate: dir * (20 + Math.random() * 22), opacity: 0,
          duration: .85 + Math.random() * .3, ease: 'power2.in',
          onComplete: () => wrap.remove()
        });
    });
  }

  /* — sub-timelines (spec 40) ------------------------------------------- */

  /* Press → seal tension → crack → split */
  function createSealBreakTimeline(els) {
    const tl = gsap.timeline();
    tl.to(els.stage, { scale: .985, duration: .16, ease: 'power2.in' })
      .to(els.stage, { scale: 1, duration: .4, ease: 'power3.out' });

    tl.to(els.seal, { scale: 1.08, duration: .34, ease: 'power2.inOut' }, '-=0.22')
      .to(els.seal, { scale: 1.08, duration: .12 }) /* مکث کشش */
      .add(() => {
        playCrack();
        if (els.seal) els.seal.classList.add('is-cracked');
        if (els.layer && els.seal) {
          const p = pointRelativeTo(els.layer, els.seal);
          sparksAt(els.layer, p.x, p.y, 10, 26, 88);
        }
      })
      .to(els.seal, { opacity: 0, scale: .5, duration: .28, ease: 'power2.in' }, '<')
      .to(els.sealGlow, { scale: 2.2, opacity: 0, duration: .7, ease: 'power2.out' }, '<')
      .add(() => spawnSealShards(els.stage), '<0.04');
    return tl;
  }

  /* Ghost heart + traveling light — exactly one loop, back to start, no jump */
  function createHeartTimeline(cover) {
    const tl = gsap.timeline();
    const heart = $('#heartLight');
    if (!heart) return tl;

    const trail = heart.querySelector('.heart-trail');
    const len = trail ? trail.getTotalLength() : 0;
    if (trail && len) {
      /* dash units are in viewBox space → identical on every viewport */
      gsap.set(trail, { strokeDasharray: `${(len * .16).toFixed(2)} ${len.toFixed(2)}`, strokeDashoffset: 0 });
    }

    tl.set(heart, { opacity: 0, scale: .65, transformOrigin: '50% 55%' })
      .to(heart, { opacity: .8, duration: .55, ease: 'power2.out' })
      .to(heart, { scale: 1, duration: .7, ease: 'power2.out' }, '<');

    if (trail && len) {
      tl.fromTo(trail, { opacity: 0 },
        { opacity: .9, duration: .3, ease: 'power1.in' }, '-=0.35')
        /* نور یک دور کامل: از نقطه شروع، چپ، پایین، راست، بالا، باز به شروع */
        .to(trail, { strokeDashoffset: -len, duration: 2.1, ease: 'none' }, '<')
        .to(trail, { opacity: 0, duration: .35, ease: 'power1.out' }, '-=0.05');
    } else {
      tl.to({}, { duration: 1.6 });
    }

    /* expansion بسیار ظریف سپس fade */
    tl.to(heart, { scale: 1.06, duration: .8, ease: 'power2.inOut' }, '-=0.3')
      .to(heart, { opacity: 0, duration: .7, ease: 'power2.in' }, '-=0.35')
      .add(() => {
        const layer = $('#coverParticles');
        if (layer) {
          const p = pointRelativeTo(layer, cover);
          sparksAt(layer, p.x, p.y, 12, 80, 220);
        }
      }, '>-0.4');
    return tl;
  }

  /* Flap 3D opening with moving light on its edge */
  function createEnvelopeTimeline(els) {
    const tl = gsap.timeline();
    tl.to(els.flap, {
      rotateX: -172, duration: 1.05, ease: 'power3.inOut'
    })
      .fromTo(els.flapFoil, { opacity: .2 },
        { opacity: 1, duration: .5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, '<0.15')
      .to(els.flap, { filter: 'drop-shadow(0 14px 22px rgba(90,64,16,.16))' }, '<')
      .to([els.envBack, els.envFront, els.envSides], {
        opacity: .2, scale: .93, y: 12, duration: 1.1, ease: 'power2.out'
      }, '-=1.0');
    return tl;
  }

  /* Letter: peek → rise in two beats (spec 14) → fold opens with shadow */
  function createLetterTimeline(els) {
    const tl = gsap.timeline();
    tl.set(els.letter, { opacity: 1, zIndex: 6 })
      .add(() => playWhoosh())
      .to(els.letter, { yPercent: -9, scale: .97, duration: .55, ease: 'power2.out' })
      .to(els.letter, { yPercent: -56, scale: 1, duration: .8, ease: 'power2.out' })
      .to(els.fold, {
        rotateX: -168, duration: .85, ease: 'power3.inOut',
        boxShadow: '0 -14px 22px -12px rgba(90, 64, 16, .45)'
      }, '-=0.5')
      .fromTo('.letter-inner > *', { opacity: 0, y: 12, filter: 'blur(4px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: .5, stagger: .07, ease: 'power2.out' },
        '-=0.6');
    return tl;
  }

  /* Cover exit — never a sudden disappear (spec 24) */
  function createCoverExitTimeline(cover) {
    const tl = gsap.timeline();
    tl.to(cover, { filter: 'brightness(1.05)', duration: .5, ease: 'sine.out' }, 0)
      .to(cover, {
        opacity: 0, filter: 'blur(8px) brightness(1.08)', scale: 1.03,
        duration: 1.05, ease: 'power2.inOut',
        onComplete: () => revealSite(cover)
      }, '+=0.25')
      .set(cover, { visibility: 'hidden', pointerEvents: 'none' });
    return tl;
  }

  function revealSite(cover) {
    cover.classList.add('is-open');
    cover.setAttribute('aria-hidden', 'true');
    cover.setAttribute('inert', '');
    const site = $('#site');
    if (site) {
      site.classList.add('visible');
      site.removeAttribute('aria-hidden');
    }
    document.body.classList.add('site-open');
  }

  /* — Cover controller --------------------------------------------------- */
  const Cover = {
    init(onOpen) {
      const stage = $('#openCard');
      const cover = $('#cover');
      const layer = $('#coverParticles');
      if (!stage || !cover) return;

      this.stage = stage;
      this.cover = cover;
      this.onOpen = onOpen;
      this.state = 'idle'; /* idle | opening | opened */

      if (layer) spawnDust(layer, window.innerWidth < 620 ? 14 : 26);

      const animated = window.gsap && !reduced.matches;
      if (animated) {
        const seal = stage.querySelector('.seal');
        const sealGlow = stage.querySelector('.seal-glow');
        gsap.set(stage, { transformPerspective: 1000 });
        if (seal) gsap.set(seal, { xPercent: -50, yPercent: -50, x: 0, y: 0 });
        if (sealGlow) gsap.set(sealGlow, { xPercent: -50, yPercent: -50, x: 0, y: 0 });

        /* seal breathing: 1 → 1.025, light .35 → .65, one cycle ~3.4s (spec 7) */
        if (seal) this.sealBreath = gsap.to(seal, {
          scale: 1.025, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1
        });
        if (sealGlow) this.glowBreath = gsap.fromTo(sealGlow,
          { opacity: .35, scale: 1 },
          { opacity: .65, scale: 1.08, duration: 1.7, ease: 'sine.inOut', yoyo: true, repeat: -1 });

        this.float = gsap.to(stage, {
          y: -7, duration: 5.2, ease: 'sine.inOut', yoyo: true, repeat: -1
        });
        /* Parallax only on fine pointers; tiny range (spec 18/19) */
        if (fine.matches) {
          this.onPointerMove = e => {
            if (this.state !== 'idle') return;
            const px = e.clientX / window.innerWidth - .5;
            const py = e.clientY / window.innerHeight - .5;
            gsap.to(stage, {
              rotateY: px * 5, rotateX: -py * 3,
              duration: 1.4, ease: 'power2.out', overwrite: 'auto'
            });
          };
          window.addEventListener('pointermove', this.onPointerMove);
        }
      }

      stage.addEventListener('click', () => this.open());
    },

    open() {
      const { stage, cover } = this;
      if (!stage || this.state !== 'idle') return;
      this.state = 'opening';

      /* Safety: only fires if the real timeline somehow stalled (spec 42) */
      const safety = window.setTimeout(() => {
        if (this.state !== 'opened') {
          this.state = 'opened';
          revealSite(cover);
          if (this.onOpen) this.onOpen();
        }
      }, 12000);

      if (this.onPointerMove) window.removeEventListener('pointermove', this.onPointerMove);
      if (this.float) this.float.kill();
      if (this.sealBreath) this.sealBreath.kill();
      if (this.glowBreath) this.glowBreath.kill();
      if (window.gsap) gsap.killTweensOf([stage, stage.querySelector('.seal'), stage.querySelector('.seal-glow')]);

      const els = {
        stage, cover,
        seal: stage.querySelector('.seal'),
        sealGlow: stage.querySelector('.seal-glow'),
        flap: stage.querySelector('.flap'),
        flapFoil: stage.querySelector('.flap-foil'),
        letter: stage.querySelector('.letter'),
        fold: stage.querySelector('.letter-fold'),
        envBack: stage.querySelector('.env-back'),
        envFront: stage.querySelector('.env-front'),
        envSides: stage.querySelector('.env-sides'),
        label: stage.querySelector('.open-label'),
        layer: $('#coverParticles')
      };

      if (reduced.matches || !window.gsap) {
        /* بدون GSAP: تایمینگ CSS؛ نامه بیرون میآید */
        cover.classList.add('is-opening');
        playCrack();
        window.setTimeout(playShimmer, 260);
        window.setTimeout(() => {
          clearTimeout(safety);
          this.state = 'opened';
          revealSite(cover);
          if (this.onOpen) this.onOpen();
        }, reduced.matches ? 200 : 3200);
        return;
      }

      /* Master timeline (spec 11 → 45) */
      gsap.timeline({
        defaults: { ease: 'power3.out' },
        onComplete: () => {
          clearTimeout(safety);
          this.state = 'opened';
          if (this.onOpen) this.onOpen();
        }
      })
        .to(els.label, { opacity: 0, duration: .3 })
        .add(createSealBreakTimeline(els), '-=0.1')
        .add(createHeartTimeline(cover), '>-0.45')
        .add(() => playShimmer(), '<')
        .add(createEnvelopeTimeline(els), '>-0.7')
        .add(createLetterTimeline(els), '<0.25')
        .add(() => flashBloom(cover), '-=1.1')
        .add(createCoverExitTimeline(cover), '>-=0.35');
    }
  };

  window.Cover = Cover;
})();
