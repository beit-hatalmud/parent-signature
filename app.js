const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';
const TOKEN = 'BHT_AGENT_2026';

let currentTpl = null;
let canvas, ctx, drawing = false, lastX = 0, lastY = 0;

const URL_PARAMS = new URLSearchParams(location.search);
// Allow ?tpl=trip to skip template selection
const initialTpl = URL_PARAMS.get('tpl');
if (initialTpl && FORMS[initialTpl]) {
  document.addEventListener('DOMContentLoaded', () => selectTpl(initialTpl));
}

function selectTpl(tpl) {
  currentTpl = tpl;
  const form = FORMS[tpl];
  document.getElementById('form-title').textContent = form.title;
  // Render fields
  const fieldsEl = document.getElementById('form-fields');
  fieldsEl.innerHTML = form.fields.map(f => renderField(f)).join('');
  // Pre-fill from URL params
  form.fields.forEach(f => {
    const val = URL_PARAMS.get(f.id);
    if (val) {
      const el = document.getElementById('f-' + f.id);
      if (el) {
        if (el.type === 'checkbox') el.checked = val === '1' || val === 'true';
        else el.value = val;
      }
    }
  });
  document.getElementById('step-template').classList.add('d-none');
  document.getElementById('step-form').classList.remove('d-none');
  setupCanvas();
}

function renderField(f) {
  const req = f.required ? 'form-required' : '';
  const id = 'f-' + f.id;
  if (f.type === 'textarea') {
    return `<div class="mb-3">
      <label class="form-label ${req}">${f.label}</label>
      <textarea id="${id}" class="form-control" rows="${f.rows||3}" ${f.required?'required':''}></textarea>
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
      <label class="form-label ${req}">${f.label}</label>
      <select id="${id}" class="form-select" ${f.required?'required':''}>
        <option value="">בחר...</option>
        ${(f.options||[]).map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </div>`;
  }
  return `<div class="mb-3">
    <label class="form-label ${req}">${f.label}</label>
    <input id="${id}" type="${f.type||'text'}" class="form-control" ${f.required?'required':''}>
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

  const sigDataUrl = canvas.toDataURL('image/png');
  const ref = URL_PARAMS.get('ref') || '';
  const sendTo = URL_PARAMS.get('to') || '6742853@gmail.com';

  try {
    const body = new URLSearchParams({
      action: 'parent_form_submit',
      token: TOKEN,
      tpl: currentTpl,
      title: form.title,
      ref,
      send_to: sendTo,
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
    }
  } catch (e) {
    showError('שגיאת רשת: ' + e.message);
    document.getElementById('submit-btn').disabled = false;
  }
}

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.classList.remove('d-none');
  el.scrollIntoView({behavior:'smooth'});
}
