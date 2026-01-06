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
    // Standard params are still used as baselines, but segment overrides might apply
    const { users, sessionsPerDay, rollsPerSession, pPlay, seed, segmentData } = params;
    const rng = mulberry32((seed >>> 0) || 42);

    /* ----------------------------------------------------
       SEGMENT PREALLOCATION
       If "segmentData" is provided {F2P: {}, ...}, assign each user a segment.
       Otherwise, all users are "Standard".
       ---------------------------------------------------- */
    const userSegments = new Array(users); // stores the config object for each user
    const PRIZE_POSITIONS = [10, 25, 40, 50, 60, 70, 80, 90, 100]; // Trigger positions

    if (segmentData) {
        const segKeys = Object.keys(segmentData);
        // Normalize percentages to ensure they sum to 100 or handle leftovers
        let assignedCount = 0;

        // We'll deterministically assign the first X users to F2P, next Y to Spender etc.
        // This is stable for the same 'users' count.
        for (let i = 0; i < segKeys.length; i++) {
            const key = segKeys[i];
            const cfg = segmentData[key];
            const percent = cfg.percent || 0;
            const count = Math.floor(users * (percent / 100));

            for (let k = 0; k < count; k++) {
                if (assignedCount < users) {
                    userSegments[assignedCount] = {
                        name: cfg.label || key,
                        extraRolls: cfg.extraRolls || 0,
                        explode: cfg.explode || false,
                        prizeCost: cfg.prizeCost || 0,
                        accumulatedCost: 0
                    };
                    assignedCount++;
                }
            }
        }
        // Fill remainders with the last segment or a default if rounding errors occur
        while (assignedCount < users) {
            const lastKey = segKeys[segKeys.length - 1];
            const cfg = segmentData[lastKey];
            userSegments[assignedCount] = {
                name: cfg.label || lastKey,
                extraRolls: cfg.extraRolls || 0,
                explode: cfg.explode || false,
                prizeCost: cfg.prizeCost || 0,
                accumulatedCost: 0
            };
            assignedCount++;
        }
    } else {
        // Standard Mode: Everyone gets global params
        for (let i = 0; i < users; i++) {
            userSegments[i] = {
                name: "Standard",
                extraRolls: 0,
                explode: params.explodeSix,
                prizeCost: 0,
                accumulatedCost: 0
            };
        }
    }

    // Pre-allocate arrays for stats
    const positions = Array.from({ length: users }, () => new Array(DAYS).fill(0));
    const steps = new Array(users).fill(0);
    const history = Array.from({ length: users }, () => []);

    // -------- SIMULATION LOOP --------
    for (let d = 0; d < DAYS; d++) {
        // Base time for this day
        const dayDate = new Date(SIM_START_DATE);
        dayDate.setDate(dayDate.getDate() + d);

        for (let u = 0; u < users; u++) {
            if (!history[u][d]) history[u][d] = [];

            const seg = userSegments[u];
            // Base rolls comes from global input, seg extra is added to that.
            const userRollsPerSession = rollsPerSession + seg.extraRolls;
            const userExplode = seg.explode;

            for (let s = 0; s < sessionsPerDay; s++) {
                const sessionTime = addHours(dayDate, (s * 4) + (rng() * 2));
                let played = false;
                let sessionSteps = 0;
                let startPos = steps[u];
                let itemsFound = "";

                if (rng() < pPlay) {
                    played = true;
                    // Roll logic
                    sessionSteps = rollSession(rng, userRollsPerSession, userExplode);

                    // Item logic (5% chance)
                    if (rng() < 0.05) {
                        const itemType = rng() < 0.5 ? "Mystery Box" : "Gold Coin";
                        itemsFound = itemType;
                    }
                }

                steps[u] += sessionSteps;

                // CHECK PRIZES (Simulate "Landing" or "Passing"?)
                // Usually board games trigger on land. Since we jump `sessionSteps`, 
                // we technically "landed" on the final spot. 
                // We'll check if the *end position* is in PRIZE_POSITIONS.
                // NOTE: If they overshoot (e.g. from 9 to 12, skipping 10), they might miss it.
                // For simplicity, let's assume "Landing" means ending the turn on that spot.
                if (played && PRIZE_POSITIONS.includes(steps[u])) {
                    seg.accumulatedCost += seg.prizeCost;
                }

                history[u][d].push({
                    day: d + 1,
                    timestamp: formatTime(sessionTime),
                    played,
                    startPos,
                    stepsGained: sessionSteps,
                    endPos: steps[u],
                    items: itemsFound
                });
            }
            positions[u][d] = steps[u];
        }
    }

    // -------- RESULTS AGGREGATION --------
    const dayStats = {};
    for (const d of MILESTONES) {
        const idx = d - 1;
        const posSlice = positions.map(p => p[idx]);
        dayStats[d] = { ...meanStd(posSlice), ...quantiles(posSlice) };
    }

    // Segment Cost Stats
    const segmentCosts = {};
    if (segmentData) {
        // Aggregation by segment name
        for (let u = 0; u < users; u++) {
            const seg = userSegments[u];
            if (!segmentCosts[seg.name]) {
                segmentCosts[seg.name] = { count: 0, totalCost: 0, distinctUsers: 0 };
            }
            segmentCosts[seg.name].count++;
            segmentCosts[seg.name].totalCost += seg.accumulatedCost;
        }
    }

    return {
        positions,
        dayStats,
        history,
        userSegments,
        segmentCosts
    };
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
    // Disable button to prevent double-click
    runBtn.disabled = true;
    $("stats").innerHTML = "Running...";

    // Allow UI to repaint (setTimeout)
    setTimeout(() => {
        try {
            const t0 = performance.now();

            // Gather params
            const rollsPerSession = parseInt($("rollsPerSession").value, 10);
            const sessionsPerDay = parseInt($("sessionsPerDay").value, 10);
            const users = parseInt($("numUsers").value, 10);
            const participation = parseInt($("participation").value, 10);
            const seed = parseInt($("seed").value, 10);

            // "doubleSix" might be used if no segment config provided, but segment mode overrides it.
            // standard mode still reads it.
            const explodeSix = $("doubleSix").checked;
            const leaderboard = $("leaderboard").checked;

            // Check for Segment Data (Hidden Input)
            let segmentData = null;
            const segInput = $("segmentDataJSON");
            if (segInput && segInput.value) {
                try {
                    segmentData = JSON.parse(segInput.value);
                } catch (e) { console.warn("Invalid segment JSON, verifying standard mode"); }
            }

            const pPlay = participation / 100.0;

            // Run Simulation
            const sim = simulate({
                users, sessionsPerDay, rollsPerSession,
                pPlay, explodeSix, seed,
                segmentData
            });

            const t1 = performance.now();

            // -------- RENDER RESULTS --------

            // 1. Quick Stats Table
            let html = `<table><thead><tr>
                <th>Day</th><th>Users</th><th>Mean</th><th>Std</th><th>Min</th><th>25%</th><th>Median</th><th>75%</th><th>Max</th>
            </tr></thead><tbody>`;

            for (const d of MILESTONES) {
                const s = sim.dayStats[d];
                html += `<tr>
                    <td>${d}</td>
                    <td>${users.toLocaleString()}</td>
                    <td>${s.mean.toFixed(2)}</td>
                    <td>${s.std.toFixed(2)}</td>
                    <td>${s.min}</td>
                    <td>${s.q1.toFixed(2)}</td>
                    <td>${s.med.toFixed(2)}</td>
                    <td>${s.q3.toFixed(2)}</td>
                    <td>${s.max}</td>
                </tr>`;
            }
            html += `</tbody></table>`;
            $("stats").innerHTML = html;

            // 2. Distributions
            drawHist($("hist7"), sim.positions.map(p => p[6]));
            drawHist($("hist14"), sim.positions.map(p => p[13]));
            drawHist($("hist21"), sim.positions.map(p => p[20]));
            drawHist($("hist30"), sim.positions.map(p => p[29]));

            $("count7").textContent = `Mean: ${sim.dayStats[7].mean.toFixed(0)}`;
            $("count14").textContent = `Mean: ${sim.dayStats[14].mean.toFixed(0)}`;
            $("count21").textContent = `Mean: ${sim.dayStats[21].mean.toFixed(0)}`;
            $("count30").textContent = `Mean: ${sim.dayStats[30].mean.toFixed(0)}`;

            // 3. Cost Forecast (NEW)
            const costDiv = $("costForecast");
            if (costDiv) {
                if (segmentData && sim.segmentCosts) {
                    let costHtml = `<table style="width:100%"><thead><tr>
                        <th>Segment</th><th>Users</th><th>Total Prize Cost</th><th>Avg $/User</th>
                    </tr></thead><tbody>`;

                    let grandTotal = 0;

                    Object.keys(sim.segmentCosts).forEach(segName => {
                        const data = sim.segmentCosts[segName];
                        grandTotal += data.totalCost;
                        costHtml += `<tr>
                            <td>${segName}</td>
                            <td>${data.count.toLocaleString()}</td>
                            <td>$${data.totalCost.toLocaleString()}</td>
                            <td>$${(data.totalCost / (data.count || 1)).toFixed(2)}</td>
                        </tr>`;
                    });

                    costHtml += `<tr style="font-weight:bold; background:#2d3748">
                        <td>TOTAL</td>
                        <td>${users.toLocaleString()}</td>
                        <td>$${grandTotal.toLocaleString()}</td>
                        <td>$${(grandTotal / users).toFixed(2)}</td>
                    </tr>`;

                    costHtml += `</tbody></table>`;
                    costDiv.innerHTML = costHtml;
                } else {
                    costDiv.innerHTML = "<p class='help'>Cost forecast available only in Segment Mode.</p>";
                }
            }

            // 4. Leaderboard
            const boardDiv = $("board");
            const boardCard = $("leaderboardCard");
            if (leaderboard) {
                boardCard.style.display = "block";
                const finalPositions = sim.positions.map((history, idx) => ({ id: idx + 1, score: history[DAYS - 1], seg: sim.userSegments[idx].name }));
                // Sort descending
                finalPositions.sort((a, b) => b.score - a.score);
                const top20 = finalPositions.slice(0, 20);

                let lbHtml = `<table><thead><tr><th>Rank</th><th>User ID</th><th>Segment</th><th>Position</th></tr></thead><tbody>`;
                top20.forEach((r, i) => {
                    lbHtml += `<tr><td>${i + 1}</td><td>#${r.id}</td><td>${r.seg}</td><td>${r.score}</td></tr>`;
                });
                lbHtml += `</tbody></table>`;
                boardDiv.innerHTML = lbHtml;
            } else {
                boardCard.style.display = "none";
            }

            // 5. Generate CSV Data
            // Positions CSV
            const positionsRows = [];
            for (let u = 0; u < users; u++) {
                for (let d = 0; d < DAYS; d++) {
                    // This is getting huge for 1M users, maybe skip if > 50k?
                    // For now, keep it simple.
                    positionsRows.push({
                        user_id: u + 1,
                        segment: sim.userSegments[u].name,
                        day: d + 1,
                        position: sim.positions[u][d]
                    });
                }
            }

            // Create CSVs
            const csvPositions = toCSV(positionsRows, ["user_id", "segment", "day", "position"]);

            // Milestones CSV
            const milestoneRows = [];
            for (const d of MILESTONES) {
                const s = sim.dayStats[d];
                milestoneRows.push({ day: d, users, ...s });
            }
            const csvMilestones = toCSV(milestoneRows, ["day", "users", "mean", "std", "min", "p25", "median", "p75", "max"]);

            // Leaderboard CSV
            const allFinal = sim.positions.map((h, i) => ({ id: i + 1, score: h[DAYS - 1], seg: sim.userSegments[i].name }));
            allFinal.sort((a, b) => b.score - a.score);
            const leaderboardRows = allFinal.map((r, i) => ({ rank: i + 1, user_id: r.id, segment: r.seg, position: r.score }));
            const csvLeaderboard = toCSV(leaderboardRows, ["rank", "user_id", "segment", "position"]);

            // Detailed CSV
            const detailedRows = [];
            // Optimization: If users > 10,000, maybe don't gen this by default?
            if (users <= 10000) {
                for (let u = 0; u < users; u++) {
                    for (let d = 0; d < DAYS; d++) {
                        const sessions = sim.history[u][d];
                        for (const s of sessions) {
                            if (!s.played) continue;
                            detailedRows.push({
                                user_id: u + 1,
                                segment: sim.userSegments[u].name,
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
            }
            const csvDetailed = toCSV(detailedRows, ["user_id", "segment", "day", "time", "start_pos", "steps_gained", "end_pos", "items"]);

            lastArtifacts = {
                simData: sim,
                csvPositions, csvMilestones, csvLeaderboard, csvDetailed,
                filenameTag: `u${users}_seg${segmentData ? 'Mixed' : 'Std'}`
            };

            // Enable buttons
            dlPosBtn.disabled = false;
            dlMilBtn.disabled = false;
            dlLbBtn.disabled = !leaderboard;
            if ($("dlDetailed")) $("dlDetailed").disabled = false;

            // Time note
            const ms = (t1 - t0).toFixed(0);
            const note = document.createElement("div");
            note.className = "help";
            note.innerHTML = `Simulated <span class="mono">${users.toLocaleString()}</span> users (${segmentData ? 'Mixed Segments' : 'Standard'}) × 30 days in <span class="nowrap">${ms} ms</span>.`;
            $("stats").appendChild(note);

        } catch (err) {
            console.error(err);
            $("stats").innerHTML += `<div style="color:red; margin-top:10px;">Error: ${err.message}</div>`;
        } finally {
            runBtn.disabled = false;
        }
    }, 50); // small delay for UI
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
    try {
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

        if (!lastArtifacts.simData.history) {
            alert("Error: History data is missing from simulation. Please report this bug.");
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
    } catch (err) {
        console.error(err);
        alert(`Inspector Error: ${err.message}`);
    }
});
