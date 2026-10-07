/* ============================================================
   SAMI WAREHOUSE — v1.5
   Client-side logic with localStorage persistence and Chart.js momentum graphs.
   ============================================================ */

(function() {
'use strict';

const STORE = {
  videos: 'sw_videos',
  habits: 'sw_habits',
  news: 'sw_news',
  analytics: 'sw_analytics',
  meta: 'sw_meta',
  studyTasks: 'sw_study_tasks',
  physicalTasks: 'sw_physical_tasks',
  disciplineTasks: 'sw_discipline_tasks',
};

function todayKey(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoKey(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return todayKey(d);
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('load failed', key, e);
    return fallback;
  }
}

function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('save failed', key, e);
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(s) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(s) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour12: false });
}

function pctValue(checked, total) {
  return total > 0 ? Math.round((checked / total) * 100) : 0;
}

const State = {
  videos: load(STORE.videos, []),
  habits: load(STORE.habits, {}),
  news: load(STORE.news, []),
  analytics: load(STORE.analytics, []),
  meta: load(STORE.meta, { last_audit_at: null, activeVideoId: null, streak: 0 }),
  studyTasks: load(STORE.studyTasks, {}),
  physicalTasks: load(STORE.physicalTasks, {}),
  disciplineTasks: load(STORE.disciplineTasks, {}),
  quoteIndex: 0,
  charts: {},
};

function persist() {
  save(STORE.videos, State.videos);
  save(STORE.habits, State.habits);
  save(STORE.news, State.news);
  save(STORE.analytics, State.analytics);
  save(STORE.meta, State.meta);
  save(STORE.studyTasks, State.studyTasks);
  save(STORE.physicalTasks, State.physicalTasks);
  save(STORE.disciplineTasks, State.disciplineTasks);
  updateStorageIndicator();
}

let toastTimer;
function toast(msg, kind) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function updateStorageIndicator() {
  let bytes = 0;
  for (const k of Object.values(STORE)) {
    const raw = localStorage.getItem(k);
    if (raw) bytes += raw.length * 2;
  }
  const sizeEl = document.getElementById('storage-size');
  if (sizeEl) sizeEl.textContent = (bytes / 1024).toFixed(1) + ' KB';
}

const QUOTES = [
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "Do not judge my consistency by my appearance, but by my results.", author: "Muhammad Ali" },
  { text: "The path is not difficult, but we often waste time looking for shortcuts.", author: "Lao Tzu" },
  { text: "Whoever is content will be wealthy.", author: "Bukhari" },
  { text: "Actions speak louder than words.", author: "Anonymous" },
  { text: "Patience is the key to success.", author: "Anonymous" },
  { text: "Every action you take is a vote for the type of person you wish to become.", author: "James Clear" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "You don't rise to the level of your goals, you fall to the level of your systems.", author: "James Clear" },
  { text: "What you do every day matters more than what you do once in a while.", author: "Gretchen Rubin" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "If you're going through hell, keep going.", author: "Winston Churchill" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Do or do not. There is no try.", author: "Yoda" },
  { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The difference between ordinary and extraordinary is that little 'extra'.", author: "Jimmy Johnson" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "The master has failed more times than the beginner has even tried.", author: "Stephen Lee" },
  { text: "Fall seven times and stand up eight.", author: "Japanese Proverb" },
  { text: "When the going gets tough, the tough get going.", author: "Jim Rohn" },
  { text: "Your attitude determines your direction.", author: "Napoleon Hill" },
  { text: "Dream big, start small, act now.", author: "Ginni Rometty" },
  { text: "Success is liking yourself, liking what you do, and liking how you do it.", author: "Maya Angelou" },
  { text: "The only way to do it is to just do it.", author: "Nike" },
  { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
  { text: "If you're not failing, you're not trying.", author: "Barbara Anderson" },
  { text: "Strive for progress, not perfection.", author: "Anonymous" },
  { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { text: "Success is not about money, it's about fulfillment.", author: "Ryan Holiday" },
];

function setupQuotes() {
  const btn = document.getElementById('quote-next-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      State.quoteIndex = (State.quoteIndex + 1) % QUOTES.length;
      renderQuote();
    });
  }
  State.quoteIndex = quoteIndexForToday();
  renderQuote();
}

function quoteIndexForToday() {
  const now = new Date();
  const dateStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return hash % QUOTES.length;
}

function renderQuote() {
  const main = document.getElementById('quote-main');
  const author = document.getElementById('quote-author');
  if (!main || !author) return;
  const quote = QUOTES[State.quoteIndex];
  main.textContent = `"${quote.text}"`;
  author.textContent = `— ${quote.author}`;
}

function setupTabs() {
  const btns = document.querySelectorAll('.nav-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const jumpBtns = document.querySelectorAll('[data-jump]');
  function activate(tab) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    panels.forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  }
  btns.forEach(b => b.addEventListener('click', () => activate(b.dataset.tab)));
  jumpBtns.forEach(b => b.addEventListener('click', () => activate(b.dataset.jump)));
}

function setupClock() {
  const el = document.getElementById('clock');
  const dateEl = document.getElementById('date-badge');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase();
  }
  tick();
  setInterval(tick, 1000);
}

