/* ============================================================================
   App — countdown, evening timeline, scroll reveals, music, serverless RSVP
   ========================================================================== */

(function () {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const fa = value => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cfg = window.weddingConfig || {};

  /* — evening timeline ------------------------------------------------ */
  const TIMELINE_ICONS = [
    '<circle cx="9" cy="15" r="6"/><circle cx="15" cy="15" r="6"/>',
    '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.5 2.9-5.5 6.5-5.5s6.5 2 6.5 5.5"/>',
    '<path d="M7.5 4h9l-1 6.2a3.5 3.5 0 0 1-7 0z"/><path d="M12 13.7V21"/><path d="M8.5 21h7"/>',
    '<circle cx="8" cy="17" r="2.4"/><path d="M10.4 17V5h6M10.4 9h6"/>',
    '<path d="M18 15.5A7.5 7.5 0 1 1 8.5 6 6 6 0 0 0 18 15.5z"/><circle cx="17.5" cy="6.5" r="1.1"/>'
  ];

  function buildTimeline() {
    const target = $('#timeline');
    if (!target || !cfg.events) return;
    target.innerHTML = cfg.events.map((item, i) => {
      const icon = TIMELINE_ICONS[i % TIMELINE_ICONS.length];
      return `
      <article class="timeline-item reveal">
        <span class="timeline-dot" aria-hidden="true"></span>
        <div class="timeline-head">
          <span class="timeline-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>
          <div class="timeline-time">${item.time}</div>
        </div>
        <div class="timeline-title">${item.title}</div>
        <div class="timeline-desc">${item.description}</div>
      </article>`;
    }).join('');
  }

  /* — countdown ------------------------------------------------------- */
  function updateCountdown() {
    const target = cfg.date ? new Date(cfg.date).getTime() : 0;
    let diff = Math.max(target - Date.now(), 0);
    const units = {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff / 3600000) % 24),
      minutes: Math.floor((diff / 60000) % 60),
      seconds: Math.floor((diff / 1000) % 60)
    };
    Object.entries(units).forEach(([key, value]) => {
      const el = $(`[data-unit="${key}"]`);
      if (el) el.textContent = fa(String(value).padStart(2, '0'));
    });
  }

  /* — Jalali date rendering (single source of truth: cfg.date) ---------- */
  const JALALI_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور',
    'مهر','آبان','آذر','دی','بهمن','اسفند'];
  const JALALI_WEEKDAYS = ['ش','ی','د','س','چ','پ','ج'];
  const JALALI_MONTHS_LATIN = ['Farvardin','Ordibehesht','Khordad','Tir','Mordad','Shahrivar',
    'Mehr','Aban','Azar','Dey','Bahman','Esfand'];

  /* تبدیل میلادی به شمسی — الگوریتم استاندارد */
  function gregorianToJalali(gy, gm, gd) {
    const gDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
      + Math.floor((gy2 + 399) / 400) + gd + gDays[gm - 1];
    let jy = -1595 + 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return { jy, jm, jd };
  }

  /* مبدل اصلی: تقویم شمسی مرورگر (ICL) با fallback روی الگوریتم */
  function toJalali(date) {
    try {
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
        timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric', day: 'numeric'
      }).formatToParts(date);
      const get = type => Number(parts.find(p => p.type === type).value);
      const j = { jy: get('year'), jm: get('month'), jd: get('day') };
      if (j.jy > 1300 && j.jm >= 1 && j.jm <= 12 && j.jd >= 1 && j.jd <= 31) return j;
    } catch (e) { /* fallback below */ }
    const g = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = type => Number(g.find(p => p.type === type).value);
    return gregorianToJalali(get('year'), get('month'), get('day'));
  }

  /* طول ماه شمسی: ۳۱ روز برای شش ماه اول، ۳۰ برای پنج ماه بعد، اسفند کبیسه ۳۰ */
  function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    /* اسفند: اگر ۲۹ام اسفند، روز بعد نوروز سال بعد باشد، کبیسه است */
    const base = jYtoGregorian(jy, 12, 29);
    if (!base) return 29;
    const next = new Date(base.getTime() + 86400000);
    return toJalali(next).jm === 12 ? 30 : 29;
  }

  function jYtoGregorian(jy, jm, jd) {
    /* جستجو در پنجرهٔ یک ساله پیرامون برآورد اولیه */
    const approx = new Date(Date.UTC(jy + 621, 2, 21));
    for (let i = -380; i <= 380; i++) {
      const d = new Date(approx.getTime() + i * 86400000);
      const j = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      if (j.jy === jy && j.jm === jm && j.jd === jd) return d;
    }
    return null;
  }

  /* شمسی‌سازی تمام تاریخ‌های صفحه از روی cfg.date */
  function renderDates() {
    if (!cfg.date) return;
    const target = new Date(cfg.date);
    if (isNaN(target.getTime())) return;

    const j = toJalali(target);
    const jDay = fa(String(j.jd));
    const jMonth = JALALI_MONTHS[j.jm - 1];
    const jYear = fa(String(j.jy));
    const latinMonth = JALALI_MONTHS_LATIN[j.jm - 1];

    /* روز اول ماه شمسی = تاریخ مراسم منهای (روز ماه - ۱) */
    const firstOfMonth = new Date(target.getTime() - (j.jd - 1) * 86400000);
    /* شنبه = ۰ در ترازبندی شمسی (getDay: یکشنبه=۰) */
    const startBlank = (firstOfMonth.getDay() + 1) % 7;

    setText('[data-d="day"]', jDay);
    setText('[data-d="month"]', jMonth);
    setText('[data-d="year"]', jYear);
    setText('[data-d="dmy"]', `${jDay} ${jMonth} ${jYear}`);
    setText('[data-d="latin"]', `${j.jd} ${latinMonth} ${j.jy}`);
    setText('[data-c="month"]', jMonth);
    setText('[data-c="month2"]', jMonth);
    setText('[data-c="year"]', jYear);
    setText('[data-c="day"]', jDay);

    buildCalendarGrid(j, startBlank);
  }

  function setText(selector, value) {
    $$(selector).forEach(el => { el.textContent = value; });
  }

  /* تقویم ماه مراسم به‌صورت پویا */
  function buildCalendarGrid(j, startBlank) {
    const grid = $('#calendarGrid');
    if (!grid) return;
    const monthLen = jalaliMonthLength(j.jy, j.jm);
    let html = '';
    JALALI_WEEKDAYS.forEach(d => { html += `<span>${d}</span>`; });
    for (let i = 0; i < startBlank; i++) html += '<span></span>';
    for (let day = 1; day <= monthLen; day++) {
      const isWedding = day === j.jd;
      html += isWedding
        ? `<span class="heart-day">${fa(String(day))}<i>♥</i></span>`
        : `<span>${fa(String(day))}</span>`;
    }
    /* تعداد سلول‌ها باید مضرب ۷ باشد — padding پایانی */
    const pad = (7 - ((startBlank + monthLen) % 7)) % 7;
    for (let i = 0; i < pad; i++) html += '<span></span>';
    grid.innerHTML = html;
    grid.setAttribute('aria-label', `تقویم ${JALALI_MONTHS[j.jm - 1]} ${fa(String(j.jy))}`);
  }

  /* — scroll reveals (GSAP + ScrollTrigger) --------------------------- */
  let revealsReady = false;
  function initReveals() {
    if (revealsReady) return;
    revealsReady = true;

    if (!window.gsap || !window.ScrollTrigger || reduced.matches) return;

    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add('js-anim');

    /* stagger reveals that share a parent; direction varies per section */
    const groups = new Map();
    $$('.reveal').forEach(el => {
      const parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });

    /* keep sideways reveals inside the viewport on narrow screens */
    const xOff = Math.min(46, Math.round(window.innerWidth * .08));

    groups.forEach(els => els.forEach((el, i) => {
      const from = { opacity: 0, y: 26, filter: 'blur(6px)' };
      const section = el.closest('.section');
      const variant = section ? section.dataset.reveal : '';
      if (variant === 'rise') { from.y = 60; from.scale = .96; }
      else if (variant === 'left') { from.x = xOff; from.y = 0; }
      else if (variant === 'right') { from.x = -xOff; from.y = 0; }
      else if (variant === 'zoom') { from.scale = .9; from.y = 0; }

      const anim = gsap.fromTo(el,
        from,
        { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', duration: 1.05, delay: i * .08, ease: 'power3.out', paused: true }
      );
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true, animation: anim
      });
    }));

    /* draw the foil rules outward from the centre */
    $$('.ornament-line span, .footer-rule span, .section-head span').forEach(el => {
      gsap.fromTo(el,
        { scaleX: 0 },
        {
          scaleX: 1, duration: 1.1, ease: 'power3.out', transformOrigin: 'center',
          scrollTrigger: { trigger: el.closest('.ornament-line, .footer-rule, .section-head'), start: 'top 92%', once: true }
        });
    });

    /* slow orbit drift + venue parallax */
    gsap.to('.orbit-one', {
      rotate: 42,
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.6 }
    });
    gsap.to('.orbit-two', {
      rotate: -36,
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.6 }
    });
    const venueImg = $('.venue-visual img');
    if (venueImg) {
      gsap.fromTo(venueImg, { y: -24 }, {
        y: 24,
        scrollTrigger: { trigger: '.venue-visual', start: 'top bottom', end: 'bottom top', scrub: 1.6 }
      });
    }

    ScrollTrigger.refresh();
  }

  /* — music ----------------------------------------------------------- */
  const audio = $('#audio');
  const musicPrompt = $('#musicPrompt');
  const musicToggle = $('#musicToggle');
  const musicStatus = $('#musicStatus');

  function setMusicStatus(text, playing) {
    const label = musicStatus && musicStatus.querySelector('span:last-child');
    if (label) label.textContent = text;
    if (musicStatus) musicStatus.classList.toggle('playing', !!playing);
  }

  let modalLastFocus = null;
  function modalFocusables() {
    return $$('button, [href], input, select, textarea', musicPrompt)
      .filter(el => !el.disabled && el.offsetParent !== null);
  }
  function trapModalKeys(e) {
    if (!musicPrompt || !musicPrompt.classList.contains('open')) return;
    if (e.key === 'Escape') { closeMusicPrompt(); return; }
    if (e.key !== 'Tab') return;
    const f = modalFocusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    else if (!musicPrompt.contains(document.activeElement)) { first.focus(); e.preventDefault(); }
  }

  function closeMusicPrompt() {
    if (!musicPrompt || !musicPrompt.classList.contains('open')) return;
    musicPrompt.classList.remove('open');
    musicPrompt.setAttribute('aria-hidden', 'true');
    if (modalLastFocus && modalLastFocus.isConnected) modalLastFocus.focus();
    modalLastFocus = null;
  }

  function openMusicPrompt() {
    if (!musicPrompt || musicPrompt.classList.contains('open')) return;
    modalLastFocus = document.activeElement;
    musicPrompt.classList.add('open');
    musicPrompt.setAttribute('aria-hidden', 'false');
    const yes = $('#musicYes');
    if (yes) window.setTimeout(() => yes.focus(), 80);
  }

  async function playMusic() {
    if (!audio) return;
    try {
      if (!audio.src) audio.src = cfg.audio || '';
      await audio.play();
      musicToggle.hidden = false;
      musicToggle.classList.add('playing');
      setMusicStatus('موسیقی در حال پخش', true);
    } catch (err) {
      setMusicStatus('موسیقی در دسترس نیست', false);
      musicToggle.hidden = false;
    }
    closeMusicPrompt();
  }

  function pauseMusic() {
    if (!audio) return;
    audio.pause();
    musicToggle.classList.remove('playing');
    setMusicStatus('موسیقی خاموش', false);
  }

  function initMusic() {
    if (!audio) return;
    $('#musicYes') && $('#musicYes').addEventListener('click', playMusic);
    $('#musicNo') && $('#musicNo').addEventListener('click', closeMusicPrompt);
    $('#musicClose') && $('#musicClose').addEventListener('click', closeMusicPrompt);
    const backdrop = $('.invite-modal-backdrop');
    backdrop && backdrop.addEventListener('click', closeMusicPrompt);
    musicToggle && musicToggle.addEventListener('click', () =>
      audio.paused ? playMusic() : pauseMusic());
    audio.addEventListener('error', () => setMusicStatus('موسیقی خاموش', false));
  }

  /* — RSVP (no backend: WhatsApp / e-mail + local record) ------------- */
  const STORE_KEY = 'wedding:rsvp';

  function initRsvp() {
    const form = $('#rsvpForm');
    if (!form) return;

    const fieldName = $('#field-name');
    const inputName = $('#rsvpName');
    const fieldGuests = $('#field-guests');
    const selectGuests = $('#rsvpGuests');
    const note = $('#rsvpNote');
    const done = $('#rsvpDone');
    const thanks = $('#rsvpThanks');
    const waLink = $('#rsvpWhatsapp');
    if (waLink && cfg.rsvp && cfg.rsvp.whatsapp) {
      waLink.href = `https://wa.me/${cfg.rsvp.whatsapp}`;
    }

    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.name) inputName.value = saved.name;

    function goToStep(n) {
      form.querySelectorAll('.rsvp-step').forEach(s => s.classList.add('rsvp-hidden'));
      const target = form.querySelector('[data-step="' + n + '"]');
      if (target) target.classList.remove('rsvp-hidden');
      form.querySelectorAll('.rsvp-dot').forEach(d => d.classList.toggle('active', +d.dataset.dot === n));
    }

    form.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-goto]');
      if (!btn) return;
      var goto = +btn.dataset.goto;
      if (goto === 2 && !inputName.value.trim()) {
        fieldName.setAttribute('data-invalid', 'true');
        inputName.focus();
        return;
      }
      fieldName.removeAttribute('data-invalid');
      goToStep(goto);
    });

    $$('input[name="attending"]').forEach(radio =>
      radio.addEventListener('change', () => {
        fieldGuests.classList.toggle('rsvp-hidden', radio.value !== 'yes');
      }));

    inputName.addEventListener('input', () => fieldName.removeAttribute('data-invalid'));

    form.addEventListener('submit', event => {
      event.preventDefault();
      const name = inputName.value.trim();
      if (!name) {
        fieldName.setAttribute('data-invalid', 'true');
        inputName.focus();
        return;
      }

      const attending = (form.querySelector('input[name="attending"]:checked') || {}).value === 'yes';
      const guestsSel = selectGuests ? selectGuests.value : '';
      const guestCount = Number(guestsSel.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) || 0;

      const lines = [
        'دعوتنامه سوگل و امیرحسین — پاسخ حضور',
        `نام: ${name}`,
        attending
          ? (guestCount === 0
            ? 'حضور: بله، فقط خودم'
            : `حضور: بله، ${fa(String(guestCount))} نفر همراه`)
          : 'حضور: متأسفانه نمیتوانم'
      ];
      const noteText = note ? note.value.trim() : '';
      if (noteText) lines.push(`پیام: ${noteText}`);

      const message = lines.join('\n');
      if (cfg.rsvp && cfg.rsvp.whatsapp) {
        waLink.href = `https://wa.me/${cfg.rsvp.whatsapp}?text=${encodeURIComponent(message)}`;
      }

      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ name, attending, guests: guestCount, note: noteText, at: Date.now() }));
      } catch (e) { /* storage may be unavailable — the share links still work */ }

      thanks.textContent = `${name} عزیز، پاسخ شما ثبت شد`;
      form.classList.add('rsvp-hidden');
      done.classList.remove('rsvp-hidden');
    });

    const reset = $('#rsvpReset');
    reset && reset.addEventListener('click', () => {
      done.classList.add('rsvp-hidden');
      form.classList.remove('rsvp-hidden');
      inputName.focus();
    });
  }

  /* — cursor halo ----------------------------------------------------- */
  function initCursorGlow() {
    const glow = $('.cursor-glow');
    if (!glow) return;
    window.addEventListener('pointermove', e => {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    });
  }

  /* — cover → site handover ------------------------------------------- */
  function onCoverOpen() {
    initReveals();
    /* ScrollTrigger measured positions while body was overflow:hidden —
       refresh once the real layout settles after the cover fades */
    window.setTimeout(() => {
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }, 1800);
    window.setTimeout(openMusicPrompt, 1500);
  }

  /* — scroll progress ribbon ------------------------------------------ */
  function initScrollProgress() {
    const bar = $('#scrollBar');
    if (!bar) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const fraction = max > 0 ? doc.scrollTop / max : 0;
      bar.style.transform = `scaleX(${Math.min(fraction, 1)})`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* — boot ------------------------------------------------------------ */
  function init() {
    buildTimeline();
    updateCountdown();
    window.setInterval(updateCountdown, 1000);
    renderDates();

    initCursorGlow();
    initMusic();
    initRsvp();
    initScrollProgress();

    if (window.Cover) window.Cover.init(onCoverOpen);

    document.addEventListener('keydown', trapModalKeys);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
