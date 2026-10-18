/* Campus Desk — student dashboard. Single localStorage object key sd.v1. */

const STORAGE_KEY = 'sd.v1';
const VERSION = 1;
const WORK_MIN = 25;
const BREAK_MIN = 5;
const REMINDER_MIN = 10;

const VIEWS = ['overview', 'timetable', 'attendance', 'exams', 'grades', 'focus', 'notices', 'profile'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

let state = {
  version: VERSION,
  profile: { name: '', course: '', semester: '1', theme: 'light' },
  subjects: [],
  classes: [],
  attendance: {},
  exams: [],
  grades: [],
  focus: { todos: [], sessions: 0, pomo: { timeLeft: WORK_MIN * 60, running: false, mode: 'work' } },
  notices: [],
};

let timerId = null;
let checkId = null;

function $ (sel, root = document) { return root.querySelector(sel); }
function $$ (sel, root = document) { return root.querySelectorAll(sel); }

// Default subject palette used when a subject has no explicit colour.
const SUBJECT_PALETTE = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

function defaultData () {
  return {
    version: VERSION,
    profile: { name: '', course: '', semester: '1', theme: 'light' },
    subjects: [],
    classes: [],
    attendance: {},
    exams: [],
    grades: [],
    focus: { todos: [], sessions: 0, pomo: { timeLeft: WORK_MIN * 60, running: false, mode: 'work' } },
    notices: [],
  };
}

function migrate (data) {
  // Ensure every expected key exists so old saved data keeps working.
  const d = { ...defaultData(), ...data };
  if (!d.profile) d.profile = defaultData().profile;
  if (!d.focus) d.focus = defaultData().focus;
  if (!d.focus.pomo) d.focus.pomo = defaultData().focus.pomo;
  if (typeof d.version !== 'number') d.version = VERSION;
  if (!Array.isArray(d.subjects)) d.subjects = [];
  if (!Array.isArray(d.classes)) d.classes = [];
  if (!Array.isArray(d.exams)) d.exams = [];
  if (!Array.isArray(d.grades)) d.grades = [];
  if (!Array.isArray(d.notices)) d.notices = [];
  if (!Array.isArray(d.focus.todos)) d.focus.todos = [];
  if (typeof d.attendance !== 'object') d.attendance = {};
  return d;
}

function loadData () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return migrate(JSON.parse(raw));
  } catch (e) {
    return defaultData();
  }
}

function saveData () {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getSubject (id) { return state.subjects.find(s => s.id === id); }
function subjectKey (id) { return `s-${id}`; }
function attendanceOf (id) {
  const key = subjectKey(id);
  if (!state.attendance[key]) state.attendance[key] = { present: 0, absent: 0 };
  return state.attendance[key];
}

function attendancePct (id) {
  const a = attendanceOf(id);
  const total = a.present + a.absent;
  return total === 0 ? 0 : (a.present / total) * 100;
}

function classesNeeded (id) {
  const a = attendanceOf(id);
  return Math.max(0, 3 * (a.present + a.absent) - 4 * a.present);
}

function skippable (id) {
  const a = attendanceOf(id);
  return Math.max(0, Math.floor((4 * a.present - 3 * (a.present + a.absent)) / 3));
}

function subjectColor (id) {
  const subj = getSubject(id);
  if (subj && subj.color) return subj.color;
  const idx = state.subjects.findIndex(s => s.id === id);
  return SUBJECT_PALETTE[idx >= 0 ? idx % SUBJECT_PALETTE.length : 0];
}

function gradePoint (marks, max) {
  const pct = max <= 0 ? 0 : (marks / max) * 100;
  if (pct >= 90) return 10;
  if (pct >= 80) return 9;
  if (pct >= 70) return 8;
  if (pct >= 60) return 7;
  if (pct >= 50) return 6;
  if (pct >= 45) return 5;
  if (pct >= 40) return 4;
  return 0;
}

function gpaOf (semester) {
  const subs = state.grades.filter(g => g.semester === String(semester));
  let totalPoints = 0, totalCredits = 0;
  for (const g of subs) {
    const gp = gradePoint(g.marks, g.maxMarks);
    totalPoints += gp * g.credits;
    totalCredits += g.credits;
  }
  return totalCredits === 0 ? 0 : totalPoints / totalCredits;
}

function cgpa () {
  let totalPoints = 0, totalCredits = 0;
  for (const g of state.grades) {
    totalPoints += gradePoint(g.marks, g.maxMarks) * g.credits;
    totalCredits += g.credits;
  }
  return totalCredits === 0 ? 0 : totalPoints / totalCredits;
}

function nowIso () { return new Date().toISOString().slice(0, 16); }
function fmtTime (date) { return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDate (date) { return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }

function showToast (msg, ms = 3000) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, ms);
}

