/* ---------- Utilities ---------- */
function mulberry32(a) {
    return function () {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function randint(rng, min, maxInclusive) {
    return Math.floor(rng() * (maxInclusive - min + 1)) + min;
}
function die(rng) { return randint(rng, 1, 6); }

function rollSession(rng, rollsPerSession, explode) {
    let total = 0;
    for (let i = 0; i < rollsPerSession; i++) {
        const d = die(rng); total += d;
        if (explode && d === 6) {
            // chain until non-6
            while (true) {
                const e = die(rng); total += e;
                if (e !== 6) break;
            }
        }
    }
    return total;
}

function quantiles(arr) {
    if (arr.length === 0) return { min: 0, q1: 0, med: 0, q3: 0, max: 0 };
    const a = arr.slice().sort((x, y) => x - y);
    const nth = (p) => {
        const idx = (a.length - 1) * p;
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        if (lo === hi) return a[lo];
        const w = idx - lo;
        return a[lo] * (1 - w) + a[hi] * w;
    };
    return {
        min: a[0],
        q1: nth(0.25),
        med: nth(0.50),
        q3: nth(0.75),
        max: a[a.length - 1],
    };
}
function meanStd(arr) {
    const n = arr.length || 1;
    const m = arr.reduce((s, x) => s + x, 0) / n;
    const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, n - 1);
    return { mean: m, std: Math.sqrt(v) };
}
function toCSV(rows, headers) {
    const esc = (v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = headers.join(",");
    const body = rows.map(r => headers.map(h => esc(r[h])).join(",")).join("\n");
    return head + "\n" + body;
}
function download(filename, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/* ---------- Histogram drawing (simple canvas) ---------- */
/* ---------- Histogram drawing (simple canvas) ---------- */
function drawHist(canvas, values) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!values || values.length === 0) return;

    const maxDataVal = Math.max(...values);

    // Smart Tick Calculation
    // Constraint: "nearest 10 when < 1000, 100 increments after"
    // We try to find a nice step size satisfying user preference and fitting ~5-10 ticks
    let step;
    if (maxDataVal < 1000) {
        // Steps of 10, 20, 50, 100, 200, 500
        const possibleSteps = [10, 20, 50, 100, 200, 500];
        step = possibleSteps.find(s => maxDataVal / s <= 8) || 500;
    } else {
        // Steps of 100, 200, 500, 1000...
        const magnitude = Math.pow(10, Math.floor(Math.log10(maxDataVal)));
        const possibleSteps = [
            100, 200, 500,
            1000, 2000, 5000,
            10000, 20000, 50000
        ];
        // Filter to those >= 100
        const validSteps = possibleSteps.filter(s => s >= 100);
        step = validSteps.find(s => maxDataVal / s <= 8) || magnitude;
    }

    const maxAxisVal = Math.ceil(maxDataVal / step) * step;
    const ticks = [];
    for (let t = 0; t <= maxAxisVal; t += step) {
        ticks.push(t);
    }

    // Binning based on new axis max 
    // (We still want decent resolution for the bars, independent of ticks?)
    // Actually, normally bins covers the data range. The axis is just visual.
    // Let's keep binning based on maxDataVal to show detail, but scale X relative to maxAxisVal.

    // Re-bin with visual scaling
    // We want the plot to cover 0 -> maxAxisVal
    const binCount = 40; // Fixed resolution for cleaner bars
    const bins = new Array(binCount).fill(0);
    // Map values to bins over range [0, maxAxisVal]
    for (const v of values) {
        // Prevent out of bounds if maxAxisVal < v (shouldn't happen due to ceil)
        let b = Math.floor((v / maxAxisVal) * binCount);
        if (b >= binCount) b = binCount - 1;
        bins[b]++;
    }

    // margins
    const W = canvas.width, H = canvas.height;
    const padL = 40, padR = 20, padT = 20, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxBinCount = Math.max(...bins, 1);

    // Draw Gridlines & Ticks first (behind bars)
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial";

    ticks.forEach(t => {
        const xPct = t / maxAxisVal;
        const x = padL + (xPct * plotW);
        const y = padT + plotH;

        // Gridline
        ctx.strokeStyle = "#1d2230"; // faint line
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Label
        ctx.fillStyle = "#9fb3c8";
        ctx.fillText(String(t), x, y + 14);
    });

    // Axes
    ctx.strokeStyle = "#294460";
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // Bars
    const barW = plotW / binCount;
    ctx.fillStyle = "#5eead4";
    for (let i = 0; i < binCount; i++) {
        const h = (bins[i] / maxBinCount) * plotH;
        const x = padL + i * barW;
        const y = padT + (plotH - h);
        // Leave 1px gap
        ctx.fillRect(x + 1, y, Math.max(0, barW - 1), h);
    }

    // Y-axis labels (Count)
    ctx.fillStyle = "#9fb3c8";
    ctx.textAlign = "right";
    ctx.fillText(String(maxBinCount), padL - 6, padT + 12);
    ctx.fillText("0", padL - 6, padT + plotH);

    // X-axis title
    ctx.textAlign = "center";
    ctx.font = "bold 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Position (Steps)", padL + plotW / 2, padT + plotH + 32);
}