function extractYouTubeId(input) {
  if (!input) return null;
  input = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const watch = input.match(/(?:youtube\.com|youtu\.be)\/(?:watch\?.*v=|embed\/|v\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (watch) return watch[1];
  const param = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (param) return param[1];
  return null;
}

async function fetchVideoTitle(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return data.title || '';
    }
  } catch (e) {
    console.warn('oEmbed failed', e);
  }
  return '';
}

function renderVideos() {
  const queue = State.videos.filter(v => !v.completed_status);
  const done = State.videos.filter(v => v.completed_status);
  const queueEl = document.getElementById('video-queue');
  const countEl = document.getElementById('queue-count');
  countEl.textContent = queue.length;
  if (!queue.length) {
    queueEl.innerHTML = '<div class="empty-state">// queue is empty. add a youtube url above.</div>';
  } else {
    queueEl.innerHTML = queue.map(v => `<div class="queue-item ${State.meta.activeVideoId === v.id ? 'active' : ''}" data-id="${v.id}"><div class="queue-thumb">&#9654;</div><div class="queue-info"><div class="queue-title">${escapeHTML(v.title || v.embed_id)}</div><div class="queue-meta">ID: ${v.embed_id} &middot; ${v.subject || 'unclassified'}</div></div><div class="queue-actions"><button class="queue-btn queue-watch" data-id="${v.id}">&#9654;</button><button class="queue-btn queue-done" data-id="${v.id}" title="Mark complete">&#10003;</button><button class="queue-btn queue-del" data-id="${v.id}" title="Delete">&#10007;</button></div></div>`).join('');
  }
  const archiveEl = document.getElementById('video-archive');
  if (!done.length) {
    archiveEl.innerHTML = '<div class="empty-state">// no completed videos yet.</div>';
  } else {
    archiveEl.innerHTML = done.map(v => `<div class="queue-item completed"><div class="queue-thumb">&#10003;</div><div class="queue-info"><div class="queue-title">${escapeHTML(v.title || v.embed_id)}</div><div class="queue-meta">completed &middot; ${escapeHTML(v.subject || '')}</div></div><div class="queue-actions"><button class="queue-btn queue-revert" data-id="${v.id}" title="Restore">&#8634;</button><button class="queue-btn queue-del" data-id="${v.id}" title="Delete">&#10007;</button></div></div>`).join('');
  }
  const playerEl = document.getElementById('video-player');
  const markBtn = document.getElementById('mark-complete-btn');
  const delBtn = document.getElementById('delete-current-btn');
  if (State.meta.activeVideoId) {
    const active = State.videos.find(v => v.id === State.meta.activeVideoId);
    if (active) {
      playerEl.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(active.embed_id)}?modestbranding=1&rel=0&disablekb=1&iv_load_policy=3&playsinline=1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen title="${escapeHTML(active.title || 'video player')}"></iframe>`;
      markBtn.disabled = !!active.completed_status;
      delBtn.disabled = false;
    } else {
      State.meta.activeVideoId = null;
      playerEl.innerHTML = '<div class="empty-state">// active video deleted. select from queue.</div>';
      markBtn.disabled = true;
      delBtn.disabled = true;
    }
  } else {
    playerEl.innerHTML = '<div class="empty-state">// select a queued video to watch.</div>';
    markBtn.disabled = true;
    delBtn.disabled = true;
  }
  queueEl.querySelectorAll('.queue-watch, .queue-item').forEach(el => {
    if (el.classList.contains('queue-item') && !el.classList.contains('completed')) {
      el.addEventListener('click', e => {
        if (e.target.closest('.queue-btn')) return;
        State.meta.activeVideoId = el.dataset.id;
        persist();
        renderVideos();
      });
    }
  });
  queueEl.querySelectorAll('.queue-watch').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); State.meta.activeVideoId = b.dataset.id; persist(); renderVideos(); }));
  queueEl.querySelectorAll('.queue-done').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); markVideoComplete(b.dataset.id); }));
  queueEl.querySelectorAll('.queue-del').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteVideo(b.dataset.id); }));
  archiveEl.querySelectorAll('.queue-revert').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); revertVideo(b.dataset.id); }));
  archiveEl.querySelectorAll('.queue-del').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); deleteVideo(b.dataset.id); }));
  markBtn.onclick = () => markVideoComplete(State.meta.activeVideoId);
  delBtn.onclick = () => deleteVideo(State.meta.activeVideoId);
}

async function addVideo(url, subject) {
  const id = extractYouTubeId(url);
  if (!id) { toast('Invalid YouTube URL', 'error'); return; }
  if (State.videos.some(v => v.embed_id === id)) { toast('Already in warehouse', 'error'); return; }
  const title = await fetchVideoTitle(id);
  const rec = { id: uid(), embed_id: id, url: `https://www.youtube.com/watch?v=${id}`, title: title || `Video ${id}`, subject: subject || 'research', added_at: new Date().toISOString(), completed_status: false };
  State.videos.push(rec);
  State.meta.activeVideoId = rec.id;
  persist();
  renderVideos();
  renderDashboard();
  toast('Added to queue', 'success');
}

function markVideoComplete(id) {
  const v = State.videos.find(x => x.id === id);
  if (!v) return;
  v.completed_status = true;
  persist();
  logAnalyticsEvent('video_complete');
  renderVideos();
  renderDashboard();
  toast('Video complete!', 'success');
}

function revertVideo(id) {
  const v = State.videos.find(x => x.id === id);
  if (!v) return;
  v.completed_status = false;
  persist();
  renderVideos();
  renderDashboard();
}

function deleteVideo(id) {
  State.videos = State.videos.filter(v => v.id !== id);
  if (State.meta.activeVideoId === id) State.meta.activeVideoId = null;
  persist();
  renderVideos();
  renderDashboard();
  toast('Deleted', 'success');
}

function setupVideoForm() {
  const form = document.getElementById('video-form');
  const input = document.getElementById('video-url');
  form.addEventListener('submit', e => { e.preventDefault(); const url = input.value.trim(); if (!url) return; addVideo(url, 'research'); input.value = ''; });
  document.getElementById('clear-archive').onclick = () => { if (!confirm('Clear entire completed archive?')) return; State.videos = State.videos.filter(v => !v.completed_status); persist(); renderVideos(); renderDashboard(); toast('Archive cleared', 'success'); };
}

function getTodayTasks(type) {
  const today = todayKey();
  const key = type === 'study' ? 'studyTasks' : type === 'physical' ? 'physicalTasks' : 'disciplineTasks';
  return State[key][today] || [];
}

function addTask(type, name) {
  if (!name.trim()) return;
  const today = todayKey();
  const key = type === 'study' ? 'studyTasks' : type === 'physical' ? 'physicalTasks' : 'disciplineTasks';
  if (!State[key][today]) State[key][today] = [];
  State[key][today].push({ id: uid(), name: name.trim(), checked: false, added_at: new Date().toISOString() });
  persist();
  renderTracker(type);
  renderDashboard();
  toast('Task added', 'success');
}

function toggleTask(type, id) {
  const today = todayKey();
  const key = type === 'study' ? 'studyTasks' : type === 'physical' ? 'physicalTasks' : 'disciplineTasks';
  const tasks = State[key][today] || [];
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.checked = !task.checked;
  persist();
  renderTracker(type);
  renderDashboard();
}

function deleteTask(type, id) {
  const today = todayKey();
  const key = type === 'study' ? 'studyTasks' : type === 'physical' ? 'physicalTasks' : 'disciplineTasks';
  State[key][today] = (State[key][today] || []).filter(t => t.id !== id);
  persist();
  renderTracker(type);
  renderDashboard();
  toast('Task deleted', 'success');
}

function renderTracker(type) {
  const today = todayKey();
  const key = type === 'study' ? 'studyTasks' : type === 'physical' ? 'physicalTasks' : 'disciplineTasks';
  const listEl = document.getElementById(`${type}-task-list`);
  const openCountEl = document.getElementById(`${type}-open-count`);
  const tasks = State[key][today] || [];
  if (openCountEl) openCountEl.textContent = `${tasks.filter(t => !t.checked).length} OPEN`;
  if (!tasks.length) {
    const placeholder = type === 'study' ? 'study targets' : type === 'physical' ? 'workouts' : 'habits';
    listEl.innerHTML = `<div class="empty-state">// add ${placeholder} to track progress.</div>`;
    return;
  }
  listEl.innerHTML = tasks.map(t => `<div class="tracker-item ${t.checked ? 'checked' : ''}" data-id="${t.id}"><div class="tracker-checkbox ${t.checked ? 'checked' : ''}" data-toggle="${t.id}">${t.checked ? '✓' : ''}</div><div class="tracker-item-name">${escapeHTML(t.name)}</div><button class="tracker-item-delete" data-delete="${t.id}">&#10007;</button></div>`).join('');
  listEl.querySelectorAll('[data-toggle]').forEach(cb => cb.addEventListener('click', e => { e.stopPropagation(); toggleTask(type, cb.dataset.toggle); }));
  listEl.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); deleteTask(type, btn.dataset.delete); }));
}