function requestNotification () {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') Notification.requestPermission();
}

function notify (title, body) {
  showToast(title + (body ? ' — ' + body : ''));
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body || '', icon: '' });
  }
}

// ---------- Navigation / router ----------

function setActiveLink (view) {
  $$('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
    a.setAttribute('aria-current', a.dataset.view === view ? 'true' : 'false');
  });
  $$('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
}

function showView (hash) {
  const view = hash.replace('#', '') || 'overview';
  if (!VIEWS.includes(view)) return showView('#overview');
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  setActiveLink(view);
  window.location.hash = view;
  renderView(view);
}

function renderView (view) {
  const renderers = {
    overview: renderOverview,
    timetable: renderTimetable,
    attendance: renderAttendance,
    exams: renderExams,
    grades: renderGrades,
    focus: renderFocus,
    notices: renderNotices,
    profile: renderProfile,
  };
  if (renderers[view]) renderers[view];
}

// ---------- Theme ----------

function applyTheme (theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ---------- Overview ----------

function renderOverview () {
  const totalClassesToday = classesToday().length;
  const nextExam = nextExamSoon();
  const cg = cgpa();
  $('#overviewStats').innerHTML = `
    <div class="stat"><div class="stat-value">${attendanceOverall()}%</div><div class="stat-label">Overall Attendance</div></div>
    <div class="stat"><div class="stat-value">${totalClassesToday}</div><div class="stat-label">Classes Today</div></div>
    <div class="stat"><div class="stat-value">${nextExam ? fmtDate(new Date(nextExam.date)) : '—'}</div><div class="stat-label">Next Exam</div></div>
    <div class="stat"><div class="stat-value">${cg.toFixed(2)}</div><div class="stat-label">CGPA</div></div>
  `;
  renderTodaySchedule();
  renderTodoPreview();
  renderShortageAlert();
}

function attendanceOverall () {
  let p = 0, t = 0;
  for (const key in state.attendance) {
    const a = state.attendance[key];
    p += a.present; t += a.present + a.absent;
  }
  return t === 0 ? 0 : Math.round((p / t) * 100);
}

function classesToday () {
  const day = DAYS[new Date().getDay()];
  return state.classes.filter(c => c.day === day);
}

function renderTodaySchedule () {
  const today = classesToday();
  const el = $('#todaySchedule');
  if (today.length === 0) { el.textContent = 'No classes today.'; return; }
  el.innerHTML = today.map(c => {
    const s = getSubject(c.subjectId);
    const color = subjectColor(c.subjectId);
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:8px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-card);">
      <span style="width:8px;height:8px;border-radius:50%;background:var(--subject);flex-shrink:0;" class="${color}"></span>
      <div><div style="font-weight:600;font-size:0.95rem">${escapeHtml(s ? s.name : 'Class')}</div><div style="font-size:0.85rem;color:var(--color-text-secondary)">${c.start}–${c.end} • ${c.room || '—'}</div></div>
    </div>`;
  }).join('');
}

function renderTodoPreview () {
  const todos = state.focus.todos.slice(0, 4);
  const el = $('#todoPreview');
  if (todos.length === 0) { el.textContent = 'No to-dos.'; return; }
  el.innerHTML = todos.map(t => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.95rem;">
    <input type="checkbox" ${t.done ? 'checked' : ''} disabled>${escapeHtml(t.text)}
  </div>`).join('');
}

function nextExamSoon () {
  const now = Date.now();
  const upcoming = state.exams.map(e => ({ ...e, time: new Date(e.date + 'T' + (e.time || '00:00')).getTime() }))
    .filter(e => e.time >= now).sort((a, b) => a.time - b.time);
  return upcoming[0] || null;
}

function renderShortageAlert () {
  const el = $('#shortageAlert');
  const msg = $('#shortageMsg');
  let found = false;
  for (const id of Object.keys(state.attendance)) {
    const s = getSubject(id.replace('s-', ''));
    if (!s) continue;
    if (attendancePct(id) < 75) {
      const need = classesNeeded(id);
      msg.textContent = `${s.name} is below 75%. Attend ${need} more class${need === 1 ? '' : 'es'} to recover.`;
      found = true; break;
    }
  }
  el.style.display = found ? 'block' : 'none';
}

// ---------- Timetable ----------

function renderTimetable () {
  const head = DAYS.map(d => `<div class="tg-header">${DAY_LABEL[d]}</div>`).join('');
  const grid = [head];
  for (let i = 0; i < 7; i++) grid.push(`<div class="tg-day${new Date().getDay() === i ? ' today' : ''}" data-day="${DAYS[i]}"></div>`);
  $('#timetableGrid').innerHTML = grid.join('');

  const byDay = {};
  for (const c of state.classes) {
    (byDay[c.day] = byDay[c.day] || []).push(c);
  }
  for (const day of DAYS) {
    const cell = $(`.tg-day[data-day="${day}"]`);
    if (!cell) continue;
    cell.innerHTML = (byDay[day] || []).map(c => {
      const s = getSubject(c.subjectId);
      const color = subjectColor(c.subjectId);
      return `<div class="class-card ${color}" style="--subject:var(--subject);top:4px;left:4px;right:4px;bottom:4px;">
        ${escapeHtml(s ? s.name : 'Class')} • ${c.room || '—'}
      </div>`;
    }).join('');
  }

  const sel = $('#addClassForm select[name="subjectId"]');
  sel.innerHTML = state.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function openModal (id) { $(id).classList.add('active'); }
function closeModal (id) { $(id).classList.remove('active'); }

$$('.modal-backdrop').forEach(b => b.addEventListener('click', () => {
  const p = b.closest('.modal');
  if (p) p.classList.remove('active');
}));

// Add class
$('#openAddClass').addEventListener('click', () => openModal('#addClassModal'));
$('#closeAddClass').addEventListener('click', () => closeModal('#addClassModal'));
$('#addClassForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const subjectId = fd.get('subjectId');
  if (!getSubject(subjectId)) { showToast('Add a subject first.'); return; }
  if (fd.get('end') <= fd.get('start')) { showToast('End time must be after start time.'); return; }
  state.classes.push({ id: crypto.randomUUID(), subjectId, day: fd.get('day'), start: fd.get('start'), end: fd.get('end'), room: fd.get('room') || '' });
  saveData();
  renderTimetable();
  closeModal('#addClassModal');
  e.target.reset();
  showToast('Class added.');
});

// ---------- Attendance ----------

function renderAttendance () {
  const grid = $('#attendanceGrid');
  if (state.subjects.length === 0) {
    grid.innerHTML = '<p style="color:var(--color-text-secondary)">Add subjects in Profile to track attendance.</p>';
    return;
  }
  grid.innerHTML = state.subjects.map(s => {
    const key = subjectKey(s.id);
    const a = state.attendance[key] || { present: 0, absent: 0 };
    const pct = attendancePct(s.id);
    const below = pct < 75;
    const need = classesNeeded(s.id);
    const skip = skippable(s.id);
    return `
    <div class="flip-card" id="flip-${s.id}" data-subject="${s.id}">
      <div class="flip-card-inner tilt-card">
        <div class="flip-card-front ${subjectColor(s.id)}">
          <div class="flip-subject">${escapeHtml(s.name)}</div>
          <div class="flip-pct" style="color:var(--subject)">${pct.toFixed(0)}%</div>
        </div>
        <div class="flip-card-back">
          <div class="flip-subject">${escapeHtml(s.name)}</div>
          <div style="margin-bottom:10px;">
            <div style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:2px">Present ${a.present}</div>
            <div style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:6px">Absent ${a.absent}</div>
          </div>
          <div class="flip-advice">${below ? `Below 75% — attend ${need} more to recover.` : `Above 75% — you can skip ${skip} class${skip === 1 ? '' : 'es'}.`}</div>
        </div>
        <div class="flip-actions">
          <button data-act="p" title="Present">+P</button>
          <button data-act="a" title="Absent">+A</button>
        </div>
      </div>
    </div>`;
  }).join('');

  $$('.flip-card').forEach(card => {
    card.querySelectorAll('.flip-actions button').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = card.dataset.subject;
        const act = btn.dataset.act;
        const a = attendanceOf(id);
        if (act === 'p') a.present += 1; else a.absent += 1;
        saveData();
        renderAttendance();
      });
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('.flip-actions')) return;
      card.classList.toggle('flipped');
    });
  });

  const sel = $('#markForm select[name="subjectId"]');
  sel.innerHTML = state.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

