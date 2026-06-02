const DATA_FILES = {
  releases: "./data/releases.json",
  main: "./data/results_main.json",
  live: "./data/results_live.json",
  distribution: "./data/task_distribution.json",
};

const TASK_SCORE_KEYS = [
  ["file_creation", "File"],
  ["code_fixing", "Code"],
  ["data_codebase_querying", "Data"],
  ["command_execution", "Command"],
  ["project_building", "Project"],
];

const state = {
  releaseKey: "main",
  sortMetric: "sample",
  releases: [],
  results: {},
  distribution: null,
};

function $(id) {
  return document.getElementById(id);
}

function fmtPercent(value) {
  return value === null || value === undefined ? "-" : `${Number(value).toFixed(1)}`;
}

function fmtPctLabel(value) {
  return value === null || value === undefined ? "-" : `${Number(value).toFixed(1)}%`;
}

function fmtNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function currentRelease() {
  const kind = state.releaseKey === "main" ? "main" : "live";
  return state.releases.find((release) => release.kind === kind);
}

function currentRows() {
  return (state.results[state.releaseKey] || { results: [] }).results;
}

function sortedRows() {
  const metric = state.sortMetric;
  return [...currentRows()].sort((a, b) => {
    const primary = (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity);
    if (primary !== 0) return primary;
    const task = (b.task_avg ?? -Infinity) - (a.task_avg ?? -Infinity);
    if (task !== 0) return task;
    return (b.pass_at_3 ?? -Infinity) - (a.pass_at_3 ?? -Infinity);
  });
}

function setActiveNav() {
  const page = document.body.dataset.page;
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const isActive = link.getAttribute("href")?.includes(page === "overview" ? "index" : page);
    if (isActive) link.setAttribute("aria-current", "page");
  });
}

function renderOverview() {
  const main = state.releases.find((release) => release.kind === "main");
  if (!main) return;
  const mainCases = document.querySelector('[data-stat="main_cases"]');
  const modelCount = document.querySelector('[data-stat="models"]');
  if (mainCases) mainCases.textContent = fmtNumber(main.case_count);
  if (modelCount) modelCount.textContent = fmtNumber(main.models);
}

function renderBars(element, rows, maxValue, valueFormatter = fmtNumber) {
  if (!element) return;
  const colors = ["#2563eb", "#22c55e", "#ff6b1a", "#8b5cf6", "#ef3434", "#14b8a6"];
  element.innerHTML = rows.map((row, index) => {
    const width = Math.max(2, row.value / maxValue * 100);
    return `
      <div class="bar-row">
        <div class="bar-label" title="${row.label}">${row.label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${width}%; background:${colors[index % colors.length]}"></div>
        </div>
        <div class="bar-value">${valueFormatter(row.value)}</div>
      </div>
    `;
  }).join("");
}

function renderDistribution() {
  if (!state.distribution) return;
  const tasks = state.distribution.tasks;
  const taskRows = tasks.map((task) => ({ label: task.label, value: task.cases }));
  renderBars($("taskTypeBars"), taskRows, Math.max(...taskRows.map((row) => row.value)));

  const main = state.releases.find((release) => release.kind === "main");
  if (main) {
    const funnelRows = Object.entries(main.construction_funnel).map(([label, value]) => ({
      label: label.replaceAll("_", " "),
      value,
    }));
    renderBars($("funnelBars"), funnelRows, Math.max(...funnelRows.map((row) => row.value)));
  }

  const tbody = $("subtaskRows");
  if (!tbody) return;
  tbody.innerHTML = tasks.map((task) => {
    const taskRow = `
      <tr class="task-row">
        <td>${task.id}</td>
        <td>${task.label}</td>
        <td>${task.cases}</td>
        <td>${fmtPctLabel(task.share_all)}</td>
        <td>-</td>
      </tr>
    `;
    const subtasks = task.subtasks.map((subtask) => `
      <tr class="subtask-row">
        <td>${subtask.id}</td>
        <td>${subtask.description}</td>
        <td>${subtask.cases}</td>
        <td>${fmtPctLabel(subtask.share_all)}</td>
        <td>${fmtPctLabel(subtask.share_task)}</td>
      </tr>
    `).join("");
    return taskRow + subtasks;
  }).join("");
}

