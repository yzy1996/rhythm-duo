const STORAGE_KEY = "biorhythm-duo-v2"
const SPAN = 31
const HALF = 15
const ENERGY_STEP = 0.25
const WINDOW_MIN = 0.58

const TYPES = [
  { id: "lark", label: "早起型", peak: 11 },
  { id: "mid", label: "均衡型", peak: 14 },
  { id: "owl", label: "夜型", peak: 17 },
]

const CLASSIC = [
  { key: "physical", label: "体力", color: "#FF6B6B", def: 23 },
  { key: "emotional", label: "情绪", color: "#51CF66", def: 28 },
  { key: "intellectual", label: "智力", color: "#339AF0", def: 33 },
]

const $ = (id) => document.getElementById(id)

const els = {
  nameA: $("nameA"),
  nameB: $("nameB"),
  wakeA: $("wakeA"),
  wakeB: $("wakeB"),
  sleepA: $("sleepA"),
  sleepB: $("sleepB"),
  typeA: $("typeA"),
  typeB: $("typeB"),
  birthA: $("birthA"),
  birthB: $("birthB"),
  birthTimeA: $("birthTimeA"),
  birthTimeB: $("birthTimeB"),
  pPhysA: $("pPhysA"),
  pEmoA: $("pEmoA"),
  pIntA: $("pIntA"),
  pPhysB: $("pPhysB"),
  pEmoB: $("pEmoB"),
  pIntB: $("pIntB"),
  targetDate: $("targetDate"),
  prevDay: $("prevDay"),
  nextDay: $("nextDay"),
  todayBtn: $("todayBtn"),
  dateHint: $("dateHint"),
  energyChart: $("energyChart"),
  energyTip: $("energyTip"),
  energyLegend: $("energyLegend"),
  nowRow: $("nowRow"),
  windows: $("windows"),
  classicArea: $("classicArea"),
  bioChart: $("bioChart"),
  bioTip: $("bioTip"),
  bioLegend: $("bioLegend"),
  compatSection: $("compatSection"),
  compatOverall: $("compatOverall"),
  compatBars: $("compatBars"),
  upcoming: $("upcoming"),
  results: $("results"),
}

const typeState = { a: "mid", b: "mid" }

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function todayStr() {
  return fmtDate(new Date())
}

function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function displayDate(s) {
  const [y, m, d] = s.split("-").map(Number)
  return `${y}年${m}月${d}日`
}

function toDate(s) {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function addDays(s, n) {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86400000)
}

function parseTime(s, fallback) {
  if (!s || !s.includes(":")) return fallback
  const [h, m] = s.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback
  return h + m / 60
}