function setupTrackers() {
  const setup = (type, btnId, inputId) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (btn && input) {
      btn.addEventListener('click', () => { addTask(type, input.value); input.value = ''; });
      input.addEventListener('keypress', e => { if (e.key === 'Enter') { addTask(type, input.value); input.value = ''; } });
    }
  };
  setup('study', 'add-study-btn', 'study-task-input');
  setup('physical', 'add-physical-btn', 'physical-workout-input');
  setup('discipline', 'add-discipline-btn', 'discipline-habit-input');
}

function renderAllTrackers() {
  renderTracker('study');
  renderTracker('physical');
  renderTracker('discipline');
}

function getDailyPct(type, dateKey) {
  const key = type === 'study' ? 'studyTasks' : type === 'physical' ? 'physicalTasks' : 'disciplineTasks';
  const tasks = State[key][dateKey] || [];
  return pctValue(tasks.filter(t => t.checked).length, tasks.length);
}

function getMomentumSeries(type, days = 14) {
  const labels = [];
  const values = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = daysAgoKey(i);
    labels.push(new Date(key + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    values.push(getDailyPct(type, key));
  }
  return { labels, values };
}

function getMomentumStatus(values) {
  if (values.length < 2) return { status: 'FLAT', delta: 0, color: 'flat' };
  const prev = values[values.length - 2];
  const last = values[values.length - 1];
  const delta = last - prev;
  if (delta > 0) return { status: 'UP', delta, color: 'up' };
  if (delta < 0) return { status: 'DOWN', delta, color: 'down' };
  return { status: 'FLAT', delta, color: 'flat' };
}

function initChart(canvasId, type, accentColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, accentColor + '80');
  grad.addColorStop(1, accentColor + '00');
  const chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: accentColor, backgroundColor: grad, borderWidth: 4, fill: true, tension: 0.35, pointBackgroundColor: accentColor, pointBorderColor: '#0f172a', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#ffffff',
          bodyColor: '#f8fafc',
          borderColor: '#0f172a',
          borderWidth: 2,
          callbacks: { label: ctx => `${ctx.parsed.y}%` },
        },
      },
      scales: {
        x: { grid: { color: '#e2e8f0', drawTicks: false }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', weight: '700', size: 10 } }, border: { color: '#0f172a', width: 2 } },
        y: { min: 0, max: 100, grid: { color: '#e2e8f0', drawTicks: false }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', weight: '700', size: 10 }, stepSize: 25, callback: value => value + '%' }, border: { color: '#0f172a', width: 2 } },
      },
    },
  });
  State.charts[type] = chart;
}