/* ---------- Main simulation ---------- */
const DAYS = 30;
const MILESTONES = [7, 14, 21, 30];
const SIM_START_DATE = new Date("2024-01-01T08:00:00");

function addHours(date, h) {
    const d = new Date(date);
    d.setHours(d.getHours() + h);
    return d;
}

function formatTime(date) {
    return date.toISOString().replace("T", " ").substring(0, 19);
}

function simulate(params) {
    const { users, sessionsPerDay, rollsPerSession, pPlay, explodeSix, seed } = params;
    const rng = mulberry32((seed >>> 0) || 42);

    // Pre-allocate arrays for stats
    const positions = Array.from({ length: users }, () => new Array(DAYS).fill(0));
    const steps = new Array(users).fill(0);

    const playedSessionsPerDay = Array.from({ length: users }, () => new Array(DAYS).fill(0));
    const stepsGainedPerDay = Array.from({ length: users }, () => new Array(DAYS).fill(0));

    // Detailed history: [userIndex][dayIndex] -> Array of Session Objects
    // We use a flat structure or nested? Nested is easier for access by UserID.
    const history = Array.from({ length: users }, () => []);

    for (let d = 0; d < DAYS; d++) {
        // Base time for this day (e.g. 9 AM)
        const dayDate = new Date(SIM_START_DATE);
        dayDate.setDate(dayDate.getDate() + d);

        for (let u = 0; u < users; u++) {
            if (!history[u][d]) history[u][d] = [];

            let daySteps = 0;
            let playedCount = 0;

            for (let s = 0; s < sessionsPerDay; s++) {
                // Simulate session time: 9am + (s * 4 hours) + random jitter
                const sessionTime = addHours(dayDate, (s * 4) + (rng() * 2)); // Spread sessions out

                let played = false;
                let sessionSteps = 0;
                let startPos = steps[u];
                let itemsFound = "";

                if (rng() < pPlay) {
                    played = true;
                    playedCount++;
                    sessionSteps = rollSession(rng, rollsPerSession, explodeSix);

                    // Item logic: 5% chance to find an item
                    if (rng() < 0.05) {
                        const itemType = rng() < 0.5 ? "Mystery Box" : "Gold Coin";
                        itemsFound = itemType;
                    }
                }

                steps[u] += sessionSteps;

                // Record detailed session data
                history[u][d].push({
                    day: d + 1,
                    sessionIndex: s + 1,
                    timestamp: formatTime(sessionTime),
                    startPos: startPos,
                    endPos: steps[u],
                    stepsGained: sessionSteps,
                    played: played,
                    items: itemsFound
                });
            }

            daySteps = steps[u] - (d > 0 ? positions[u][d - 1] : 0); // Total gained today (simple diff) or track accum
            // Actually we tracked cumulative steps in `steps[u]`, so we just set position
            positions[u][d] = steps[u];
            playedSessionsPerDay[u][d] = playedCount;
            stepsGainedPerDay[u][d] = stepsGainedPerDay[u][d] + (positions[u][d] - (d > 0 ? positions[u][d - 1] : 0)); // Re-calc pure gain
        }
    }

    return { positions, playedSessionsPerDay, stepsGainedPerDay, history };
}

/* ---------- UI wiring ---------- */
const $ = (id) => document.getElementById(id);
const runBtn = $("run");
const dlPosBtn = $("dlPositions");
const dlMilBtn = $("dlMilestones");
const dlLbBtn = $("dlLeaderboard");
const partSlider = $("participation");
const partVal = $("partVal");
partSlider.addEventListener("input", () => partVal.textContent = partSlider.value + "%");
partVal.textContent = partSlider.value + "%";

let lastArtifacts = null;

