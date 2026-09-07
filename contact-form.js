/*
 * contact-form.js — static contact form handling for the exported WordPress sites.
 *
 * The form's action attribute points at FormSubmit (https://formsubmit.co/<owner email>),
 * a relay that emails submissions to the owner without any server on our side.
 * On the FIRST submission FormSubmit emails the owner an activation link; after it
 * is clicked once, every later submission is delivered normally.
 *
 * Without JavaScript the form still works: it does a normal POST to FormSubmit,
 * which then redirects back to the page URL given in the hidden "_next" field
 * (we append ?sent=1 so the page can show the thank-you message).
 *
 * With JavaScript we submit in the background (FormSubmit's /ajax/ endpoint) and
 * show the result inline. If the request cannot be made at all (offline, blocked),
 * we show the owner's email address with a prefilled mailto: link instead, so the
 * visitor's message is never silently lost.
 *
 * Per-page texts come from data attributes on the <form>:
 *   data-success  – message shown after a successful send
 *   data-error    – message shown when sending failed (a mailto link is appended)
 *   data-sending  – temporary button label while sending
 */
(function () {
  'use strict';

  var form = document.querySelector('form[data-contact-form]');
  if (!form) return;

  var action = form.getAttribute('action') || '';
  var match = action.match(/^https:\/\/formsubmit\.co\/(.+)$/);
  if (!match) return;
  var ownerEmail = match[1];
  var ajaxUrl = 'https://formsubmit.co/ajax/' + ownerEmail;

  var successText = form.getAttribute('data-success') || 'Thank you, your message has been sent.';
  var errorText = form.getAttribute('data-error') || 'Sorry, your message could not be sent. Please email us directly:';
  var sendingText = form.getAttribute('data-sending') || 'Sending…';

  var status = form.querySelector('.contact-form-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'contact-form-status';
    form.appendChild(status);
  }
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  var submitBtn = form.querySelector('[type="submit"]');

  // The no-JS path redirects here after sending; make that URL absolute and current.
  var nextField = form.querySelector('input[name="_next"]');
  if (nextField) {
    nextField.value = location.origin + location.pathname + '?sent=1';
  }

  // Returning from the no-JS full-page POST.
  if (/[?&]sent=1(&|$)/.test(location.search)) {
    show(successText, false);
    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
    scrollIntoView(status);
  }

  form.addEventListener('submit', function (e) {
    // Let the browser's own validation bubbles handle missing required fields.
    if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;
    if (!window.fetch || !window.FormData) return; // very old browser: plain POST + redirect

    e.preventDefault();
    if (form.getAttribute('data-busy') === '1') return; // a send is already in progress
    setBusy(true);

    var payload = {};
    new FormData(form).forEach(function (value, key) {
      if (typeof value === 'string') payload[key] = value;
    });

    fetch(ajaxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (json) { return { ok: res.ok, json: json }; },
                             function () { return { ok: res.ok, json: {} }; });
    }).then(function (r) {
      var ok = r.ok && (r.json.success === true || r.json.success === 'true');
      if (ok) {
        form.reset();
        show(successText, false);
      } else {
        // FormSubmit answered but refused (e.g. address not activated yet): show its reason.
        var reason = r.json && typeof r.json.message === 'string' ? r.json.message : '';
        showError(reason);
      }
    }).catch(function () {
      showError('');
    }).then(function () {
      setBusy(false);
    });
  });

  function setBusy(busy) {
    form.setAttribute('data-busy', busy ? '1' : '');
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    if (busy) {
      if (!submitBtn.hasAttribute('data-original-label')) {
        submitBtn.setAttribute('data-original-label', labelOf(submitBtn));
      }
      setLabel(submitBtn, sendingText);
    } else {
      var original = submitBtn.getAttribute('data-original-label');
      if (original !== null) {
        setLabel(submitBtn, original);
        submitBtn.removeAttribute('data-original-label');
      }
    }
  }

  function labelOf(btn) {
    return btn.tagName === 'INPUT' ? btn.value : btn.textContent;
  }

  function setLabel(btn, text) {
    if (btn.tagName === 'INPUT') btn.value = text; else btn.textContent = text;
  }

  function show(text, isError) {
    status.textContent = text;
    status.className = 'contact-form-status ' + (isError ? 'is-error' : 'is-success');
    status.hidden = false;
  }

  function showError(reason) {
    show(errorText + ' ', true);
    var link = document.createElement('a');
    link.href = mailtoUrl();
    link.textContent = ownerEmail;
    status.appendChild(link);
    if (reason) {
      var why = document.createElement('div');
      why.className = 'contact-form-reason';
      why.textContent = reason;
      status.appendChild(why);
    }
    scrollIntoView(status);
  }

  // Prefilled mailto: with whatever the visitor typed, as the last-resort fallback.
  function mailtoUrl() {
    var body = '';
    var subject = 'Website contact form';
    form.querySelectorAll('input, textarea, select').forEach(function (el) {
      if (!el.name || el.name.charAt(0) === '_' || el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      if (!el.value) return;
      if (el.name.toLowerCase() === 'subject') subject = el.value;
      body += el.name + ': ' + el.value + '\n';
    });
    return 'mailto:' + ownerEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function scrollIntoView(el) {
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
})();
