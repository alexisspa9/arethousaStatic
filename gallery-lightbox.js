/*
 * gallery-lightbox.js — dependency-free lightbox for the static Photo Gallery (BWG) thumbnails.
 *
 * The WordPress Photo Gallery plugin opened its lightbox by fetching popup HTML
 * from admin-ajax.php, which does not exist in this static export. This script
 * replaces it: clicking any thumbnail (a.bwg-a) opens the full-size image in an
 * overlay with previous/next navigation. Photos are grouped per gallery
 * (per .bwg_container), so each gallery on a page is its own slideshow.
 *
 * Controls: click backdrop / X / Esc to close, arrows or ←/→ keys to navigate,
 * swipe left/right on touch devices.
 */
(function () {
  'use strict';

  var CSS = [
    '.glb-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(10,10,10,.94);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s ease;touch-action:pan-y;-webkit-user-select:none;user-select:none}',
    '.glb-overlay.glb-open{opacity:1}',
    '.glb-stage{position:relative;max-width:100vw;max-height:100vh;display:flex;align-items:center;justify-content:center}',
    '.glb-img{display:block;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);width:auto;height:auto;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,.6);opacity:0;transition:opacity .25s ease;cursor:default}',
    '.glb-img.glb-ready{opacity:1}',
    '@media (min-width:700px){.glb-img{max-width:calc(100vw - 140px);max-height:calc(100vh - 80px)}}',
    '.glb-btn{position:absolute;border:0;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;width:48px;height:48px;padding:0;transition:background .15s ease;-webkit-tap-highlight-color:transparent}',
    '.glb-btn:hover,.glb-btn:focus-visible{background:rgba(255,255,255,.22);outline:none}',
    '.glb-btn svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.glb-close{top:12px;right:12px}',
    '.glb-prev,.glb-next{top:50%;transform:translateY(-50%)}',
    '.glb-prev{left:10px}.glb-next{right:10px}',
    '@media (max-width:699px){.glb-prev,.glb-next{top:auto;bottom:14px;transform:none;background:rgba(255,255,255,.14)}.glb-prev{left:14px}.glb-next{right:14px}}',
    '.glb-counter{position:absolute;top:22px;left:20px;color:rgba(255,255,255,.75);font:14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:.04em}',
    '.glb-spinner{position:absolute;width:38px;height:38px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:glb-spin .8s linear infinite;display:none}',
    '.glb-loading .glb-spinner{display:block}',
    '@keyframes glb-spin{to{transform:rotate(360deg)}}',
    'body.glb-noscroll{overflow:hidden}',
    '.bwg-a[href]{cursor:zoom-in}'
  ].join('');

  var ICONS = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
  };

  var IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)(\?.*)?$/i;

  var overlay, stage, img, counter, spinner, prevBtn, nextBtn, closeBtn;
  var items = [];      // array of { src, alt } for the open gallery
  var index = 0;
  var lastFocus = null;
  var touchStartX = null;

  function injectStyles() {
    var style = document.createElement('style');
    style.id = 'glb-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'glb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Image viewer');
    overlay.hidden = true;

    stage = document.createElement('div');
    stage.className = 'glb-stage';

    img = document.createElement('img');
    img.className = 'glb-img';
    img.alt = '';

    spinner = document.createElement('div');
    spinner.className = 'glb-spinner';

    counter = document.createElement('div');
    counter.className = 'glb-counter';

    closeBtn = button('glb-close', 'Close', ICONS.close);
    prevBtn = button('glb-prev', 'Previous image', ICONS.prev);
    nextBtn = button('glb-next', 'Next image', ICONS.next);

    stage.appendChild(img);
    overlay.appendChild(stage);
    overlay.appendChild(spinner);
    overlay.appendChild(counter);
    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); step(1); });

    // Click on the dark backdrop (anything but the image or a button) closes.
    overlay.addEventListener('click', function (e) {
      if (e.target === img || e.target.closest('.glb-btn')) return;
      close();
    });

    img.addEventListener('load', function () {
      overlay.classList.remove('glb-loading');
      img.classList.add('glb-ready');
    });
    img.addEventListener('error', function () {
      overlay.classList.remove('glb-loading');
      img.classList.add('glb-ready');
    });

    overlay.addEventListener('touchstart', function (e) {
      touchStartX = e.touches.length === 1 ? e.touches[0].clientX : null;
    }, { passive: true });
    overlay.addEventListener('touchend', function (e) {
      if (touchStartX === null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
  }

  function button(cls, label, icon) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'glb-btn ' + cls;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.innerHTML = icon;
    return b;
  }

  function collect(anchor) {
    var group = anchor.closest('.bwg_container') || document;
    // BWG's masonry code clones the container into a ".bwg-container-tempN" scratch
    // element while laying out; skip anything inside that clone to avoid duplicates.
    var anchors = Array.prototype.filter.call(group.querySelectorAll('a.bwg-a[href]'), function (a) {
      return IMAGE_RE.test(a.getAttribute('href')) && !a.closest('[class*="bwg-container-temp"]');
    });
    if (anchors.indexOf(anchor) === -1) anchors = [anchor];
    items = anchors.map(function (a) {
      var thumb = a.querySelector('img');
      return { src: a.href, alt: thumb ? (thumb.getAttribute('alt') || '') : '' };
    });
    index = anchors.indexOf(anchor);
  }

  function show(i) {
    index = (i + items.length) % items.length;
    img.classList.remove('glb-ready');
    overlay.classList.add('glb-loading');
    img.src = items[index].src;
    img.alt = items[index].alt;
    counter.textContent = (index + 1) + ' / ' + items.length;
    var single = items.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;
    counter.hidden = single;
    preload(index + 1);
    preload(index - 1);
  }

  function preload(i) {
    if (items.length < 2) return;
    var im = new Image();
    im.src = items[(i + items.length) % items.length].src;
  }

  function step(delta) {
    if (items.length < 2) return;
    show(index + delta);
  }

  function open(anchor) {
    if (!overlay) build();
    collect(anchor);
    lastFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('glb-noscroll');
    // Force a style flush so the opacity transition runs.
    void overlay.offsetWidth;
    overlay.classList.add('glb-open');
    show(index);
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.classList.remove('glb-open');
    document.body.classList.remove('glb-noscroll');
    setTimeout(function () {
      overlay.hidden = true;
      img.removeAttribute('src');
      img.classList.remove('glb-ready');
    }, 200);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var anchor = e.target.closest && e.target.closest('a.bwg-a[href]');
    if (!anchor || !IMAGE_RE.test(anchor.getAttribute('href'))) return;
    e.preventDefault();
    e.stopPropagation();
    open(anchor);
  }

  function init() {
    if (!document.querySelector('a.bwg-a[href]')) return;
    injectStyles();
    // Capture phase so the plugin's own delegated jQuery handlers never see the click.
    document.addEventListener('click', onClick, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
