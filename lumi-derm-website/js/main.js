const header = document.querySelector("[data-header]");
const navToggle = document.querySelector("[data-nav-toggle]");
const navMenu = document.querySelector("[data-nav-menu]");
const faqButtons = document.querySelectorAll("[data-faq-button]");
const revealItems = document.querySelectorAll("[data-reveal]");
const filterButtons = document.querySelectorAll("[data-filter]");
const treatmentCards = document.querySelectorAll("[data-treatment-category]");
const currentPath = window.location.pathname.split("/").pop() || "index.html";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setHeaderState() {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 18);
}

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navMenu.classList.toggle("is-open", !isOpen);
    header?.classList.toggle("menu-active", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
  });

  navMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement)) return;
    navToggle.setAttribute("aria-expanded", "false");
    navMenu.classList.remove("is-open");
    header?.classList.remove("menu-active");
    document.body.classList.remove("menu-open");
  });
}

document.querySelectorAll("a[href^='#']").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

faqButtons.forEach((button) => {
  const answer = document.getElementById(button.getAttribute("aria-controls"));
  button.addEventListener("click", () => {
    const isExpanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!isExpanded));
    if (answer) {
      answer.style.maxHeight = isExpanded ? "0px" : `${answer.scrollHeight}px`;
    }
  });
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter || "all";
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    treatmentCards.forEach((card) => {
      const categories = (card.dataset.treatmentCategory || "").split(" ");
      card.classList.toggle("is-hidden", filter !== "all" && !categories.includes(filter));
    });
  });
});

function initFallbackReveals() {
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -42px 0px" }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

function initGsapMotion() {
  if (prefersReducedMotion || !window.gsap || !window.ScrollTrigger) {
    initFallbackReveals();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  revealItems.forEach((item) => item.classList.add("is-visible"));

  gsap.from(".hero .eyebrow, .hero h1, .hero .lead, .hero-actions, .trust-badges", {
    y: 28,
    opacity: 0,
    duration: 0.9,
    ease: "power3.out",
    stagger: 0.09
  });

  gsap.from(".hero-visual .visual-card", {
    y: 36,
    scale: 0.96,
    opacity: 0,
    duration: 1,
    ease: "power3.out",
    delay: 0.16
  });

  gsap.utils.toArray("[data-animate='fade-up']").forEach((item) => {
    gsap.from(item, {
      scrollTrigger: {
        trigger: item,
        start: "top 86%",
        once: true
      },
      y: 42,
      opacity: 0,
      duration: 0.82,
      ease: "power3.out",
      immediateRender: false
    });
  });

  gsap.utils.toArray(".treatment-card, .price-card, .review-card, .gallery-item").forEach((item, index) => {
    gsap.from(item, {
      scrollTrigger: {
        trigger: item,
        start: "top 90%",
        once: true
      },
      y: 38,
      opacity: 0,
      duration: 0.68,
      delay: (index % 3) * 0.05,
      ease: "power2.out",
      immediateRender: false
    });
  });

  gsap.to(".hero-visual img", {
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: true
    },
    yPercent: 8,
    ease: "none"
  });
}

function initCarousels() {
  document.querySelectorAll("[data-carousel]").forEach((carousel) => {
    const track = carousel.querySelector(".carousel-track");
    const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
    const prev = carousel.querySelector("[data-carousel-prev]");
    const next = carousel.querySelector("[data-carousel-next]");
    const dotsWrap = carousel.querySelector("[data-carousel-dots]");
    if (!track || slides.length < 2 || !dotsWrap) return;

    let index = 0;
    let timer;
    const dots = slides.map((_, dotIndex) => {
      const button = document.createElement("button");
      button.className = "carousel-dot";
      button.type = "button";
      button.setAttribute("aria-label", `Go to treatment ${dotIndex + 1}`);
      button.addEventListener("click", () => goTo(dotIndex, true));
      dotsWrap.appendChild(button);
      return button;
    });

    function update() {
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === index));
      dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === index));
    }

    function goTo(nextIndex, userAction = false) {
      index = (nextIndex + slides.length) % slides.length;
      update();
      if (userAction) restart();
    }

    function start() {
      if (prefersReducedMotion) return;
      timer = window.setInterval(() => goTo(index + 1), 4800);
    }

    function stop() {
      window.clearInterval(timer);
    }

    function restart() {
      stop();
      start();
    }

    prev?.addEventListener("click", () => goTo(index - 1, true));
    next?.addEventListener("click", () => goTo(index + 1, true));
    carousel.addEventListener("mouseenter", stop);
    carousel.addEventListener("mouseleave", start);
    carousel.addEventListener("focusin", stop);
    carousel.addEventListener("focusout", start);
    update();
    start();
  });
}

initGsapMotion();
initCarousels();

document.querySelectorAll("[data-nav-link]").forEach((link) => {
  const href = link.getAttribute("href") || "";
  const target = href.split("/").pop() || "index.html";
  if (target === currentPath) {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }
});
