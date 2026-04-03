/* ══════════════════════════════════════════════
   CORTOBA — Project Page JS (shared)
   Lightbox + Other Projects + Next Project
   ══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── All known projects (hardcoded + dynamic merged) ──
  var STATIC_PROJECTS = [
    { slug: 'villa-djerba',       title: 'Villa Djerba',         category: 'Résidentiel',      location: 'Midoun, Djerba',   img: '/img/Projets/p1.jpg' },
    { slug: 'maison-sousse',      title: 'Maison Contemporaine', category: 'Résidentiel',      location: 'Sousse, Tunisie',  img: '/img/Projets/p2.jpg' },
    { slug: 'appartement-tunis',  title: 'Appartement Tunis',    category: 'Design Intérieur', location: 'Tunis, Tunisie',   img: '/img/Projets/p3.jpg' },
    { slug: 'bureau-midoun',      title: 'Bureaux Midoun',       category: 'Commercial',       location: 'Midoun, Djerba',   img: '/img/Projets/p4.jpg' },
    { slug: 'villa-nabeul',       title: 'Villa Nabeul',         category: 'Résidentiel',      location: 'Nabeul, Tunisie',  img: '/img/Projets/p5.jpg' },
    { slug: 'villa-maroc',        title: 'Villa Marrakech',      category: 'International',    location: 'Marrakech, Maroc', img: '/img/Projets/p6.jpg' }
  ];

  var currentSlug = document.body.getAttribute('data-project-slug') || '';
  var allProjects = STATIC_PROJECTS.slice();
  var lbImages = [];
  var lbIdx = 0;
  var nextProject = null;

  // ── Fetch dynamic projects and merge ──
  function init() {
    fetch('cortoba-plateforme/api/published_projects.php')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.data) {
          data.data.forEach(function (p) {
            var imgs = Array.isArray(p.gallery_images) ? p.gallery_images : [];
            var hero = p.hero_image || (imgs[0] || '');
            // Don't duplicate if slug matches a static one
            var exists = allProjects.some(function (s) { return s.slug === p.slug; });
            if (!exists) {
              allProjects.push({
                slug: p.slug,
                title: p.title,
                category: p.category || '',
                location: (p.location || '') + (p.country ? ', ' + p.country : ''),
                img: hero
              });
            }
          });
        }
      })
      .catch(function () { })
      .finally(function () {
        buildOtherProjects();
        findNextProject();
      });

    collectImages();
    createLightbox();
    bindHero();
  }

  // ── Collect all gallery images ──
  function collectImages() {
    var heroImg = document.querySelector('.project-hero img');
    if (heroImg) lbImages.push(heroImg.src);

    document.querySelectorAll('.project-photos img').forEach(function (img) {
      lbImages.push(img.src);
    });
  }

  // ── Bind hero click ──
  function bindHero() {
    var hero = document.querySelector('.project-hero');
    if (hero) {
      hero.addEventListener('click', function () { openLightbox(0); });
    }
    // Bind gallery photo clicks
    document.querySelectorAll('.project-photos img').forEach(function (img, i) {
      img.addEventListener('click', function () { openLightbox(i + 1); }); // +1 because hero is index 0
    });
  }

  // ── Find next project ──
  function findNextProject() {
    if (!currentSlug) return;
    var idx = -1;
    allProjects.forEach(function (p, i) { if (p.slug === currentSlug) idx = i; });
    if (idx >= 0 && allProjects.length > 1) {
      var nextIdx = (idx + 1) % allProjects.length;
      nextProject = allProjects[nextIdx];
    }
  }

  // ── Build "Autres projets" section ──
  function buildOtherProjects() {
    var container = document.getElementById('otherProjectsGrid');
    if (!container) return;

    var others = allProjects.filter(function (p) { return p.slug !== currentSlug; });
    if (others.length === 0) {
      container.parentElement.style.display = 'none';
      return;
    }

    // Show all other projects
    var show = others;
    container.innerHTML = show.map(function (p) {
      return '<a href="projet-' + esc(p.slug) + '.html" class="other-project-card">' +
        '<img src="' + esc(p.img) + '" alt="' + esc(p.title) + '" />' +
        '<div class="other-project-card-overlay">' +
        '<span class="other-project-card-tag">' + esc(p.category) + '</span>' +
        '<div class="other-project-card-title">' + esc(p.title) + '</div>' +
        '<div class="other-project-card-loc">' + esc(p.location) + '</div>' +
        '</div></a>';
    }).join('');
  }

  // ── Lightbox ──
  var lb, lbImg, lbCounter, lbNextPanel;

  function createLightbox() {
    lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.id = 'lb';
    lb.innerHTML =
      '<button class="lb-close" id="lbClose">&times;</button>' +
      '<button class="lb-arrow lb-prev" id="lbPrev">&#8249;</button>' +
      '<img id="lbImg" src="" alt="" />' +
      '<button class="lb-arrow lb-next" id="lbNextBtn">&#8250;</button>' +
      '<div class="lb-counter" id="lbCounter"></div>' +
      '<a class="lb-next-project" id="lbNextProject" href="#" style="display:none">' +
      '<span class="lb-next-project-label">Projet suivant</span>' +
      '<span class="lb-next-project-title" id="lbNextTitle"></span>' +
      '<span class="lb-next-project-loc" id="lbNextLoc"></span>' +
      '<span class="lb-next-project-arrow">&#8594;</span>' +
      '</a>';
    document.body.appendChild(lb);

    lbImg = document.getElementById('lbImg');
    lbCounter = document.getElementById('lbCounter');
    lbNextPanel = document.getElementById('lbNextProject');

    document.getElementById('lbClose').addEventListener('click', closeLightbox);
    document.getElementById('lbPrev').addEventListener('click', function (e) { e.stopPropagation(); lbNav(-1); });
    document.getElementById('lbNextBtn').addEventListener('click', function (e) { e.stopPropagation(); lbNav(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });

    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') lbNav(1);
      if (e.key === 'ArrowLeft') lbNav(-1);
    });

    // Swipe support
    var touchStartX = 0;
    lb.addEventListener('touchstart', function (e) { touchStartX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) lbNav(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function openLightbox(i) {
    if (lbImages.length === 0) return;
    lbIdx = i;
    updateLb();
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  function lbNav(dir) {
    var newIdx = lbIdx + dir;
    // If going past last image and there's a next project, show next project panel
    if (newIdx >= lbImages.length && nextProject) {
      showNextProjectPanel();
      return;
    }
    if (newIdx < 0 && lbNextPanel.style.display !== 'none') {
      // Coming back from next project panel
      lbNextPanel.style.display = 'none';
      lbImg.style.display = '';
      document.getElementById('lbPrev').style.display = '';
      document.getElementById('lbNextBtn').style.display = '';
      lbCounter.style.display = '';
      newIdx = lbImages.length - 1;
    }
    lbIdx = (newIdx + lbImages.length) % lbImages.length;
    // If we were showing next project panel, hide it
    if (lbNextPanel.style.display !== 'none' && dir < 0) {
      lbNextPanel.style.display = 'none';
      lbImg.style.display = '';
      document.getElementById('lbPrev').style.display = '';
      document.getElementById('lbNextBtn').style.display = '';
      lbCounter.style.display = '';
    }
    updateLb();
  }

  function updateLb() {
    lbImg.src = lbImages[lbIdx];
    lbImg.style.display = '';
    lbNextPanel.style.display = 'none';
    document.getElementById('lbPrev').style.display = '';
    document.getElementById('lbNextBtn').style.display = '';
    lbCounter.style.display = '';
    lbCounter.textContent = (lbIdx + 1) + ' / ' + lbImages.length;
  }

  function showNextProjectPanel() {
    if (!nextProject) return;
    lbImg.style.display = 'none';
    document.getElementById('lbPrev').style.display = 'none';
    document.getElementById('lbNextBtn').style.display = 'none';
    lbCounter.style.display = 'none';
    lbNextPanel.style.display = 'flex';
    lbNextPanel.href = 'projet-' + nextProject.slug + '.html';
    document.getElementById('lbNextTitle').textContent = nextProject.title;
    document.getElementById('lbNextLoc').textContent = nextProject.location;
  }

  // ── Helpers ──
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // Expose for inline onclick if needed
  window.openLightbox = openLightbox;
  window.closeLightbox = closeLightbox;

  // ── Init on DOM ready ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