function updateChart(type, accentColor, accentColorDown) {
  const chart = State.charts[type];
  if (!chart) return;
  const { labels, values } = getMomentumSeries(type, 14);
  const status = getMomentumStatus(values);
  const lineColor = status.color === 'down' ? accentColorDown : accentColor;
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.data.datasets[0].borderColor = lineColor;
  chart.data.datasets[0].pointBackgroundColor = lineColor;
  chart.update();
  const last = values[values.length - 1] ?? 0;
  document.getElementById(`${type}-momentum-today`).textContent = `${last}%`;
  document.getElementById(`${type}-momentum-trend`).textContent = status.delta > 0 ? `+${status.delta}%` : status.delta < 0 ? `${status.delta}%` : '0%';
  const statusEl = document.getElementById(`${type}-momentum-status`);
  statusEl.textContent = status.status;
  statusEl.className = `chart-status ${status.color}`;
}

function renderDashboard() {
  renderAllTrackers();
  updateChart('study', '#F59E0B', '#EF4444');
  updateChart('physical', '#10B981', '#EF4444');
  updateChart('discipline', '#8B5CF6', '#EF4444');
  const studyTasks = getTodayTasks('study');
  const physicalTasks = getTodayTasks('physical');
  const disciplineTasks = getTodayTasks('discipline');
  document.getElementById('summary-study-open').textContent = studyTasks.filter(t => !t.checked).length;
  document.getElementById('summary-physical-open').textContent = physicalTasks.filter(t => !t.checked).length;
  document.getElementById('summary-discipline-open').textContent = disciplineTasks.filter(t => !t.checked).length;
  const totalTasks = studyTasks.filter(t => t.checked).length + physicalTasks.filter(t => t.checked).length + disciplineTasks.filter(t => t.checked).length;
  let rec = State.analytics.find(a => a.date === todayKey());
  if (!rec) {
    rec = { id: uid(), date: todayKey(), completed_tasks_count: 0, velocity_score: 0, hermes_report_text: '' };
    State.analytics.push(rec);
  }
  rec.completed_tasks_count = totalTasks;
  rec.velocity_score = totalTasks;
  document.getElementById('summary-velocity').textContent = rec.velocity_score;
  persist();
}