$('#openMarkAttendance').addEventListener('click', () => openModal('#markModal'));
$('#closeMark').addEventListener('click', () => closeModal('#markModal'));
$('#markForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = fd.get('subjectId');
  const present = Number(fd.get('present') || 0);
  const absent = Number(fd.get('absent') || 0);
  const a = attendanceOf(id);
  a.present += present; a.absent += absent;
  saveData();
  renderAttendance();
  closeModal('#markModal');
  e.target.reset();
  showToast('Attendance saved.');
});

// ---------- Exams ----------

function renderExams () {
  const list = $('#examList');
  const now = Date.now();
  const upcoming = state.exams.map(e => ({ ...e, time: new Date(e.date + 'T' + (e.time || '00:00')).getTime() }))
    .filter(e => e.time >= now).sort((a, b) => a.time - b.time);
  list.innerHTML = upcoming.map(e => {
    const s = getSubject(e.subjectId);
    const color = subjectColor(e.subjectId);
    return `<div class="exam-item">
      <div class="exam-dot ${subjectColor(e.subjectId)}" style="background:var(--subject)"></div>
      <div><div class="exam-title">${escapeHtml(e.title)}</div><div class="exam-meta">${escapeHtml(s ? s.name : '')} • ${fmtDate(new Date(e.date))} ${e.time ? '• ' + e.time : ''}</div></div>
    </div>`;
  }).join('');
  renderCountdown();

  const sel = $('#addExamForm select[name="subjectId"]');
  sel.innerHTML = state.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

function renderCountdown () {
  const el = $('#countdown');
  const now = Date.now();
  const upcoming = state.exams.map(e => ({ ...e, time: new Date(e.date + 'T' + (e.time || '00:00')).getTime() }))
    .filter(e => e.time >= now).sort((a, b) => a.time - b.time)[0];
  if (!upcoming) { el.innerHTML = '<span style="color:var(--color-text-secondary)">No upcoming exams.</span>'; return; }
  const diff = upcoming.time - now;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el.innerHTML = `
    <span class="digit"><span class="top">${pad(d)}</span><span class="bottom">${pad(d)}</span></span>
    <span class="digit"><span class="top">${pad(h)}</span><span class="bottom">${pad(h)}</span></span>
    <span class="digit"><span class="top">${pad(m)}</span><span class="bottom">${pad(m)}</span></span>
    <span class="digit"><span class="top">${pad(s)}</span><span class="bottom">${pad(s)}</span></span>
  `;
}

function pad (n) { return String(n).padStart(2, '0'); }

$('#openAddExam').addEventListener('click', () => openModal('#addExamModal'));
$('#closeAddExam').addEventListener('click', () => closeModal('#addExamModal'));
$('#addExamForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const subjectId = fd.get('subjectId');
  if (!getSubject(subjectId)) { showToast('Add a subject first.'); return; }
  state.exams.push({ id: crypto.randomUUID(), subjectId, title: fd.get('title'), date: fd.get('date'), time: fd.get('time') || '' });
  saveData();
  renderExams();
  closeModal('#addExamModal');
  e.target.reset();
  showToast('Exam added.');
});