function fmtHour(h) {
  const wrapped = ((h % 24) + 24) % 24
  const hh = Math.floor(wrapped)
  const mm = Math.round((wrapped - hh) * 60) % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function personLabel(which) {
  const name = (which === "a" ? els.nameA : els.nameB).value.trim()
  return name || (which === "a" ? "第一位" : "第二位")
}

function typeMeta(id) {
  return TYPES.find((t) => t.id === id) || TYPES[1]
}

function isAsleep(hour, wake, sleepHours) {
  const sleepStart = (wake - sleepHours + 24) % 24
  if (sleepStart < wake) return hour >= sleepStart && hour < wake
  return hour >= sleepStart || hour < wake
}

function energyAt(hour, wake, sleepHours, chronotype) {
  hour = ((hour % 24) + 24) % 24
  const peak = typeMeta(chronotype).peak
  if (isAsleep(hour, wake, sleepHours)) {
    return { energy: 0.12, asleep: true }
  }
  let awake = hour - wake
  if (awake < 0) awake += 24
  const circadian = (Math.cos((2 * Math.PI * (hour - peak)) / 24) + 1) / 2
  const homeostatic = Math.exp(-awake / 10.5)
  const dip = Math.exp(-((hour - 14.5) ** 2) / 4) * 0.16
  const debt = clamp((7.5 - sleepHours) / 7.5, 0, 1)
  let energy = 0.44 * homeostatic + 0.46 * circadian + 0.1 - dip
  energy *= 1 - 0.22 * debt
  return { energy: clamp(energy, 0.05, 0.98), asleep: false }
}

function bio(days, period) {
  return Math.sin((2 * Math.PI * days) / period)
}

function toIndex(val) {
  return ((val + 1) / 2) * 100
}

function getStatus(days, period) {
  const val = bio(days, period)
  const before = bio(days - 0.5, period)
  const after = bio(days + 0.5, period)
  if (before * after <= 0 || Math.abs(val) < 1e-9) {
    return { text: "临界期", level: "critical", val }
  }
  return val > 0
    ? { text: "高潮期", level: "high", val }
    : { text: "低潮期", level: "low", val }
}

function compatibility(a, b) {
  return (1 - Math.abs(a - b) / 2) * 100
}

function fillSleepSelect(select, value) {
  select.innerHTML = ""
  for (let h = 5; h <= 10.01; h += 0.5) {
    const opt = document.createElement("option")
    opt.value = String(h)
    opt.textContent = `${h.toFixed(1)} 小时`
    select.appendChild(opt)
  }
  select.value = String(value)
}

function renderTypeChips(root, which) {
  root.innerHTML = ""
  TYPES.forEach((t) => {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = `chip${typeState[which] === t.id ? " active" : ""}`
    btn.textContent = t.label
    btn.setAttribute("aria-pressed", String(typeState[which] === t.id))
    btn.addEventListener("click", () => {
      typeState[which] = t.id
      renderTypeChips(root, which)
      render()
    })
    root.appendChild(btn)
  })
}

function loadState() {
  const today = todayStr()
  els.birthA.max = today
  els.birthB.max = today
  els.targetDate.max = addDays(today, 365 * 10)
  fillSleepSelect(els.sleepA, 7.5)
  fillSleepSelect(els.sleepB, 7.5)

  const defaults = {
    nameA: "",
    nameB: "",
    wakeA: "07:00",
    wakeB: "08:00",
    sleepA: "7.5",
    sleepB: "7.5",
    typeA: "mid",
    typeB: "owl",
    birthA: "",
    birthB: "",
    birthTimeA: "",
    birthTimeB: "",
    pPhysA: 23,
    pEmoA: 28,
    pIntA: 33,
    pPhysB: 23,
    pEmoB: 28,
    pIntB: 33,
    targetDate: today,
  }

  let saved = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
  } catch {
    saved = {}
  }
  const s = { ...defaults, ...saved }
  ;[
    "nameA", "nameB", "wakeA", "wakeB", "sleepA", "sleepB",
    "birthA", "birthB", "birthTimeA", "birthTimeB",
    "pPhysA", "pEmoA", "pIntA", "pPhysB", "pEmoB", "pIntB", "targetDate",
  ].forEach((k) => {
    if (els[k]) els[k].value = s[k]
  })
  typeState.a = s.typeA
  typeState.b = s.typeB
  if (!els.targetDate.value) els.targetDate.value = today
  renderTypeChips(els.typeA, "a")
  renderTypeChips(els.typeB, "b")
}

function saveState() {
  try {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      nameA: els.nameA.value,
      nameB: els.nameB.value,
      wakeA: els.wakeA.value,
      wakeB: els.wakeB.value,
      sleepA: els.sleepA.value,
      sleepB: els.sleepB.value,
      typeA: typeState.a,
      typeB: typeState.b,
      birthA: els.birthA.value,
      birthB: els.birthB.value,
      birthTimeA: els.birthTimeA.value,
      birthTimeB: els.birthTimeB.value,
      pPhysA: els.pPhysA.value,
      pEmoA: els.pEmoA.value,
      pIntA: els.pIntA.value,
      pPhysB: els.pPhysB.value,
      pEmoB: els.pEmoB.value,
      pIntB: els.pIntB.value,
      targetDate: els.targetDate.value,
    }),
  )
  } catch {
    // Storage may be unavailable in private browsing; calculation still works.
  }
}

