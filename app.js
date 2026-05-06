const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';
const TOKEN = 'BHT_AGENT_2026';

let currentTpl = null;
let canvas, ctx, drawing = false, lastX = 0, lastY = 0;

const URL_PARAMS = new URLSearchParams(location.search);
// Parent view: REQUIRES ?tpl=... otherwise show "invalid link" message
const initialTpl = URL_PARAMS.get('tpl');
document.addEventListener('DOMContentLoaded', () => {
  const lt = URL_PARAMS.get('lt');
  if (initialTpl && FORMS[initialTpl] && lt) {
    selectTpl(initialTpl);
  } else {
    document.getElementById('step-no-link').classList.remove('d-none');
  }
});

function selectTpl(tpl) {
  currentTpl = tpl;
  const form = FORMS[tpl];
  document.getElementById('form-title').textContent = form.title;
  const fieldsEl = document.getElementById('form-fields');
  fieldsEl.innerHTML = form.fields.map(f => renderField(f, URL_PARAMS.get(f.id))).join('');
  // Set checkbox states from URL
  form.fields.filter(f => f.type === 'checkbox').forEach(f => {
    const val = URL_PARAMS.get(f.id);
    if (val) {
      const el = document.getElementById('f-' + f.id);
      if (el) el.checked = val === '1' || val === 'true';
    }
  });
  document.getElementById('step-form').classList.remove('d-none');
  setupCanvas();
}

function renderField(f, prefilled) {
  const req = f.required ? 'form-required' : '';
  const id = 'f-' + f.id;
  // If pre-filled by admin (URL param), show as read-only display
  const lockHint = prefilled ? '<span class="badge bg-light text-muted ms-2" style="font-size:.7rem">מוגדר מראש</span>' : '';
  const readonly = prefilled ? 'readonly style="background:#f9fafb"' : '';

  if (f.type === 'textarea') {
    return `<div class="mb-3">
      <label class="form-label ${req}">${f.label}${lockHint}</label>
      <textarea id="${id}" class="form-control" rows="${f.rows||3}" ${f.required?'required':''} ${readonly}>${prefilled||''}</textarea>
    </div>`;
  }
  if (f.type === 'checkbox') {
    return `<div class="consent-row form-check">
      <input id="${id}" type="checkbox" class="form-check-input ms-2" ${f.required?'required':''}>
      <label class="form-check-label" for="${id}">${f.label}${f.required?' *':''}</label>
    </div>`;
  }
  if (f.type === 'select') {
    return `<div class="mb-3">
      <label class="form-label ${req}">${f.label}${lockHint}</label>
      <select id="${id}" class="form-select" ${f.required?'required':''} ${readonly}>
        <option value="">בחר...</option>
        ${(f.options||[]).map(o => `<option value="${o}" ${o===prefilled?'selected':''}>${o}</option>`).join('')}
      </select>
    </div>`;
  }
  return `<div class="mb-3">
    <label class="form-label ${req}">${f.label}${lockHint}</label>
    <input id="${id}" type="${f.type||'text'}" class="form-control" value="${prefilled||''}" ${f.required?'required':''} ${readonly}>
  </div>`;
}

function setupCanvas() {
  canvas = document.getElementById('signature-pad');
  // Set internal resolution
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) return [e.touches[0].clientX - r.left, e.touches[0].clientY - r.top];
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.onmousedown = e => { drawing = true; [lastX,lastY] = getPos(e); };
  canvas.onmousemove = e => { if (!drawing) return; const [x,y] = getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.stroke(); [lastX,lastY] = [x,y]; };
  canvas.onmouseup = canvas.onmouseleave = () => drawing = false;
  canvas.ontouchstart = e => { e.preventDefault(); drawing = true; [lastX,lastY] = getPos(e); };
  canvas.ontouchmove = e => { e.preventDefault(); if (!drawing) return; const [x,y] = getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(x,y); ctx.stroke(); [lastX,lastY] = [x,y]; };
  canvas.ontouchend = e => { e.preventDefault(); drawing = false; };
}

function clearSig() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function isEmpty() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

function goBack() {
  document.getElementById('step-form').classList.add('d-none');
  document.getElementById('step-template').classList.remove('d-none');
}

async function submitForm() {
  const form = FORMS[currentTpl];
  const data = {};
  for (const f of form.fields) {
    const el = document.getElementById('f-' + f.id);
    if (!el) continue;
    const val = el.type === 'checkbox' ? el.checked : el.value;
    if (f.required && (!val || val === '')) {
      return showError(`שדה חובה: ${f.label}`);
    }
    data[f.label] = val;
  }
  if (isEmpty()) return showError('אנא חתום בלוח לפני השליחה');
  document.getElementById('submit-btn').disabled = true;
  document.getElementById('submit-btn').innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> שולח...';
  document.getElementById('loading-box').classList.remove('d-none');
  document.getElementById('error').classList.add('d-none');

  const sigDataUrl = canvas.toDataURL('image/png');
  const ref = URL_PARAMS.get('ref') || '';
  const sendTo = URL_PARAMS.get('to') || '6787012@gmail.com';
  const lt = URL_PARAMS.get('lt') || '';

  try {
    const body = new URLSearchParams({
      action: 'parent_form_submit',
      token: TOKEN,
      tpl: currentTpl,
      title: form.title,
      ref,
      send_to: sendTo,
      lt,
      fields: JSON.stringify(data),
      signature: sigDataUrl,
    });
    const r = await fetch(APPS_SCRIPT_URL, { method: 'POST', body, mode: 'cors' });
    const d = await r.json();
    if (d.ok) {
      document.getElementById('step-form').classList.add('d-none');
      document.getElementById('step-done').classList.remove('d-none');
    } else {
      showError(d.error || 'שגיאה בשליחה');
      document.getElementById('submit-btn').disabled = false;
      document.getElementById('submit-btn').innerHTML = '<i class="bi bi-check-circle-fill"></i> שלח אישור חתום';
      document.getElementById('loading-box').classList.add('d-none');
    }
  } catch (e) {
    showError('שגיאת רשת: ' + e.message);
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').innerHTML = '<i class="bi bi-check-circle-fill"></i> שלח אישור חתום';
    document.getElementById('loading-box').classList.add('d-none');
  }
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.classList.remove('d-none');
  el.scrollIntoView({behavior:'smooth'});
}