// ---------- Grades ----------

function renderGrades () {
  const semEl = $('#gradesSemesters');
  const sems = [...new Set(state.grades.map(g => g.semester))].sort((a, b) => Number(a) - Number(b));
  semEl.innerHTML = sems.map(sem => {
    const subs = state.grades.filter(g => g.semester === sem);
    const gpa = gpaOf(sem);
    return `<div class="sem-card">
      <h3>Semester ${sem}</h3>
      ${subs.map(g => {
        const subj = getSubject(g.subjectId);
        const gp = gradePoint(g.marks, g.maxMarks);
        return `<div class="sem-row">
          <div>${escapeHtml(subj ? subj.name : 'Subject')}</div>
          <div>${g.marks} / ${g.maxMarks}</div>
          <div>${gp}</div>
          <div>× ${g.credits}</div>
          <div style="font-weight:700">${(gp * g.credits).toFixed(2)}</div>
        </div>`;
      }).join('')}
      <div class="gpa">GPA: ${gpa.toFixed(2)}</div>
    </div>`;
  }).join('');
  $('#cgpaDisplay').textContent = cgpa().toFixed(2);

  const sel = $('#addGradeForm select[name="subjectId"]');
  sel.innerHTML = state.subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

$('#openAddGrade').addEventListener('click', () => openModal('#addGradeModal'));
$('#closeAddGrade').addEventListener('click', () => closeModal('#addGradeModal'));
$('#addGradeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const subjectId = fd.get('subjectId');
  if (!getSubject(subjectId)) { showToast('Add a subject first.'); return; }
  const marks = Number(fd.get('marks'));
  const max = Number(fd.get('maxMarks'));
  if (marks > max) { showToast('Marks cannot exceed max marks.'); return; }
  state.grades.push({ id: crypto.randomUUID(), subjectId, semester: fd.get('semester'), marks, maxMarks: max, credits: Number(fd.get('credits') || 1) });
  saveData();
  renderGrades();
  closeModal('#addGradeModal');
  e.target.reset();
  showToast('Grade added.');
});