function periodOf(which, key) {
  const map = {
    a: { physical: els.pPhysA, emotional: els.pEmoA, intellectual: els.pIntA },
    b: { physical: els.pPhysB, emotional: els.pEmoB, intellectual: els.pIntB },
  }
  const n = Number(map[which][key].value)
  return clamp(Number.isFinite(n) ? n : CLASSIC.find((c) => c.key === key).def, 15, 60)
}

function snapshot() {
  return {
    a: {
      id: "a",
      name: personLabel("a"),
      wake: parseTime(els.wakeA.value, 7),
      sleep: Number(els.sleepA.value) || 7.5,
      type: typeState.a,
      birth: els.birthA.value,
      birthTime: els.birthTimeA.value,
    },
    b: {
      id: "b",
      name: personLabel("b"),
      wake: parseTime(els.wakeB.value, 8),
      sleep: Number(els.sleepB.value) || 7.5,
      type: typeState.b,
      birth: els.birthB.value,
      birthTime: els.birthTimeB.value,
    },
    target: els.targetDate.value || todayStr(),
  }
}

function daysAlive(person, target, hour = 12) {
  if (!person.birth || !target) return null
  const days = daysBetween(toDate(person.birth), toDate(target))
  if (days < 0) return { invalid: true, days }
  const birthH = parseTime(person.birthTime, 0)
  return { invalid: false, days: days + (hour - birthH) / 24 }
}

function analyzeClassic(person, target) {
  const alive = daysAlive(person, target, 12)
  if (!alive) return null
  if (alive.invalid) return { invalid: true, days: alive.days, person }
  const cycles = {}
  for (const c of CLASSIC) {
    const period = periodOf(person.id, c.key)
    const st = getStatus(alive.days, period)
    cycles[c.key] = { ...c, period, ...st, index: toIndex(st.val) }
  }
  return { invalid: false, days: alive.days, person, cycles }
}

function sampleDay(person) {
  const points = []
  for (let h = 0; h <= 24; h += ENERGY_STEP) {
    const { energy, asleep } = energyAt(h, person.wake, person.sleep, person.type)
    points.push({ hour: h, energy, asleep })
  }
  return points
}

function findWindows(aPts, bPts) {
  const ranges = []
  let start = null
  for (let i = 0; i < aPts.length; i++) {
    const ok =
      !aPts[i].asleep &&
      !bPts[i].asleep &&
      aPts[i].energy >= WINDOW_MIN &&
      bPts[i].energy >= WINDOW_MIN
    if (ok && start === null) start = aPts[i].hour
    if (!ok && start !== null) {
      ranges.push({ start, end: aPts[i].hour })
      start = null
    }
  }
  if (start !== null) ranges.push({ start, end: 24 })
  return ranges.filter((r) => r.end - r.start >= 0.75)
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const W = Math.max(rect.width, 1)
  const H = Math.max(rect.height, 1)
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext("2d")
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, W, H }
}