runBtn.addEventListener("click", () => {
    runBtn.disabled = true;
    dlPosBtn.disabled = true; dlMilBtn.disabled = true; dlLbBtn.disabled = true;
    if ($("dlDetailed")) $("dlDetailed").disabled = true;

    $("leaderboardCard").style.display = $("leaderboard").checked ? "block" : "none";
    $("stats").innerHTML = "Running…";

    try {
        // read params
        const rollsPerSession = Math.max(1, parseInt($("rollsPerSession").value || "1", 10));
        const sessionsPerDay = Math.max(1, parseInt($("sessionsPerDay").value || "1", 10));
        const users = Math.max(1, parseInt($("numUsers").value || "1000", 10));
        const pPlay = Math.min(1, Math.max(0, parseInt(partSlider.value, 10) / 100));
        const explodeSix = $("doubleSix").checked;
        const leaderboard = $("leaderboard").checked;
        const seed = parseInt($("seed").value || "42", 10) >>> 0;

        const t0 = performance.now();
        const sim = simulate({ users, sessionsPerDay, rollsPerSession, pPlay, explodeSix, seed });
        const t1 = performance.now();

        // Build milestone stats & histograms
        const statsDiv = $("stats");
        statsDiv.innerHTML = "";
        const table = document.createElement("table");
        const header = document.createElement("tr");
        ["Day", "Users", "Mean", "Std", "Min", "25%", "Median", "75%", "Max"].forEach(h => {
            const th = document.createElement("th"); th.textContent = h; header.appendChild(th);
        });
        table.appendChild(header);

        const milestoneRows = [];
        const histTargets = { 7: "hist7", 14: "hist14", 21: "hist21", 30: "hist30" };
        const countTargets = { 7: "count7", 14: "count14", 21: "count21", 30: "count30" };

        for (const m of MILESTONES) {
            const arr = sim.positions.map(p => p[m - 1]); // position at day m
            const { mean, std } = meanStd(arr);
            const { min, q1, med, q3, max } = quantiles(arr);

            const tr = document.createElement("tr");
            const cells = [m, users, mean.toFixed(2), std.toFixed(2), min, q1.toFixed(2), med.toFixed(2), q3.toFixed(2), max];
            cells.forEach((c, i) => {
                const td = document.createElement("td");
                td.textContent = c;
                if (i === 0 || i === 1) td.style.textAlign = "left";
                tr.appendChild(td);
            });
            table.appendChild(tr);

            milestoneRows.push({
                day: m, users, mean: mean.toFixed(6), std: std.toFixed(6),
                min, p25: q1.toFixed(6), median: med.toFixed(6), p75: q3.toFixed(6), max
            });

            // hist
            const canvas = $(histTargets[m]);
            drawHist(canvas, arr);
            $(countTargets[m]).textContent = `${arr.length} users`;
        }
        statsDiv.appendChild(table);

        // Leaderboard (day 30)
        let leaderboardRows = [];
        if (leaderboard) {
            const day30 = sim.positions.map((p, i) => ({ user_id: i + 1, position: p[29] }));
            day30.sort((a, b) => b.position - a.position);
            leaderboardRows = day30.map((r, idx) => ({ rank: idx + 1, user_id: r.user_id, position: r.position }));
            const boardDiv = $("board");
            const tbl = document.createElement("table");
            const h = document.createElement("tr");
            ["Rank", "User", "Position"].forEach(t => { const th = document.createElement("th"); th.textContent = t; h.appendChild(th); });
            tbl.appendChild(h);
            leaderboardRows.slice(0, 20).forEach(r => {
                const tr = document.createElement("tr");
                const cols = [r.rank, r.user_id, r.position];
                cols.forEach((c, i) => { const td = document.createElement("td"); td.textContent = c; if (i === 1) td.style.textAlign = "left"; tr.appendChild(td); });
                tbl.appendChild(tr);
            });
            boardDiv.innerHTML = ""; boardDiv.appendChild(tbl);
        }

        // Build CSVs
        const positionsRows = [];
        for (let u = 0; u < users; u++) {
            for (let d = 0; d < DAYS; d++) {
                positionsRows.push({
                    user_id: u + 1,
                    day: d + 1,
                    sessions_played: sim.playedSessionsPerDay[u][d],
                    steps_gained: sim.stepsGainedPerDay[u][d],
                    position: sim.positions[u][d],
                });
            }
        }

        const csvPositions = toCSV(positionsRows, ["user_id", "day", "sessions_played", "steps_gained", "position"]);
        const csvMilestones = toCSV(milestoneRows, ["day", "users", "mean", "std", "min", "p25", "median", "p75", "max"]);
        const csvLeaderboard = toCSV(leaderboardRows, ["rank", "user_id", "position"]);

        // Detailed History CSV
        const detailedRows = [];
        // Flatten history for CSV
        for (let u = 0; u < users; u++) {
            for (let d = 0; d < DAYS; d++) {
                const sessions = sim.history[u][d];
                for (const s of sessions) {
                    // Only log played sessions? Or all? Request implied "daily move", likely implies activity.
                    if (!s.played) continue;
                    detailedRows.push({
                        user_id: u + 1,
                        day: s.day,
                        time: s.timestamp,
                        start_pos: s.startPos,
                        steps_gained: s.stepsGained,
                        end_pos: s.endPos,
                        items: s.items
                    });
                }
            }
        }
        const csvDetailed = toCSV(detailedRows, ["user_id", "day", "time", "start_pos", "steps_gained", "items", "end_pos"]);

        lastArtifacts = {
            simData: sim,
            csvPositions, csvMilestones, csvLeaderboard, csvDetailed,
            filenameTag: `u${users}_k${sessionsPerDay}_r${rollsPerSession}_p${Math.round(pPlay * 100)}_x${explodeSix ? 1 : 0}_seed${seed}`
        };

        // enable downloads
        dlPosBtn.disabled = false; dlMilBtn.disabled = false; dlLbBtn.disabled = !leaderboard;
        if ($("dlDetailed")) $("dlDetailed").disabled = false;
        $("maxUserLabel").textContent = users;

        const ms = (t1 - t0).toFixed(0);
        const note = document.createElement("div");
        note.className = "help";
        note.innerHTML = `Simulated <span class="mono">${users.toLocaleString()}</span> users × 30 days in <span class="nowrap">${ms} ms</span>.`;
        statsDiv.appendChild(note);

    } catch (err) {
        console.error(err);
        $("stats").innerHTML += `<div style="color:red; margin-top:10px;">Error: ${err.message}</div>`;
        alert("An error occurred during simulation. check parameters.");
    } finally {
        runBtn.disabled = false;
    }
});