// ---------- Focus / Pomodoro ----------

function renderFocus () {
  const p = state.focus.pomo;
  const total = p.mode === 'work' ? WORK_MIN * 60 : BREAK_MIN * 60;
  const ring = $('#ringFg');
  const circumference = 2 * Math.PI * 40;
  ring.style.strokeDasharray = circumference;
  ring.style.strokeDashoffset = circumference * (1 - p.timeLeft / total);
  $('#timerDisplay').textContent = formatSecs(p.timeLeft);
  $('#pomoMode').textContent = p.mode === 'work' ? 'Pomodoro' : 'Break';
  $('#pomoSessions').textContent = state.focus.sessions;
  renderTodoList();
}

function formatSecs (sec) { const m = Math.floor(sec / 60); const s = sec % 60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }

function pomoTick () {
  const p = state.focus.pomo;
  if (!p.running) return;
  p.timeLeft -= 1;
  if (p.timeLeft <= 0) {
    if (p.mode === 'work') {
      state.focus.sessions += 1;
      notify('Pomodoro complete', 'Time for a break.');
    } else {
      notify('Break complete', 'Ready to focus again.');
    }
    p.mode = p.mode === 'work' ? 'break' : 'work';
    p.timeLeft = (p.mode === 'work' ? WORK_MIN : BREAK_MIN) * 60;
    saveData();
  }
  renderFocus();
}