function drawEnergy(people, target) {
  const { ctx, W, H } = setupCanvas(els.energyChart)
  const pad = { t: 22, r: 16, b: 30, l: 40 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b
  const mx = (h) => pad.l + (h / 24) * cw
  const my = (v) => pad.t + ch * (1 - v)

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = "#FAFBFC"
  ctx.fillRect(pad.l, pad.t, cw, ch)

  people.forEach((p, idx) => {
    const sleepStart = (p.wake - p.sleep + 24) % 24
    ctx.fillStyle = idx === 0 ? "rgba(74,108,247,0.06)" : "rgba(217,119,6,0.06)"
    if (sleepStart < p.wake) {
      ctx.fillRect(mx(sleepStart), pad.t, mx(p.wake) - mx(sleepStart), ch)
    } else {
      ctx.fillRect(mx(sleepStart), pad.t, mx(24) - mx(sleepStart), ch)
      ctx.fillRect(mx(0), pad.t, mx(p.wake) - mx(0), ch)
    }
  })

  ;[0, 0.25, 0.5, 0.75, 1].forEach((v) => {
    ctx.strokeStyle = v === 0.5 ? "#CBD5E0" : "#EDF2F7"
    ctx.lineWidth = v === 0.5 ? 1 : 0.5
    ctx.beginPath()
    ctx.moveTo(pad.l, my(v))
    ctx.lineTo(W - pad.r, my(v))
    ctx.stroke()
  })

  ctx.fillStyle = "#A0AEC0"
  ctx.font = "11px -apple-system, sans-serif"
  ctx.textAlign = "right"
  ctx.textBaseline = "middle"
  ;[
    [1, "醒"],
    [0.5, "中"],
    [0, "睡"],
  ].forEach(([v, label]) => ctx.fillText(label, pad.l - 6, my(v)))

  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  for (let h = 0; h <= 24; h += 3) {
    ctx.fillStyle = "#A0AEC0"
    ctx.fillText(h === 24 ? "24" : String(h), mx(h), H - pad.b + 8)
  }

  const samples = people.map(sampleDay)
  if (samples.length === 2) {
    const windows = findWindows(samples[0], samples[1])
    ctx.fillStyle = "rgba(56,161,105,0.12)"
    windows.forEach((w) => {
      ctx.fillRect(mx(w.start), pad.t, mx(w.end) - mx(w.start), ch)
    })
  }

  const colors = ["#4A6CF7", "#D97706"]
  samples.forEach((pts, i) => {
    ctx.strokeStyle = colors[i]
    ctx.lineWidth = i === 0 ? 2.5 : 2
    ctx.setLineDash(i === 0 ? [] : [7, 5])
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.beginPath()
    pts.forEach((p, n) => {
      const x = mx(p.hour)
      const y = my(p.energy)
      n === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.setLineDash([])
  })

  if (target === todayStr()) {
    const now = new Date()
    const hour = now.getHours() + now.getMinutes() / 60
    ctx.strokeStyle = "#4A6CF7"
    ctx.setLineDash([4, 3])
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(mx(hour), pad.t)
    ctx.lineTo(mx(hour), H - pad.b)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.fillStyle = "#4A6CF7"
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText("现在", mx(hour), pad.t - 4)
  }
}

function drawClassic(reports, target) {
  const { ctx, W, H } = setupCanvas(els.bioChart)
  const pad = { t: 24, r: 16, b: 32, l: 40 }
  const cw = W - pad.l - pad.r
  const ch = H - pad.t - pad.b
  const mx = (offset) => pad.l + (offset / (SPAN - 1)) * cw
  const my = (v) => pad.t + ch * (1 - (v + 1) / 2)

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = "#FAFBFC"
  ctx.fillRect(pad.l, pad.t, cw, ch)

  ;[-1, -0.5, 0, 0.5, 1].forEach((v) => {
    ctx.strokeStyle = v === 0 ? "#CBD5E0" : "#EDF2F7"
    ctx.lineWidth = v === 0 ? 1 : 0.5
    ctx.beginPath()
    ctx.moveTo(pad.l, my(v))
    ctx.lineTo(W - pad.r, my(v))
    ctx.stroke()
  })

  ctx.fillStyle = "#A0AEC0"
  ctx.font = "11px -apple-system, sans-serif"
  ctx.textAlign = "right"
  ctx.textBaseline = "middle"
  ;[[1, "高"], [0, "中"], [-1, "低"]].forEach(([v, label]) => {
    ctx.fillText(label, pad.l - 6, my(v))
  })

  const targetDate = toDate(target)
  ctx.textAlign = "center"
  ctx.textBaseline = "top"
  for (let i = 0; i < SPAN; i += 5) {
    const dt = new Date(targetDate)
    dt.setDate(dt.getDate() - HALF + i)
    ctx.fillStyle = "#A0AEC0"
    ctx.fillText(`${dt.getMonth() + 1}/${dt.getDate()}`, mx(i), H - pad.b + 8)
  }

  const tx = mx(HALF)
  ctx.save()
  ctx.strokeStyle = "#4A6CF7"
  ctx.setLineDash([5, 3])
  ctx.globalAlpha = 0.5
  ctx.beginPath()
  ctx.moveTo(tx, pad.t)
  ctx.lineTo(tx, H - pad.b)
  ctx.stroke()
  ctx.restore()

  const valid = reports.filter((r) => r && !r.invalid)
  valid.forEach((r) => {
    const dashed = r.person.id === "b"
    CLASSIC.forEach((c) => {
      const period = r.cycles[c.key].period
      const points = []
      const steps = (SPAN - 1) * 4
      for (let i = 0; i <= steps; i++) {
        const offset = i / 4
        points.push({
          x: mx(offset),
          y: my(bio(r.days - HALF + offset, period)),
        })
      }
      ctx.strokeStyle = c.color
      ctx.lineWidth = dashed ? 2 : 2.5
      ctx.setLineDash(dashed ? [7, 5] : [])
      ctx.beginPath()
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
      ctx.setLineDash([])
      const tv = bio(r.days, period)
      ctx.fillStyle = c.color
      ctx.beginPath()
      ctx.arc(tx, my(tv), 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(tx, my(tv), 2, 0, Math.PI * 2)
      ctx.fill()
    })
  })
}

function renderEnergyUI(state) {
  const people = [state.a, state.b]
  els.energyLegend.innerHTML = people
    .map(
      (p, i) =>
        `<div class="legend-item" style="color:${i === 0 ? "#4A6CF7" : "#D97706"}">
          <span class="legend-line${i ? " dash" : ""}"></span>${escapeHtml(p.name)} · ${typeMeta(p.type).label}
        </div>`,
    )
    .join("")

  const aPts = sampleDay(state.a)
  const bPts = sampleDay(state.b)
  const windows = findWindows(aPts, bPts)
  if (windows.length) {
    els.windows.innerHTML = windows
      .map((w) => `<span class="window-pill">共同较好 ${fmtHour(w.start)}–${fmtHour(w.end)}</span>`)
      .join("")
  } else {
    els.windows.innerHTML = `<p class="window-empty">这两天作息错开较多，没有明显的共同高精力时段。</p>`
  }

  if (state.target === todayStr()) {
    const now = new Date()
    const hour = now.getHours() + now.getMinutes() / 60
    const ea = energyAt(hour, state.a.wake, state.a.sleep, state.a.type)
    const eb = energyAt(hour, state.b.wake, state.b.sleep, state.b.type)
    const ta = ea.asleep ? "还在睡" : `${Math.round(ea.energy * 100)}%`
    const tb = eb.asleep ? "还在睡" : `${Math.round(eb.energy * 100)}%`
    els.nowRow.hidden = false
    els.nowRow.innerHTML = `现在 ${fmtHour(hour)} · ${escapeHtml(state.a.name)} <strong>${ta}</strong> · ${escapeHtml(state.b.name)} <strong>${tb}</strong>`
  } else {
    els.nowRow.hidden = true
  }

  drawEnergy(people, state.target)
}

function nextEvents(report, target) {
  const items = []
  for (let d = 1; d <= 16 && items.length < 6; d++) {
    const date = addDays(target, d)
    CLASSIC.forEach((c) => {
      const period = report.cycles[c.key].period
      const st = getStatus(report.days + d, period)
      if (st.level === "critical") items.push({ date, name: report.person.name, label: c.label, kind: "临界" })
      else if (st.val > 0.9) items.push({ date, name: report.person.name, label: c.label, kind: "高峰" })
      else if (st.val < -0.9) items.push({ date, name: report.person.name, label: c.label, kind: "低谷" })
    })
  }
  return items.slice(0, 8)
}

function renderClassic(state, ra, rb) {
  const reports = [ra, rb].filter(Boolean)
  const valid = reports.filter((r) => !r.invalid)
  const invalids = reports.filter((r) => r.invalid)

  if (invalids.length) {
    els.dateHint.hidden = false
    els.dateHint.textContent = invalids
      .map((r) => `${r.person.name}的查询日早于出生日期`)
      .join("；")
  } else {
    els.dateHint.hidden = true
  }

  if (!valid.length) {
    els.classicArea.hidden = false
    $("classicEmpty").hidden = false
    els.bioChart.parentElement.hidden = true
    els.bioLegend.innerHTML = ""
    els.compatSection.hidden = true
    els.upcoming.hidden = true
    els.results.innerHTML = ""
    return
  }

  els.classicArea.hidden = false
  $("classicEmpty").hidden = true
  els.bioChart.parentElement.hidden = false
  els.bioLegend.innerHTML = ""
  valid.forEach((r) => {
    CLASSIC.forEach((c) => {
      const item = document.createElement("div")
      item.className = "legend-item"
      item.style.color = c.color
      item.innerHTML = `<span class="legend-line${r.person.id === "b" ? " dash" : ""}"></span>${escapeHtml(r.person.name)} · ${c.label}`
      els.bioLegend.appendChild(item)
    })
  })

  drawClassic(reports, state.target)

  if (ra && !ra.invalid && rb && !rb.invalid) {
    const rows = CLASSIC.map((c) => ({
      ...c,
      score: compatibility(ra.cycles[c.key].val, rb.cycles[c.key].val),
    }))
    const overall = rows.reduce((s, r) => s + r.score, 0) / rows.length
    els.compatOverall.textContent = `${overall.toFixed(1)}%`
    els.compatBars.innerHTML = rows
      .map(
        (r) => `
        <div class="compat-row">
          <span>${r.label}</span>
          <div class="compat-track"><div class="compat-fill" style="width:${r.score}%;background:${r.color}"></div></div>
          <strong>${r.score.toFixed(1)}%</strong>
        </div>`,
      )
      .join("")
    els.compatSection.hidden = false
  } else {
    els.compatSection.hidden = true
  }

  const events = valid.flatMap((r) => nextEvents(r, state.target))
  if (events.length) {
    els.upcoming.hidden = false
    els.upcoming.innerHTML =
      `<h2>传统层近日节点</h2><p class="chart-lead">按当前周期推的过零 / 近峰值日，娱乐参考。</p>` +
      `<div class="upcoming-list">${events
        .map(
          (e) =>
            `<div class="upcoming-item"><span>${displayDate(e.date)} · ${escapeHtml(e.name)} · ${e.label}</span><b>${e.kind}</b></div>`,
        )
        .join("")}</div>`
  } else {
    els.upcoming.hidden = true
  }

  els.results.className = valid.length === 1 ? "results single" : "results"
  els.results.innerHTML = valid
    .map((r) => {
      const cards = CLASSIC.map((c) => {
        const row = r.cycles[c.key]
        return `
          <article class="result-card">
            <div class="stripe" style="background:${c.color}"></div>
            <div class="result-main">
              <div class="result-top">
                <span class="name">${c.label} · ${row.period}天</span>
                <span class="status ${row.level}">${row.text}</span>
              </div>
              <div class="result-value" style="color:${c.color}">${row.index.toFixed(2)}%</div>
              <div class="bar"><i style="width:${row.index}%;background:${c.color}"></i></div>
            </div>
          </article>`
      }).join("")
      return `
        <div class="result-col">
          <h3>
            <span class="dot" style="background:${r.person.id === "a" ? "var(--person-a)" : "var(--person-b)"}"></span>
            ${escapeHtml(r.person.name)}
          </h3>
          <p class="meta">${displayDate(state.target)} · 约出生第 ${Math.round(r.days)} 天</p>
          ${cards}
        </div>`
    })
    .join("")
}

function bindChartTip(canvas, tip, hitFn) {
  canvas.onpointermove = (e) => {
    const hit = hitFn(e)
    if (!hit) {
      tip.hidden = true
      return
    }
    tip.hidden = false
    tip.style.left = `${hit.x}px`
    tip.style.top = "24px"
    tip.innerHTML = hit.html
  }
  canvas.onpointerleave = () => {
    tip.hidden = true
  }
}

function render() {
  saveState()
  const state = snapshot()
  renderEnergyUI(state)
  const ra = analyzeClassic(state.a, state.target)
  const rb = analyzeClassic(state.b, state.target)
  renderClassic(state, ra, rb)
}

function init() {
  loadState()
  const watched = [
    "nameA", "nameB", "wakeA", "wakeB", "sleepA", "sleepB",
    "birthA", "birthB", "birthTimeA", "birthTimeB",
    "pPhysA", "pEmoA", "pIntA", "pPhysB", "pEmoB", "pIntB", "targetDate",
  ]
  watched.forEach((k) => {
    els[k].addEventListener("input", render)
    els[k].addEventListener("change", render)
  })
  els.prevDay.addEventListener("click", () => {
    els.targetDate.value = addDays(els.targetDate.value || todayStr(), -1)
    render()
  })
  els.nextDay.addEventListener("click", () => {
    els.targetDate.value = addDays(els.targetDate.value || todayStr(), 1)
    render()
  })
  els.todayBtn.addEventListener("click", () => {
    els.targetDate.value = todayStr()
    render()
  })
  window.addEventListener("resize", () => render())

  bindChartTip(els.energyChart, els.energyTip, (e) => {
    const rect = els.energyChart.getBoundingClientRect()
    const padL = 40
    const padR = 16
    const x = e.clientX - rect.left
    const hour = ((x - padL) / (rect.width - padL - padR)) * 24
    if (hour < 0 || hour > 24) return null
    const s = snapshot()
    const ea = energyAt(hour, s.a.wake, s.a.sleep, s.a.type)
    const eb = energyAt(hour, s.b.wake, s.b.sleep, s.b.type)
    const line = (p, ev) =>
      `${escapeHtml(p.name)} ${ev.asleep ? "睡眠中" : `精力 ${Math.round(ev.energy * 100)}%`}`
    return {
      x: padL + (hour / 24) * (rect.width - padL - padR),
      html: `<strong>${fmtHour(hour)}</strong><br>${line(s.a, ea)}<br>${line(s.b, eb)}`,
    }
  })

  bindChartTip(els.bioChart, els.bioTip, (e) => {
    const s = snapshot()
    const reports = [analyzeClassic(s.a, s.target), analyzeClassic(s.b, s.target)].filter(
      (r) => r && !r.invalid,
    )
    if (!reports.length) return null
    const rect = els.bioChart.getBoundingClientRect()
    const padL = 40
    const padR = 16
    const cw = rect.width - padL - padR
    const offset = ((e.clientX - rect.left - padL) / cw) * (SPAN - 1)
    if (offset < 0 || offset > SPAN - 1) return null
    const dayOffset = Math.round(offset - HALF)
    const date = addDays(s.target, dayOffset)
    const lines = reports.flatMap((r) =>
      CLASSIC.map((c) => {
        const period = r.cycles[c.key].period
        return `${escapeHtml(r.person.name)} ${c.label} ${toIndex(bio(r.days + dayOffset, period)).toFixed(1)}%`
      }),
    )
    return {
      x: padL + ((dayOffset + HALF) / (SPAN - 1)) * cw,
      html: `<strong>${displayDate(date)}</strong><br>${lines.join("<br>")}`,
    }
  })

  render()
}

init()