dlPosBtn.addEventListener("click", () => {
    if (!lastArtifacts) return;
    download(`positions_${lastArtifacts.filenameTag}.csv`, lastArtifacts.csvPositions);
});
dlMilBtn.addEventListener("click", () => {
    if (!lastArtifacts) return;
    download(`milestones_${lastArtifacts.filenameTag}.csv`, lastArtifacts.csvMilestones);
});
dlLbBtn.addEventListener("click", () => {
    if (!lastArtifacts) return;
    download(`leaderboard_${lastArtifacts.filenameTag}.csv`, lastArtifacts.csvLeaderboard);
});
$("dlDetailed").addEventListener("click", () => {
    if (!lastArtifacts) return;
    download(`detailed_history_${lastArtifacts.filenameTag}.csv`, lastArtifacts.csvDetailed);
});

/* ---------- User Inspector ---------- */
$("btnInspect").addEventListener("click", () => {
    if (!lastArtifacts) {
        alert("Please run the simulation first.");
        return;
    }

    const uidInput = $("inspectUserId");
    const uid = parseInt(uidInput.value, 10);
    const users = parseInt($("numUsers").value, 10); // get current sim count (approx) or store it

    const errorDiv = $("inspectorError");
    const resultsDiv = $("inspectorResults");

    if (isNaN(uid) || uid < 1 || uid > users) {
        errorDiv.textContent = `Invalid User ID. Please enter 1 to ${users}.`;
        errorDiv.style.display = "block";
        resultsDiv.style.display = "none";
        return;
    }
    errorDiv.style.display = "none";

    // Find sim data (we need to access 'sim' variable - but it's local to run click. 
    // We need to attach 'history' to lastArtifacts or a global.
    // Ideally, re-design: store 'currentSimulationResult' globally.
    if (!lastArtifacts.simData) {
        // We need to store this in rule above.
        // Hotfix: Retriggering sim is bad. 
        // I will update the runBtn listener to store `lastArtifacts.simData = sim;`
        alert("Error: Simulation data not found. Please re-run.");
        return;
    }

    const userHistory = lastArtifacts.simData.history[uid - 1]; // 0-indexed

    $("inspectorHeader").textContent = `User #${uid} History`;
    const tbody = $("inspectorTable").querySelector("tbody");
    tbody.innerHTML = "";

    // userHistory is Array of Days (Array of Sessions)
    userHistory.forEach(daySessions => {
        daySessions.forEach(s => {
            const tr = document.createElement("tr");
            // Day, Time, Start, Rolls (implied by steps?), Steps, Items, End
            const cols = [
                s.day,
                s.timestamp,
                s.startPos,
                "-", // Rolls not stored explicitly in history, just total steps. Can imply or ignore.
                s.stepsGained,
                s.items || "-",
                s.endPos
            ];

            cols.forEach(c => {
                const td = document.createElement("td");
                td.textContent = c;
                tr.appendChild(td);
            });

            if (!s.played) {
                tr.style.opacity = "0.5"; // Dim skipped sessions
            }
            tbody.appendChild(tr);
        });
    });

    resultsDiv.style.display = "block";
});