async function runNightlyAudit() {
  const btn = document.getElementById('run-audit-btn');
  const statusEl = document.getElementById('audit-status');
  btn.disabled = true;
  statusEl.textContent = 'RUNNING...';
  const articles = [];
  const today = todayKey();
  try {
    const arxivUrl = 'https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&start=0&max_results=8&sortBy=submittedDate&sortOrder=descending';
    const res = await fetch(arxivUrl);
    const xml = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const entries = doc.querySelectorAll('entry');
    let count = 0;
    for (const entry of entries) {
      if (count >= 3) break;
      const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const summary = entry.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const published = entry.querySelector('published')?.textContent || '';
      const authors = Array.from(entry.querySelectorAll('author name')).slice(0, 3).map(a => a.textContent).join(', ');
      if (!title) continue;
      const bullets = [summary.slice(0, 220) + (summary.length > 220 ? '…' : '')];
      if (authors) bullets.push('Authors: ' + authors);
      bullets.push('Published: ' + new Date(published).toLocaleDateString('en-US'));
      articles.push({ id: uid(), date: today, title, source: 'arXiv', summary_bullets: bullets, read_time: Math.max(2, Math.floor(bullets.join(' ').split(' ').length / 200)) });
      count++;
    }
  } catch (e) {
    console.warn('arXiv fetch failed', e);
  }
  if (articles.length === 0) {
    articles.push({ id: uid(), date: today, title: "Network issue — couldn't fetch from arXiv", source: 'System', summary_bullets: ['Retry the audit later, or check your connection.'], read_time: 1 });
  }
  State.news = articles;
  State.meta.last_audit_at = new Date().toISOString();
  persist();
  renderNews();
  renderDashboard();
  statusEl.textContent = `Last audit: ${fmtTime(State.meta.last_audit_at)}`;
  btn.disabled = false;
  toast('Audit complete', 'success');
}

function renderNews() {
  const list = document.getElementById('news-list');
  const statusEl = document.getElementById('audit-status');
  const timeEl = document.getElementById('last-audit-time');
  if (State.meta.last_audit_at) {
    timeEl.textContent = fmtTime(State.meta.last_audit_at);
    statusEl.textContent = `LAST AUDIT: ${fmtDate(State.meta.last_audit_at)}`;
  }
  if (!State.news.length) {
    list.innerHTML = '<div class="empty-state">// no news items yet. run the nightly audit.</div>';
    return;
  }
  list.innerHTML = State.news.map((n, i) => `<div class="news-item"><div class="news-item-head"><div class="news-num">${String(i + 1).padStart(2, '0')}</div><div class="news-title">${escapeHTML(n.title)}</div><div class="news-source">${escapeHTML(n.source)}</div></div><ul class="news-bullets">${n.summary_bullets.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul></div>`).join('');
}

function setupNews() {
  document.getElementById('run-audit-btn').onclick = runNightlyAudit;
  document.getElementById('clear-news').onclick = () => {
    if (!confirm('Clear current news cycle?')) return;
    State.news = [];
    State.meta.last_audit_at = null;
    persist();
    renderNews();
    renderDashboard();
    toast('Cycle cleared', 'success');
  };
}

function init() {
  setupClock();
  setupTabs();
  setupQuotes();
  setupVideoForm();
  setupTrackers();
  initChart('studyChart', 'study', '#F59E0B');
  initChart('physicalChart', 'physical', '#10B981');
  initChart('disciplineChart', 'discipline', '#8B5CF6');
  setupNews();
  const today = todayKey();
  renderVideos();
  renderNews();
  renderDashboard();
  updateStorageIndicator();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();