function startPomo () {
  const p = state.focus.pomo;
  if (p.running) return;
  p.running = true;
  if (!timerId) timerId = setInterval(pomoTick, 1000);
  renderFocus();
}
function pausePomo () {
  state.focus.pomo.running = false;
  renderFocus();
}
function resetPomo () {
  state.focus.pomo.running = false;
  state.focus.pomo.timeLeft = WORK_MIN * 60;
  state.focus.pomo.mode = 'work';
  renderFocus();
}

$('#pomoStart').addEventListener('click', startPomo);
$('#pomoPause').addEventListener('click', pausePomo);
$('#pomoReset').addEventListener('click', resetPomo);

function renderTodoList () {
  const list = $('#todoList');
  list.innerHTML = state.focus.todos.map((t, i) => `
    <li class="todo-item${t.done ? ' done' : ''}">
      <div class="todo-text">${escapeHtml(t.text)}</div>
      <div>
        <button class="btn btn-outline" data-act="toggle" data-idx="${i}">${t.done ? 'Undo' : 'Done'}</button>
        <button class="btn btn-outline" data-act="del" data-idx="${i}">Del</button>
      </div>
    </li>`).join('');
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const act = btn.dataset.act;
      if (act === 'toggle') { state.focus.todos[idx].done = !state.focus.todos[idx].done; }
      if (act === 'del') { state.focus.todos.splice(idx, 1); }
      saveData();
      renderFocus();
    });
  });
}

$('#todoForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = e.target.elements.text.value.trim();
  if (!text) return;
  state.focus.todos.push({ id: crypto.randomUUID(), text, done: false });
  saveData();
  e.target.reset();
  renderFocus();
});

// ---------- Notices ----------