function rankBadge(rank) {
  const className = rank <= 3 ? `rank-${rank}` : "";
  return `<span class="rank-badge ${className}">${rank}</span>`;
}

function renderReleaseTabs() {
  const container = $("releaseTabs");
  if (!container) return;
  container.innerHTML = state.releases.map((release) => {
    const key = release.kind === "main" ? "main" : "live";
    return `<button type="button" data-release="${key}" aria-pressed="${state.releaseKey === key}">${release.kind === "main" ? "Main Release" : "Live Subset"}</button>`;
  }).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.releaseKey = button.dataset.release;
      if (state.releaseKey === "live" && state.sortMetric === "subtask_avg") {
        state.sortMetric = "sample";
        const sort = $("sortMetric");
        if (sort) sort.value = "sample";
      }
      renderLeaderboard();
    });
  });
}

function renderLeaderboard() {
  const release = currentRelease();
  const summary = $("releaseSummary");
  if (summary && release) {
    summary.innerHTML = `<strong>${fmtNumber(release.case_count)} tasks</strong> selected in ${release.label}. All scores are computed by case-specific deterministic Python verifiers under the same OpenClaw harness.`;
  }

  const sort = $("sortMetric");
  if (sort) {
    const subtaskOption = sort.querySelector('option[value="subtask_avg"]');
    if (subtaskOption) subtaskOption.disabled = state.releaseKey === "live";
  }

  renderReleaseTabs();
  const tbody = $("leaderboardRows");
  if (!tbody) return;

  tbody.innerHTML = sortedRows().map((row, index) => {
    const rank = index + 1;
    const taskCells = TASK_SCORE_KEYS.map(([key]) => `<td>${fmtPercent(row.task_scores?.[key])}</td>`).join("");
    return `
      <tr>
        <td>${rankBadge(rank)}</td>
        <td class="model-cell">${row.model}<span class="provider-note">${row.provider}</span></td>
        <td>${fmtPercent(row.sample)}</td>
        <td>${fmtPercent(row.task_avg)}</td>
        <td>${fmtPercent(row.subtask_avg)}</td>
        <td>${fmtPercent(row.pass_at_3)}</td>
        ${taskCells}
      </tr>
    `;
  }).join("");
}

function bindLeaderboardControls() {
  const sort = $("sortMetric");
  if (sort) {
    sort.addEventListener("change", () => {
      state.sortMetric = sort.value;
      renderLeaderboard();
    });
  }

  const liveButton = $("showLiveRelease");
  if (liveButton) {
    liveButton.addEventListener("click", () => {
      state.releaseKey = "live";
      renderLeaderboard();
      document.querySelector(".leaderboard-controls")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

async function init() {
  setActiveNav();
  const page = document.body.dataset.page;
  const [releases, main, live] = await Promise.all([
    loadJson(DATA_FILES.releases),
    loadJson(DATA_FILES.main),
    loadJson(DATA_FILES.live),
  ]);
  state.releases = releases.releases;
  state.results.main = main;
  state.results.live = live;

  if (page === "overview") renderOverview();
  if (page === "distribution") {
    state.distribution = await loadJson(DATA_FILES.distribution);
    renderDistribution();
  }
  if (page === "leaderboard") {
    bindLeaderboardControls();
    renderLeaderboard();
  }
}

init().catch((error) => {
  document.body.innerHTML = `<main class="paper-page"><section class="page-title"><h1>RealClawBench</h1></section><section class="notice-card"><p>${error.message}</p></section></main>`;
});
