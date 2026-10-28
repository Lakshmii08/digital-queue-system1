const form = document.getElementById('token-form');
const list = document.getElementById('queue-list');
const message = document.getElementById('message');
let queueCache = [];
let toastTimer;
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data;
}
function notify(text) {
  message.textContent = text; message.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => message.classList.remove('show'), 3200);
}
function setText(id, value) { document.getElementById(id).textContent = value; }
function niceDate(value) {
  if (!value) return '—';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function renderQueue() {
  const search = document.getElementById('search').value.trim().toLowerCase();
  const filter = document.getElementById('status-filter').value;
  const items = queueCache.filter(item => (filter === 'ALL' || item.status === filter) && `${item.token} ${item.name} ${item.department}`.toLowerCase().includes(search));
  list.replaceChildren();
  if (!items.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.className = 'empty-cell'; td.textContent = queueCache.length ? 'No tokens match your filters.' : 'No tokens yet. Create the first token above.'; tr.appendChild(td); list.appendChild(tr);
  }
  for (const item of items) {
    const tr = document.createElement('tr');
    const token = document.createElement('td'); token.className = 'token-cell'; token.textContent = item.token;
    const visitor = document.createElement('td'); const name = document.createElement('span'); name.className = 'visitor-name'; name.textContent = item.name; const id = document.createElement('span'); id.className = 'visitor-sub'; id.textContent = `ID #${item.id}`; visitor.append(name, id);
    const dept = document.createElement('td'); dept.textContent = item.department;
    const created = document.createElement('td'); created.textContent = niceDate(item.createdAt);
    const statusCell = document.createElement('td'); const badge = document.createElement('span'); badge.className = `status status-${item.status}`; badge.textContent = item.status.charAt(0) + item.status.slice(1).toLowerCase(); statusCell.appendChild(badge);
    const action = document.createElement('td');
    if (item.status === 'SERVING') {
      const button = document.createElement('button'); button.className = 'action-button'; button.textContent = 'Complete'; button.addEventListener('click', () => completeToken(item.id)); action.appendChild(button);
    } else if (item.status === 'WAITING') {
      const button = document.createElement('button'); button.className = 'action-button'; button.textContent = 'Cancel'; button.addEventListener('click', () => cancelToken(item.id)); action.appendChild(button);
    } else action.textContent = '—';
    tr.append(token, visitor, dept, created, statusCell, action); list.appendChild(tr);
  }
  setText('queue-summary', `Showing ${items.length} of ${queueCache.length} tokens`);
}
async function refreshQueue() {
  try {
    const [queue, current, stats] = await Promise.all([request('/api/queue'), request('/api/queue/current'), request('/api/queue/stats')]);
    queueCache = queue; setText('waiting-count', stats.waiting); setText('serving-count', stats.serving); setText('completed-count', stats.completed); setText('wait-time', stats.estimatedWaitMinutes);
    setText('current-token', current ? current.token : '—'); setText('current-name', current ? current.name : 'No one is being served'); setText('current-department', current ? current.department : 'Ready for next token');
    renderQueue();
  } catch (error) { notify(error.message); }
}
async function completeToken(id) {
  try { await request(`/api/queue/${id}/complete`, { method: 'PATCH' }); notify('Token completed successfully.'); await refreshQueue(); }
  catch (error) { notify(error.message); }
}
async function cancelToken(id) {
  if (!confirm('Cancel this waiting token?')) return;
  try { await request(`/api/queue/${id}`, { method: 'DELETE' }); notify('Token cancelled.'); await refreshQueue(); }
  catch (error) { notify(error.message); }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; submit.style.opacity = '.7';
  try {
    const item = await request('/api/queue', { method: 'POST', body: JSON.stringify({ name: document.getElementById('name').value, department: document.getElementById('department').value }) });
    setText('created-token', item.token); setText('created-message', `${item.name}, you have joined ${item.department}.`); document.getElementById('token-result').classList.remove('hidden'); notify(`Your token is ${item.token}.`); form.reset(); await refreshQueue();
  } catch (error) { notify(error.message); } finally { submit.disabled = false; submit.style.opacity = '1'; }
});
document.getElementById('next-button').addEventListener('click', async () => {
  const button = document.getElementById('next-button'); button.disabled = true;
  try { const item = await request('/api/queue/next', { method: 'POST' }); notify(`Now serving ${item.token} — ${item.name}`); await refreshQueue(); }
  catch (error) { notify(error.message); } finally { button.disabled = false; }
});
document.getElementById('refresh-button').addEventListener('click', refreshQueue);
document.getElementById('search').addEventListener('input', renderQueue);
document.getElementById('status-filter').addEventListener('change', renderQueue);
refreshQueue(); setInterval(refreshQueue, 10000);