function renderNotices () {
  const list = $('#noticesList');
  const pinned = state.notices.filter(n => n.pinned);
  const rest = state.notices.filter(n => !n.pinned);
  const all = [...pinned, ...rest];
  list.innerHTML = all.map(n => `
    <div class="notice-item${n.pinned ? ' pinned' : ''}">
      <div class="notice-text">${escapeHtml(n.text)}</div>
      <div class="notice-actions">
        <button data-act="pin" data-id="${n.id}">${n.pinned ? 'Unpin' : 'Pin'}</button>
        <button data-act="del" data-id="${n.id}">Delete</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      const n = state.notices.find(x => x.id === id);
      if (!n) return;
      if (act === 'pin') n.pinned = !n.pinned;
      if (act === 'del') state.notices = state.notices.filter(x => x.id !== id);
      saveData();
      renderNotices();
    });
  });
}

$('#openAddNotice').addEventListener('click', () => openModal('#addNoticeModal'));
$('#closeAddNotice').addEventListener('click', () => closeModal('#addNoticeModal'));
$('#addNoticeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.notices.push({ id: crypto.randomUUID(), text: fd.get('text'), pinned: fd.get('pinned') === 'on' });
  saveData();
  renderNotices();
  closeModal('#addNoticeModal');
  e.target.reset();
  showToast('Notice added.');
});

// ---------- Profile ----------

function renderProfile () {
  const f = $('#profileForm');
  f.elements.name.value = state.profile.name;
  f.elements.course.value = state.profile.course;
  f.elements.semester.value = state.profile.semester;
  f.elements.theme.value = state.profile.theme;
}
$('#profileForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.profile = { name: fd.get('name'), course: fd.get('course'), semester: fd.get('semester'), theme: fd.get('theme') };
  applyTheme(state.profile.theme);
  saveData();
  renderProfile();
  showToast('Profile saved.');
});
$('#loadDemo').addEventListener('click', () => {
  state = {
    version: VERSION,
    profile: { name: 'Alex Rivera', course: 'Computer Science', semester: '3', theme: 'light' },
    subjects: [
      { id: 's1', name: 'Data Structures', color: 'c1' },
      { id: 's2', name: 'Operating Systems', color: 'c2' },
      { id: 's3', name: 'Database Systems', color: 'c3' },
      { id: 's4', name: 'Networking', color: 'c4' },
    ],
    classes: [
      { id: 'c1', subjectId: 's1', day: 'mon', start: '09:00', end: '10:00', room: 'A101' },
      { id: 'c2', subjectId: 's2', day: 'mon', start: '11:00', end: '12:30', room: 'B202' },
      { id: 'c3', subjectId: 's3', day: 'wed', start: '14:00', end: '15:30', room: 'C303' },
    ],
    attendance: { 's-s1': { present: 18, absent: 2 }, 's-s2': { present: 10, absent: 5 }, 's-s3': { present: 20, absent: 0 }, 's-s4': { present: 8, absent: 6 } },
    exams: [
      { id: 'e1', subjectId: 's1', title: 'Data Structures Midterm', date: new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10), time: '10:00' },
      { id: 'e2', subjectId: 's3', title: 'Database Final', date: new Date(Date.now() + 86400000 * 12).toISOString().slice(0, 10), time: '14:00' },
    ],
    grades: [
      { id: 'g1', subjectId: 's1', semester: '1', marks: 88, maxMarks: 100, credits: 3 },
      { id: 'g2', subjectId: 's2', semester: '1', marks: 76, maxMarks: 100, credits: 3 },
      { id: 'g3', subjectId: 's1', semester: '2', marks: 91, maxMarks: 100, credits: 4 },
    ],
    focus: { todos: [{ id: 't1', text: 'Review lecture notes', done: false }], sessions: 0, pomo: { timeLeft: WORK_MIN * 60, running: false, mode: 'work' } },
    notices: [{ id: 'n1', text: 'Campus Desk is ready. Add your subjects and classes.', pinned: true }],
  };
  saveData();
  applyTheme(state.profile.theme);
  renderCurrent();
  showToast('Demo data loaded.');
});
$('#clearData').addEventListener('click', () => {
  if (!confirm('Clear all saved data? This cannot be undone.')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultData();
  applyTheme(state.profile.theme);
  renderCurrent();
  showToast('Data cleared.');
});

// ---------- Class reminders ----------

function checkReminders () {
  const now = Date.now();
  const windowMs = REMINDER_MIN * 60 * 1000;
  const day = DAYS[new Date().getDay()];
  for (const c of state.classes) {
    if (c.day !== day) continue;
    const classTime = new Date().toISOString().slice(0, 10) + 'T' + c.start;
    const t = new Date(classTime).getTime();
    const diff = t - now;
    if (diff > 0 && diff <= windowMs) {
      const s = getSubject(c.subjectId);
      notify('Class starting soon', `${s ? s.name : 'Class'} at ${c.start} (${c.room || '—'})`);
    }
  }
}

// ---------- Tilt effect (hover devices only) ----------

function initTilt () {
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches === false) return;
  document.addEventListener('mousemove', (e) => {
    const cards = $$('.tilt-card');
    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = ((e.clientX - cx) / (rect.width / 2)) * 8;
      const dy = -((e.clientY - cy) / (rect.height / 2)) * 8;
      card.style.transform = `rotateX(${dy}deg) rotateY(${dx}deg)`;
    });
  });
  document.addEventListener('mouseleave', () => {
    $$('.tilt-card').forEach(c => { c.style.transform = ''; });
  });
}

// ---------- Boot ----------

function renderCurrent () {
  const view = window.location.hash.replace('#', '') || 'overview';
  showView('#' + view);
}

function init () {
  state = loadData();
  applyTheme(state.profile.theme);
  requestNotification();
  initTilt();

  window.addEventListener('hashchange', () => renderCurrent());
  renderCurrent();

  setInterval(renderCountdown, 1000);
  checkId = setInterval(checkReminders, 60000);
  checkReminders();
}

init();

function escapeHtml (str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
