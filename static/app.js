/**
 * DIGITAL TWIN ATHLETE CONTROLLER
 * Real-time ESP32 hardware streaming, sports analytics cockpit, multi-view router,
 * interactive digital twin biomechanics, 180-day longitudinal analytics, and What-If simulator.
 */

let currentTimeframe = "1H";
let cachedDashboardData = null;
let cachedAnalyticsData = null;
let eventSource = null;
let isMockActive = false;
let selectedIntensity = "Moderate";
let currentActiveView = "dashboard";
let livePacketCount = 0;
let accelVisibility = { x: true, y: true, z: true };

document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initSidebar();
  initTimeframeButtons();
  initMovementLegendToggle();
  initWhatIfSimulator();
  initHardwareControls();
  initLiveTelemetryLab();
  initDigitalTwinView();
  initWhatIfMicrocycleView();
  initWhatIfStudio();
  initSettingsView();

  // Interactive UI Cockpit Controls
  initProfileDropdown();
  initChartTooltips();
  initSessionModal();
  initInjuryModal();
  initDailyCheckinModal();
  initPrecautionsChecklist();
  initInfoModals();
  initMetricCardsClick();

  loadDashboardData("1H");
  initLiveStream();

  // Support direct deep-linking via hash (e.g. #analytics, #digital-twin, #what-if)
  const hash = window.location.hash.replace("#", "");
  if (hash && ["dashboard", "live-data", "training-sessions", "analytics", "digital-twin", "what-if", "settings"].includes(hash)) {
    switchView(hash);
  }
});

/* ==============================================================================
   1. LIVE CLOCK, DATE & DYNAMIC GREETING
   ============================================================================== */
function initClock() {
  const liveDateEl = document.getElementById("liveDate");
  const liveTimeEl = document.getElementById("liveTime");
  const heroGreetingEl = document.getElementById("heroGreeting");

  function update() {
    const now = new Date();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const dayName = days[now.getDay()];
    const dateNum = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();

    const hour24 = now.getHours();
    let hours = hour24 % 12 || 12;
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const ampm = hour24 >= 12 ? "PM" : "AM";

    if (liveDateEl) liveDateEl.textContent = `${dayName}, ${dateNum} ${monthName} ${year}`;
    if (liveTimeEl) liveTimeEl.textContent = `${hours}:${minutes} ${ampm}`;

    // Dynamic time-of-day greeting
    if (heroGreetingEl) {
      if (hour24 >= 4 && hour24 < 12) {
        heroGreetingEl.textContent = "Good Morning, Daniel!";
      } else if (hour24 >= 12 && hour24 < 17) {
        heroGreetingEl.textContent = "Good Afternoon, Daniel!";
      } else {
        heroGreetingEl.textContent = "Good Evening, Daniel!";
      }
    }
  }

  update();
  setInterval(update, 1000);
}

/* ==============================================================================
   2. SIDEBAR MULTI-VIEW ROUTING
   ============================================================================== */
function initSidebar() {
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      const targetNav = item.dataset.nav;
      if (targetNav) {
        switchView(targetNav);
        closeMobileDrawer();
      }
    });
  });

  // Mobile drawer hamburger & close buttons
  const toggleBtn = document.getElementById("mobileNavToggle");
  const closeBtn = document.getElementById("btnCloseSidebar");
  const backdrop = document.getElementById("mobileNavBackdrop");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      toggleMobileDrawer();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closeMobileDrawer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", () => {
      closeMobileDrawer();
    });
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeMobileDrawer();
    }
  });

  // Mobile bottom navigation bar items
  const bottomNavItems = document.querySelectorAll(".mobile-bottom-nav-item");
  bottomNavItems.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      if (btn.id === "bottomNavMoreBtn") {
        toggleMobileDrawer();
        return;
      }
      const targetNav = btn.dataset.nav;
      if (targetNav) {
        switchView(targetNav);
        closeMobileDrawer();
      }
    });
  });
}

function openMobileDrawer() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("mobileNavBackdrop");
  const toggle = document.getElementById("mobileNavToggle");
  if (sidebar) sidebar.classList.add("open");
  if (backdrop) backdrop.classList.add("active");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
}

function closeMobileDrawer() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("mobileNavBackdrop");
  const toggle = document.getElementById("mobileNavToggle");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("active");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
}

function toggleMobileDrawer() {
  const sidebar = document.getElementById("appSidebar");
  if (sidebar && sidebar.classList.contains("open")) {
    closeMobileDrawer();
  } else {
    openMobileDrawer();
  }
}

function switchView(viewName) {
  currentActiveView = viewName;

  // Update sidebar active classes
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
  navItems.forEach(item => {
    if (item.dataset.nav === viewName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update mobile bottom nav active classes
  const bottomNavItems = document.querySelectorAll(".mobile-bottom-nav-item");
  bottomNavItems.forEach(btn => {
    if (btn.dataset.nav === viewName) {
      btn.classList.add("active");
    } else if (btn.dataset.nav) {
      btn.classList.remove("active");
    }
  });

  // Switch visible view panel
  const viewPanels = document.querySelectorAll(".view-panel");
  viewPanels.forEach(panel => panel.classList.remove("active"));

  const targetPanel = document.getElementById(`view-${viewName}`);
  if (targetPanel) {
    targetPanel.classList.add("active");
  }

  // Update URL hash without reload
  if (history.pushState) {
    history.pushState(null, null, `#${viewName}`);
  } else {
    window.location.hash = viewName;
  }

  // Hydrate view-specific content
  if (viewName === "dashboard") {
    if (cachedDashboardData && cachedDashboardData.charts) {
      renderHeartRateChart(cachedDashboardData.charts.heart_rate);
      renderMovementChart(cachedDashboardData.charts.movement);
    }
  } else if (viewName === "analytics") {
    loadAnalyticsView();
  } else if (viewName === "digital-twin") {
    syncDigitalTwinDeepView();
  } else if (viewName === "what-if") {
    if (!document.getElementById("microcycleGrid").children.length) {
      renderMicrocycleInputs("standard");
    }
  }
}

/* ==============================================================================
   3. TIMEFRAME BUTTONS (1H, 6H, 24H)
   ============================================================================== */
function initTimeframeButtons() {
  const tfButtons = document.querySelectorAll(".timeframe-pill-group .tf-btn, .timeframe-buttons .tf-btn");
  tfButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tfButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTimeframe = btn.dataset.tf || "1H";
      loadDashboardData(currentTimeframe);
      showToast(`Showing ${currentTimeframe} telemetry window`, "⏱️", 2000);
    });
  });
}

/* ==============================================================================
   4. DATA FETCH & DASHBOARD HYDRATION
   ============================================================================== */
async function loadDashboardData(timeframe = "1H") {
  try {
    const res = await fetch(`/api/dashboard-data?timeframe=${timeframe}`);
    const data = await res.json();
    cachedDashboardData = data;

    if (data.vitals) updateVitalsUI(data.vitals);
    if (data.recent_session) updateSessionUI(data.recent_session);
    if (data.twin_status) updateTwinUI(data.twin_status);
    if (data.device) updateHardwareStatusUI(data.device);

    if (data.charts) {
      // Sync axis label based on time_unit
      const unit = data.charts.heart_rate?.time_unit || (timeframe === "1M" ? "seconds" : "minutes");
      const axisLabels = document.querySelectorAll(".axis-label-x");
      axisLabels.forEach(el => el.textContent = `Time (${unit})`);

      renderHeartRateChart(data.charts.heart_rate);
      renderMovementChart(data.charts.movement);
    }
  } catch (err) {
    console.error("Dashboard fetch error:", err);
  }
}

/* ==============================================================================
   5. REAL-TIME SSE STREAMING (ESP32 TELEMETRY)
   ============================================================================== */
function initLiveStream() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource("/api/stream");

  eventSource.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      handleIncomingTelemetry(data);
    } catch (err) {
      console.error("SSE parse error:", err);
    }
  };

  eventSource.onerror = () => {
    const dot = document.getElementById("esp32Dot");
    const statusText = document.getElementById("esp32StatusText");
    if (dot) dot.className = "hw-dot dot-waiting";
    if (statusText) statusText.textContent = "Connecting...";
  };
}

function handleIncomingTelemetry(data) {
  if (!data) return;

  // Increment packet counter and update raw terminal log
  livePacketCount++;
  const counterEl = document.getElementById("livePacketCounter");
  if (counterEl) counterEl.textContent = `${livePacketCount} packets`;

  appendTerminalLog(data);

  // 1. Hardware Status Pill
  if (data.device) {
    updateHardwareStatusUI(data.device);
  }

  // 2. Telemetry Vitals
  if (data.vitals) {
    updateVitalsUI(data.vitals);
  }

  // 3. Active Session Info
  if (data.recent_session) {
    updateSessionUI(data.recent_session);
  }

  // 4. Digital Twin State
  if (data.twin_status) {
    updateTwinUI(data.twin_status);
  }

  // 5. Dynamic Hologram Pulse Synchronization
  if (data.vitals && data.vitals.heart_rate) {
    syncHologramPulse(data.vitals.heart_rate.value, data.vitals.heart_rate.color);
  }

  // 6. Real-time Charts
  if (currentTimeframe === "1H" && data.charts) {
    renderHeartRateChart(data.charts.heart_rate);
    renderMovementChart(data.charts.movement);
  }
}

/* Append entry to the real-time terminal log */
function appendTerminalLog(data) {
  const terminalBox = document.getElementById("terminalLogBox");
  if (!terminalBox) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];

  const hr = data.vitals?.heart_rate?.value ?? "--";
  const spo2 = data.vitals?.spo2?.value ?? "--";
  const activity = data.vitals?.activity?.value ?? "Active";
  const ax = data.vitals?.acceleration?.axes?.x ?? "0.0";
  const ay = data.vitals?.acceleration?.axes?.y ?? "0.0";
  const az = data.vitals?.acceleration?.axes?.z ?? "0.0";
  const cadence = data.vitals?.cadence?.value ?? "--";

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-src">ESP32_RX:</span>
    <span class="log-data">HR=${hr} BPM | SpO2=${spo2}% | Act=${activity} | Accel=[${ax},${ay},${az}]g | Cadence=${cadence} SPM</span>
  `;

  terminalBox.appendChild(entry);

  // Limit terminal history to 50 lines to prevent DOM bloat
  while (terminalBox.children.length > 50) {
    terminalBox.removeChild(terminalBox.firstChild);
  }

  terminalBox.scrollTop = terminalBox.scrollHeight;
}

/* ==============================================================================
   6. UI COMPONENT UPDATERS
   ============================================================================== */
function updateHardwareStatusUI(device) {
  const pill = document.getElementById("esp32StatusPill");
  const dot = document.getElementById("esp32Dot");
  const text = document.getElementById("esp32StatusText");
  const rate = document.getElementById("esp32RateText");

  const isConnected = device.connected || device.mock_mode;

  if (pill) pill.className = "hardware-pill " + (isConnected ? "connected" : "");
  if (dot) dot.className = "hw-dot " + (isConnected ? "dot-connected" : "dot-waiting");

  if (text) {
    if (device.mock_mode) {
      text.textContent = "Simulated ESP32 (Live)";
    } else if (device.connected) {
      text.textContent = `ESP32 Live (${device.device_id || "Connected"})`;
    } else {
      text.textContent = "ESP32: Waiting";
    }
  }

  if (rate) {
    if (isConnected) {
      rate.textContent = `${device.rate_hz || 1.0} Hz • Bat: ${device.battery || 95}%`;
    } else {
      rate.textContent = "0 Hz";
    }
  }

  // Sync simulator button state
  const simBtn = document.getElementById("btnToggleSimFeed");
  const simBtnText = document.getElementById("simFeedBtnText");
  const liveSimBtn = document.getElementById("btnLiveToggleSim");
  const liveSimBtnText = document.getElementById("liveSimBtnText");

  isMockActive = !!device.mock_mode;

  if (simBtn) simBtn.className = "btn-top-action " + (isMockActive ? "active-sim" : "");
  if (simBtnText) simBtnText.textContent = isMockActive ? "Stop Sim" : "Simulate ESP32";

  if (liveSimBtn) liveSimBtn.className = "btn-top-action " + (isMockActive ? "active-sim" : "");
  if (liveSimBtnText) liveSimBtnText.textContent = isMockActive ? "Stop Sim" : "Simulate ESP32";
}

function updateVitalsUI(vitals) {
  // 1. Heart Rate
  if (vitals.heart_rate) {
    const hrVal = document.getElementById("vitalHrVal");
    const hrStatus = document.getElementById("vitalHrStatus");
    const hrStatusText = document.getElementById("vitalHrStatusText");
    const hrTrend = document.getElementById("vitalHrTrend");

    const hr = Math.round(vitals.heart_rate.value);
    if (hrVal) hrVal.textContent = hr;

    if (hrTrend) {
      if (vitals.heart_rate.trend) {
        hrTrend.textContent = `↑ ${vitals.heart_rate.trend.replace("+", "")}`;
      } else {
        const deltaPct = Math.round(((hr - 144) / 144) * 100);
        hrTrend.textContent = deltaPct >= 0 ? `↑ ${deltaPct}%` : `↓ ${Math.abs(deltaPct)}%`;
      }
    }

    if (hrStatusText) {
      hrStatusText.textContent = hr > 150 ? "High Intensity" : (hr > 125 ? "Moderate" : "Aerobic Zone");
    }

    if (hrStatus) {
      hrStatus.className = "badge-pill " + (hr > 150 ? "pill-red" : (hr > 125 ? "pill-yellow" : "pill-green"));
    }

    // Sync to Live Lab view
    const labHrVal = document.getElementById("liveLabHrVal");
    const labHrStatus = document.getElementById("liveLabHrStatus");
    if (labHrVal) labHrVal.textContent = hr;
    if (labHrStatus) {
      labHrStatus.textContent = vitals.heart_rate.zone_info ? vitals.heart_rate.zone_info.name : (hr > 150 ? "Zone 4: Anaerobic Threshold" : "Zone 2: Aerobic Base");
    }
  }

  // 2. SpO2
  if (vitals.spo2) {
    const spo2Val = document.getElementById("vitalSpo2Val");
    const spo2Status = document.getElementById("vitalSpo2Status");
    const spo2StatusText = document.getElementById("vitalSpo2StatusText");

    const spo2 = Math.round(vitals.spo2.value);
    if (spo2Val) spo2Val.textContent = spo2;

    if (spo2StatusText) {
      spo2StatusText.textContent = spo2 >= 96 ? "Normal" : "Suboptimal";
    }

    if (spo2Status) {
      spo2Status.className = "badge-pill " + (spo2 >= 96 ? "pill-green" : "pill-red");
    }

    // Sync to Live Lab view
    const labSpo2Val = document.getElementById("liveLabSpo2Val");
    if (labSpo2Val) labSpo2Val.textContent = spo2;
  }

  // 3. Activity
  if (vitals.activity) {
    const actVal = document.getElementById("vitalActivityVal");
    const actSub = document.getElementById("vitalActivitySub");

    if (actVal) actVal.textContent = vitals.activity.value || "Running";
    if (actSub) actSub.textContent = vitals.activity.subtext || "Team Training";
  }

  // 4. Acceleration
  if (vitals.acceleration) {
    const accelVal = document.getElementById("vitalAccelVal");
    const accelStatus = document.getElementById("vitalAccelStatus");
    const accelStatusText = document.getElementById("vitalAccelStatusText");
    const accelTrend = document.getElementById("vitalAccelTrend");

    const gVal = typeof vitals.acceleration.value === "number" ? vitals.acceleration.value.toFixed(1) : vitals.acceleration.value;
    if (accelVal) accelVal.textContent = gVal;

    if (accelTrend) {
      if (vitals.acceleration.trend) {
        accelTrend.textContent = `↑ ${vitals.acceleration.trend.replace("+", "")}`;
      } else {
        accelTrend.textContent = "↑ 22%";
      }
    }

    const numG = parseFloat(gVal) || 2.4;
    if (accelStatusText) {
      accelStatusText.textContent = numG > 2.5 ? "High Load" : (numG > 1.4 ? "Moderate Load" : "Low Impact");
    }
    if (accelStatus) {
      accelStatus.className = "badge-pill " + (numG > 2.5 ? "pill-yellow" : (numG > 1.4 ? "pill-green" : "pill-green"));
    }

    // Sync to Live Lab view
    const labAccelG = document.getElementById("liveLabAccelG");
    const labAccelAxes = document.getElementById("liveLabAccelAxes");
    if (labAccelG) labAccelG.textContent = (typeof numG === "number" ? numG.toFixed(2) : numG);
    if (labAccelAxes && vitals.acceleration.axes) {
      const { x, y, z } = vitals.acceleration.axes;
      labAccelAxes.textContent = `X: ${x} • Y: ${y} • Z: ${z}`;
    }
  }

  // Cadence / Steps
  if (vitals.cadence) {
    const labCadence = document.getElementById("liveLabCadenceVal");
    const labSteps = document.getElementById("liveLabStepsVal");
    if (labCadence) labCadence.textContent = vitals.cadence.value;
    if (labSteps) labSteps.textContent = `${(vitals.cadence.steps || 1240).toLocaleString()} steps`;
  }
}

function updateSessionUI(session) {
  // Keep training table or active session synced
  const overviewDate = document.getElementById("overviewDateText");
  if (overviewDate && session.datetime) {
    const parts = session.datetime.split("•");
    if (parts.length > 0) overviewDate.textContent = parts[0].trim();
  }
}

function updateTwinUI(status) {
  if (!status) return;

  const rVal = status.recovery_value !== undefined ? status.recovery_value : (parseFloat(status.recovery_label) || 78.0);
  const fVal = status.fatigue_value !== undefined ? status.fatigue_value : 38.0;
  const pVal = status.performance_value !== undefined ? status.performance_value : 85.0;

  // 1. SVG Donut Gauge in Today's Overview
  const donutVal = document.getElementById("donutRecoveryVal");
  const donutCircle = document.getElementById("donutRecoveryCircle");
  if (donutVal) donutVal.textContent = `${Math.round(rVal)}%`;
  if (donutCircle) {
    const circumference = 251.32;
    const clampedR = Math.min(100, Math.max(0, rVal));
    const offset = circumference * (1 - (clampedR / 100));
    donutCircle.style.strokeDashoffset = offset;
  }

  // 2. Overview Stack Indicators
  const fatigueStatus = document.getElementById("todayFatigueStatus");
  const readinessStatus = document.getElementById("todayReadinessStatus");
  if (fatigueStatus) fatigueStatus.textContent = status.fatigue_label || (fVal > 55 ? "High" : (fVal > 30 ? "Moderate" : "Low"));
  if (readinessStatus) readinessStatus.textContent = status.performance_label || (pVal >= 80 ? "High" : (pVal >= 65 ? "Moderate" : "Low"));

  // 3. Sync to Digital Twin Deep Dive View if present
  const deepFatigueEl = document.getElementById("deepFatigueVal");
  const deepFatigueBar = document.getElementById("deepFatigueBar");
  const deepFatigueNum = document.getElementById("deepFatigueNum");

  const deepRecoveryEl = document.getElementById("deepRecoveryVal");
  const deepRecoveryBar = document.getElementById("deepRecoveryBar");
  const deepRecoveryNum = document.getElementById("deepRecoveryNum");

  const deepPerfEl = document.getElementById("deepPerformanceVal");
  const deepPerfBar = document.getElementById("deepPerformanceBar");
  const deepPerfNum = document.getElementById("deepPerformanceNum");

  if (deepFatigueEl) deepFatigueEl.textContent = status.fatigue_label || "Moderate";
  if (deepFatigueBar) deepFatigueBar.style.width = `${Math.min(100, Math.max(5, fVal))}%`;
  if (deepFatigueNum) deepFatigueNum.textContent = `Index: ${fVal.toFixed(1)}%`;

  if (deepRecoveryEl) deepRecoveryEl.textContent = `${Math.round(rVal)}%`;
  if (deepRecoveryBar) deepRecoveryBar.style.width = `${Math.min(100, Math.max(5, rVal))}%`;
  if (deepRecoveryNum) deepRecoveryNum.textContent = `Readiness: ${rVal.toFixed(1)}%`;

  if (deepPerfEl) deepPerfEl.textContent = status.performance_label || "High";
  if (deepPerfBar) deepPerfBar.style.width = `${Math.min(100, Math.max(5, pVal))}%`;
  if (deepPerfNum) deepPerfNum.textContent = `Performance Score: ${pVal.toFixed(1)} / 100`;
}

/**
 * Synchronizes the pulsating anatomical joint nodes with the athlete's real-time BPM
 */
function syncHologramPulse(bpm, color) {
  const nodes = document.querySelectorAll(".joint-node");
  const durationSec = Math.max(0.3, Math.min(1.5, 60.0 / Math.max(bpm, 40)));

  nodes.forEach(node => {
    node.style.animationDuration = `${durationSec.toFixed(2)}s`;
    if (color) {
      node.style.stroke = color;
    }
  });
}

/* ==============================================================================
   7. HARDWARE CONTROLS & MODAL HANDLERS
   ============================================================================== */
function initHardwareControls() {
  // Top navigation simulate toggle
  const toggleBtn = document.getElementById("btnToggleSimFeed");
  const liveToggleBtn = document.getElementById("btnLiveToggleSim");

  async function toggleMock() {
    try {
      const res = await fetch("/api/esp32/mock-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" })
      });
      const data = await res.json();
      isMockActive = data.mock_running;

      if (toggleBtn) {
        toggleBtn.className = "btn-top-action " + (isMockActive ? "active-sim" : "");
        const text = document.getElementById("simFeedBtnText");
        if (text) text.textContent = isMockActive ? "Stop Sim" : "Simulate ESP32";
      }

      if (liveToggleBtn) {
        liveToggleBtn.className = "btn-top-action " + (isMockActive ? "active-sim" : "");
        const text = document.getElementById("liveSimBtnText");
        if (text) text.textContent = isMockActive ? "Stop Sim" : "Simulate ESP32";
      }
    } catch (err) {
      console.error("Failed to toggle simulator feed:", err);
    }
  }

  if (toggleBtn) toggleBtn.addEventListener("click", toggleMock);
  if (liveToggleBtn) liveToggleBtn.addEventListener("click", toggleMock);

  // Session Reset Buttons
  async function resetSession() {
    if (!confirm("Reset the current workout session metrics?")) return;
    try {
      await fetch("/api/session/reset", { method: "POST" });
      loadDashboardData(currentTimeframe);
    } catch (err) {
      console.error("Failed to reset session:", err);
    }
  }

  const resetBtn = document.getElementById("btnResetSession");
  const liveResetBtn = document.getElementById("btnLiveResetSession");
  if (resetBtn) resetBtn.addEventListener("click", resetSession);
  if (liveResetBtn) liveResetBtn.addEventListener("click", resetSession);

  // Modal Open & Close Handlers
  const modalBackdrop = document.getElementById("hwModalBackdrop");
  const openModalBtn = document.getElementById("btnOpenHwModal");
  const closeModalBtn = document.getElementById("btnCloseHwModal");
  const doneModalBtn = document.getElementById("btnModalCloseDone");

  function openModal() {
    if (modalBackdrop) modalBackdrop.style.display = "flex";
  }
  function closeModal() {
    if (modalBackdrop) modalBackdrop.style.display = "none";
  }

  if (openModalBtn) openModalBtn.addEventListener("click", openModal);
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if (doneModalBtn) doneModalBtn.addEventListener("click", closeModal);

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", e => {
      if (e.target === modalBackdrop) closeModal();
    });
  }
}

/* ==============================================================================
   8. LIVE TELEMETRY LAB VIEW
   ============================================================================== */
function initLiveTelemetryLab() {
  const clearBtn = document.getElementById("btnClearTerminal");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const box = document.getElementById("terminalLogBox");
      if (box) box.innerHTML = `<div class="log-entry"><span class="log-time">[System]</span><span class="log-src">Buffer:</span><span class="log-data">Terminal buffer cleared.</span></div>`;
      livePacketCount = 0;
      const counter = document.getElementById("livePacketCounter");
      if (counter) counter.textContent = "0 packets";
    });
  }
}

/* ==============================================================================
   9. ANALYTICS VIEW (180-DAY LONGITUDINAL PROGRESSION)
   ============================================================================== */
async function loadAnalyticsView() {
  const refreshBtn = document.getElementById("btnRefreshAnalytics");
  if (refreshBtn) {
    refreshBtn.onclick = () => loadAnalyticsView();
  }

  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    cachedAnalyticsData = data;

    if (data.summary) {
      const s = data.summary;
      const sleepEl = document.getElementById("analyticsSleepVal");
      const loadEl = document.getElementById("analyticsLoadVal");
      const perfEl = document.getElementById("analyticsPerfVal");
      const rhrEl = document.getElementById("analyticsRhrVal");
      const peakFatigueEl = document.getElementById("analyticsPeakFatigueVal");
      const minRecoveryEl = document.getElementById("analyticsMinRecoveryVal");

      if (sleepEl) sleepEl.textContent = `${s.mean_sleep || 7.8} h`;
      if (loadEl) loadEl.textContent = `${Math.round(s.mean_load || 348)} AU`;
      if (perfEl) perfEl.textContent = `${(s.mean_performance || 79.4).toFixed(1)}`;
      if (rhrEl) rhrEl.textContent = `${Math.round(s.mean_resting_hr || 54)} BPM`;
      if (peakFatigueEl) peakFatigueEl.textContent = `${(s.peak_fatigue || 48.2).toFixed(1)}%`;
      if (minRecoveryEl) minRecoveryEl.textContent = `${(s.min_recovery || 62.0).toFixed(1)}%`;
    }

    if (data.history && data.history.length > 0) {
      renderAnalyticsFatigueRecoveryChart(data.history);
      renderAnalyticsLoadPerfChart(data.history);
      populateAnalyticsTable(data.history);
    }
  } catch (err) {
    console.error("Failed to load analytics history:", err);
  }
}

function renderAnalyticsFatigueRecoveryChart(history) {
  const canvas = document.getElementById("analyticsFatigueRecoveryChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 12, right: 15, bottom: 20, left: 32 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.fillStyle = "#546580";
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "right";

  [0, 25, 50, 75, 100].forEach(val => {
    const y = pad.top + plotH - (val / 100) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${val}%`, pad.left - 6, y + 3);
  });

  const pts = history.slice(-60); // Show last 60 days for high clarity
  const stepX = plotW / (pts.length - 1);

  // Fatigue Curve (Red)
  ctx.beginPath();
  pts.forEach((row, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + plotH - ((row.fatigue_level || 20) / 100) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Recovery Curve (Green)
  ctx.beginPath();
  pts.forEach((row, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + plotH - ((row.recovery_score || 80) / 100) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function renderAnalyticsLoadPerfChart(history) {
  const canvas = document.getElementById("analyticsLoadPerfChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 12, right: 15, bottom: 20, left: 32 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.fillStyle = "#546580";
  ctx.font = "9px Inter, sans-serif";
  ctx.textAlign = "right";

  [0, 200, 400, 600].forEach(val => {
    const y = pad.top + plotH - (val / 600) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(val, pad.left - 6, y + 3);
  });

  const pts = history.slice(-60);
  const stepX = plotW / (pts.length - 1);

  // Load Bars (Cyan)
  pts.forEach((row, i) => {
    const x = pad.left + i * stepX;
    const load = row.daily_load || 0;
    const barH = (Math.min(600, load) / 600) * plotH;
    const y = pad.top + plotH - barH;
    ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
    ctx.fillRect(x - 1.5, y, 3, barH);
  });

  // Performance Curve (Purple)
  ctx.beginPath();
  pts.forEach((row, i) => {
    const x = pad.left + i * stepX;
    const perf = row.performance_score || 75;
    const y = pad.top + plotH - (perf / 100) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#a855f7";
  ctx.lineWidth = 2.2;
  ctx.stroke();
}

function populateAnalyticsTable(history) {
  const tbody = document.getElementById("analyticsHistoryTableBody");
  if (!tbody) return;

  const countEl = document.getElementById("historyRowCount");
  if (countEl) countEl.textContent = `Showing all ${history.length} recorded training days`;

  // Display recent 40 entries
  const rows = history.slice(-40).reverse();

  tbody.innerHTML = rows.map((r, idx) => {
    const dayNum = r.day !== undefined ? r.day : (history.length - idx);
    const sleep = (r.sleep_hours || 8.0).toFixed(1);
    const load = Math.round(r.daily_load || 0);
    const fatigue = (r.fatigue_level || 20).toFixed(1);
    const recovery = (r.recovery_score || 80).toFixed(1);
    const perf = (r.performance_score || 75).toFixed(1);

    let status = "OPTIMAL";
    let badgeClass = "badge-optimal";

    if (r.fatigue_level > 55 || r.recovery_score < 50) {
      status = "HIGH RISK";
      badgeClass = "badge-high-risk";
    } else if (r.fatigue_level > 38 || r.recovery_score < 70) {
      status = "OVERREACHING";
      badgeClass = "badge-overreaching";
    }

    return `
      <tr>
        <td><strong>Day ${dayNum}</strong></td>
        <td>${sleep} h</td>
        <td>${load} AU</td>
        <td><span style="color:#ef4444">${fatigue}%</span></td>
        <td><span style="color:#10b981">${recovery}%</span></td>
        <td><strong>${perf}</strong></td>
        <td><span class="badge-status-pill ${badgeClass}">${status}</span></td>
      </tr>
    `;
  }).join("");
}

/* ==============================================================================
   10. DIGITAL TWIN DEEP DIVE VIEW & TUNING
   ============================================================================== */
function initDigitalTwinView() {
  // Clickable interactive nodes
  const nodes = [
    { id: "deepNodeHead", title: "Cerebral / Central Nervous System", desc: "Neuro-muscular fatigue indicator. Sleep quality multiplier active." },
    { id: "deepNodeHeart", title: "Cardiovascular Cardiac Output", desc: "Live PPG pulse sensor: current heart rate, stroke volume reserve, and aerobic zone." },
    { id: "deepNodeLWrist", title: "Left Wrist (Grip & IMU)", desc: "Tri-axial accelerometer vector streaming. Cadence and arm swing biomechanics." },
    { id: "deepNodeRWrist", title: "Right Wrist (Grip & IMU)", desc: "Arm swing symmetry and cadence balance." },
    { id: "deepNodeLKnee", title: "Left Knee (Patellar Load)", desc: "Impact force dissipation: 2.4g instantaneous ground acceleration." },
    { id: "deepNodeRKnee", title: "Right Knee (Patellar Load)", desc: "Joint torque estimation under continuous running cadence." },
    { id: "deepNodeLAnkle", title: "Left Ankle (Achilles Load)", desc: "Ground contact time and step frequency." },
    { id: "deepNodeRAnkle", title: "Right Ankle (Achilles Load)", desc: "Vertical stiffness and propulsion impulse." }
  ];

  nodes.forEach(n => {
    const el = document.getElementById(n.id);
    if (el) {
      el.addEventListener("click", () => {
        const titleEl = document.getElementById("inspectNodeTitle");
        const descEl = document.getElementById("inspectNodeDesc");
        if (titleEl) titleEl.textContent = `Inspecting: ${n.title}`;
        if (descEl) descEl.textContent = n.desc;
      });
    }
  });

  // Sleep slider input
  const sleepSlider = document.getElementById("sleepSlider");
  const sleepLabel = document.getElementById("sleepHoursLabel");
  if (sleepSlider && sleepLabel) {
    sleepSlider.addEventListener("input", () => {
      sleepLabel.textContent = `${parseFloat(sleepSlider.value).toFixed(1)} hrs`;
    });
  }

  // Retrain AI Model Button
  const retrainBtn = document.getElementById("btnRetrainTwin");
  const retrainToast = document.getElementById("retrainStatusToast");
  const retrainBtnText = document.getElementById("retrainBtnText");

  if (retrainBtn) {
    retrainBtn.addEventListener("click", async () => {
      const sleepHours = sleepSlider ? parseFloat(sleepSlider.value) : 8.0;

      if (retrainBtnText) retrainBtnText.textContent = "Retraining AI...";
      retrainBtn.disabled = true;

      try {
        const res = await fetch("/api/configure-sleep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sleep_hours: sleepHours })
        });
        const result = await res.json();

        if (retrainToast) {
          retrainToast.style.display = "block";
          retrainToast.textContent = `✓ Digital Twin retrained for ${sleepHours.toFixed(1)}h baseline sleep!`;
          setTimeout(() => { retrainToast.style.display = "none"; }, 4000);
        }

        // Refresh dashboard and analytics with updated model predictions
        loadDashboardData(currentTimeframe);
        if (currentActiveView === "analytics") {
          loadAnalyticsView();
        }
      } catch (err) {
        console.error("Retrain error:", err);
      } finally {
        if (retrainBtnText) retrainBtnText.textContent = "Retrain AI Model";
        retrainBtn.disabled = false;
      }
    });
  }
}

function syncDigitalTwinDeepView() {
  if (cachedDashboardData && cachedDashboardData.twin_status) {
    updateTwinUI(cachedDashboardData.twin_status);
  }
}

/* ==============================================================================
   11. WHAT-IF MICROCYCLE SIMULATOR VIEW (7-DAY PERIODIZATION)
   ============================================================================== */
const MICROCYCLE_PRESETS = {
  standard: [
    { day: "Mon", duration: 45, intensity: "Moderate", sleep: 7.5 },
    { day: "Tue", duration: 60, intensity: "Moderate", sleep: 8.0 },
    { day: "Wed", duration: 0,  intensity: "Low",      sleep: 8.5 },
    { day: "Thu", duration: 50, intensity: "High",     sleep: 7.5 },
    { day: "Fri", duration: 45, intensity: "Moderate", sleep: 7.5 },
    { day: "Sat", duration: 90, intensity: "Moderate", sleep: 8.5 },
    { day: "Sun", duration: 0,  intensity: "Low",      sleep: 9.0 }
  ],
  taper: [
    { day: "Mon", duration: 40, intensity: "Moderate", sleep: 8.5 },
    { day: "Tue", duration: 30, intensity: "Moderate", sleep: 8.5 },
    { day: "Wed", duration: 20, intensity: "Low",      sleep: 9.0 },
    { day: "Thu", duration: 25, intensity: "High",     sleep: 8.5 },
    { day: "Fri", duration: 0,  intensity: "Low",      sleep: 9.5 },
    { day: "Sat", duration: 15, intensity: "Low",      sleep: 9.5 },
    { day: "Sun", duration: 60, intensity: "High",     sleep: 9.0 }
  ],
  endurance: [
    { day: "Mon", duration: 75, intensity: "Moderate", sleep: 8.0 },
    { day: "Tue", duration: 90, intensity: "Moderate", sleep: 8.0 },
    { day: "Wed", duration: 60, intensity: "Moderate", sleep: 8.0 },
    { day: "Thu", duration: 80, intensity: "High",     sleep: 8.0 },
    { day: "Fri", duration: 45, intensity: "Low",      sleep: 8.5 },
    { day: "Sat", duration: 120, intensity: "Moderate", sleep: 8.5 },
    { day: "Sun", duration: 0,  intensity: "Low",      sleep: 9.0 }
  ],
  recovery: [
    { day: "Mon", duration: 30, intensity: "Low", sleep: 9.0 },
    { day: "Tue", duration: 0,  intensity: "Low", sleep: 9.5 },
    { day: "Wed", duration: 30, intensity: "Low", sleep: 9.0 },
    { day: "Thu", duration: 0,  intensity: "Low", sleep: 9.5 },
    { day: "Fri", duration: 25, intensity: "Low", sleep: 9.0 },
    { day: "Sat", duration: 40, intensity: "Low", sleep: 9.5 },
    { day: "Sun", duration: 0,  intensity: "Low", sleep: 10.0 }
  ],
  overload: [
    { day: "Mon", duration: 90, intensity: "High", sleep: 6.5 },
    { day: "Tue", duration: 100, intensity: "High", sleep: 6.5 },
    { day: "Wed", duration: 90, intensity: "High", sleep: 7.0 },
    { day: "Thu", duration: 110, intensity: "High", sleep: 6.5 },
    { day: "Fri", duration: 85, intensity: "High", sleep: 7.0 },
    { day: "Sat", duration: 120, intensity: "High", sleep: 7.5 },
    { day: "Sun", duration: 45, intensity: "Moderate", sleep: 7.5 }
  ]
};

function initWhatIfMicrocycleView() {
  const presetBtns = document.querySelectorAll(".microcycle-presets-bar .preset-btn");
  presetBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      presetBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const preset = btn.dataset.preset;
      renderMicrocycleInputs(preset);
    });
  });

  const runSimBtn = document.getElementById("btnRunScheduleSim");
  if (runSimBtn) {
    runSimBtn.addEventListener("click", runScheduleSimulation);
  }

  // Initial render
  renderMicrocycleInputs("standard");
}

function renderMicrocycleInputs(presetKey) {
  const grid = document.getElementById("microcycleGrid");
  if (!grid) return;

  const days = MICROCYCLE_PRESETS[presetKey] || MICROCYCLE_PRESETS.standard;

  grid.innerHTML = days.map((d, i) => `
    <div class="microcycle-day-card" data-day-index="${i}">
      <span class="day-card-title">${d.day}</span>
      <div class="day-input-group">
        <label>Duration (min)</label>
        <input type="number" class="day-dur-input" value="${d.duration}" min="0" max="240" step="5">
      </div>
      <div class="day-input-group">
        <label>Intensity</label>
        <select class="day-int-select">
          <option value="Low" ${d.intensity === "Low" ? "selected" : ""}>Low (Zone 1-2)</option>
          <option value="Moderate" ${d.intensity === "Moderate" ? "selected" : ""}>Moderate (Zone 3)</option>
          <option value="High" ${d.intensity === "High" ? "selected" : ""}>High (Zone 4-5)</option>
        </select>
      </div>
      <div class="day-input-group">
        <label>Sleep (hrs)</label>
        <input type="number" class="day-sleep-input" value="${d.sleep}" min="4" max="12" step="0.5">
      </div>
    </div>
  `).join("");

  // Automatically execute simulation for instant feedback
  runScheduleSimulation();

  grid.querySelectorAll("input, select").forEach(inp => {
    inp.addEventListener("input", runScheduleSimulation);
    inp.addEventListener("change", runScheduleSimulation);
  });
}

async function runScheduleSimulation() {
  const cards = document.querySelectorAll(".microcycle-day-card");
  if (!cards.length) return;

  const schedule = [];
  cards.forEach(card => {
    const dur = parseInt(card.querySelector(".day-dur-input")?.value || "45");
    const intStr = card.querySelector(".day-int-select")?.value || "Moderate";
    const sleep = parseFloat(card.querySelector(".day-sleep-input")?.value || "8.0");

    let intVal = 0.65;
    if (intStr === "Low") intVal = 0.40;
    else if (intStr === "High") intVal = 0.88;

    schedule.push({
      duration: dur,
      intensity: intVal,
      sleep: sleep
    });
  });

  const runBtn = document.getElementById("btnRunScheduleSim");
  if (runBtn) {
    runBtn.innerHTML = `<span>Simulating 7-Day Cycle...</span>`;
    runBtn.disabled = true;
  }

  try {
    const res = await fetch("/api/simulate-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initial_state: { fatigue: 20.0, recovery: 82.0, resting_hr: 54.0 },
        schedule: schedule
      })
    });

    const data = await res.json();
    if (data.summary) {
      const s = data.summary;
      const sumLoad = document.getElementById("simSumLoad");
      const sumFatigue = document.getElementById("simSumFatigue");
      const sumRecovery = document.getElementById("simSumRecovery");
      const sumReadiness = document.getElementById("simSumReadiness");
      const sumOverreach = document.getElementById("simSumOverreach");
      const sumHighRisk = document.getElementById("simSumHighRisk");

      if (sumLoad) sumLoad.textContent = `${Math.round(s.total_workload)} AU`;
      if (sumFatigue) sumFatigue.textContent = `${s.peak_fatigue.toFixed(1)}%`;
      if (sumRecovery) sumRecovery.textContent = `${s.min_recovery.toFixed(1)}%`;
      if (sumReadiness) sumReadiness.textContent = `${s.avg_readiness.toFixed(1)}`;
      if (sumOverreach) sumOverreach.textContent = s.overreaching_count;
      if (sumHighRisk) sumHighRisk.textContent = s.high_risk_count;
    }

    if (data.days) {
      cachedScheduleDays = data.days;
      renderScheduleTrajectoryChart(data.days);
      populateScheduleTable(data.days);
    }
  } catch (err) {
    console.error("Schedule simulation failed:", err);
  } finally {
    if (runBtn) {
      runBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Run 7-Day Simulation</span>
      `;
      runBtn.disabled = false;
    }
  }
}

function renderScheduleTrajectoryChart(days) {
  const canvas = document.getElementById("scheduleTrajectoryChart");
  if (!canvas || !days) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 15, right: 20, bottom: 25, left: 35 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.fillStyle = "#546580";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "right";

  [0, 25, 50, 75, 100].forEach(val => {
    const y = pad.top + plotH - (val / 100) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    ctx.fillText(`${val}%`, pad.left - 6, y + 3.5);
  });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  ctx.textAlign = "center";
  dayNames.forEach((d, i) => {
    const x = pad.left + (i / (dayNames.length - 1)) * plotW;
    ctx.fillText(d, x, h - 6);
  });

  const getX = i => pad.left + (i / (days.length - 1)) * plotW;
  const getY = val => pad.top + plotH - (Math.min(100, Math.max(0, val)) / 100) * plotH;

  // Fatigue Curve (Red)
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = getX(i);
    const y = getY(d["Fatigue (%)"]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Recovery Curve (Green)
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = getX(i);
    const y = getY(d["Recovery (%)"]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Performance Capacity Curve (Blue)
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = getX(i);
    const y = getY(d["Performance"]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

function populateScheduleTable(days) {
  const tbody = document.getElementById("simBreakdownTableBody");
  if (!tbody) return;

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  tbody.innerHTML = days.map((d, i) => {
    const dayLabel = dayNames[i] || `Day ${i + 1}`;
    const dur = d["Duration (min)"] || 0;
    const intVal = (d["Intensity"] || 0).toFixed(2);
    const load = Math.round(d["Daily Load"] || 0);
    const fatigue = (d["Fatigue (%)"] || 0).toFixed(1);
    const recovery = (d["Recovery (%)"] || 0).toFixed(1);
    const perf = (d["Performance"] || 0).toFixed(1);
    const status = d["Status"] || "OPTIMAL";

    let badgeClass = "badge-optimal";
    if (status === "HIGH RISK") badgeClass = "badge-high-risk";
    else if (status === "OVERREACHING") badgeClass = "badge-overreaching";

    return `
      <tr>
        <td><strong>${dayLabel}</strong></td>
        <td>${dur > 0 ? `Running • ${dur}m` : "Rest / Active Recovery"}</td>
        <td>${dur > 0 ? `Factor: ${intVal}` : "Rest"}</td>
        <td><strong>${load} AU</strong></td>
        <td><span style="color:#ef4444">${fatigue}%</span></td>
        <td><span style="color:#10b981">${recovery}%</span></td>
        <td><strong>${perf}</strong></td>
        <td><span class="badge-status-pill ${badgeClass}">${status}</span></td>
      </tr>
    `;
  }).join("");
}

/* ==============================================================================
   12. SETTINGS VIEW (ATHLETE PROFILES & PREFERENCES)
   ============================================================================== */
function initSettingsView() {
  const ageInput = document.getElementById("settingAthleteAge");
  const maxHrInput = document.getElementById("settingAthleteMaxHr");
  const saveBtn = document.getElementById("btnSaveSettings");
  const toast = document.getElementById("settingsSavedToast");

  if (ageInput && maxHrInput) {
    ageInput.addEventListener("input", () => {
      const age = parseInt(ageInput.value) || 28;
      maxHrInput.value = Math.max(150, 220 - age);
    });
  }

  // Load saved settings if any
  try {
    const saved = JSON.parse(localStorage.getItem("digitalTwinAthleteSettings") || "{}");
    if (saved.name) document.getElementById("settingAthleteName").value = saved.name;
    if (saved.age) {
      document.getElementById("settingAthleteAge").value = saved.age;
      if (maxHrInput) maxHrInput.value = 220 - saved.age;
    }
    if (saved.weight) document.getElementById("settingAthleteWeight").value = saved.weight;
    if (saved.height) document.getElementById("settingAthleteHeight").value = saved.height;
    if (saved.restHr) document.getElementById("settingAthleteRestHr").value = saved.restHr;
    if (saved.serverUrl) document.getElementById("settingServerUrl").value = saved.serverUrl;
    if (saved.wifiSsid) document.getElementById("settingWifiSsid").value = saved.wifiSsid;
  } catch (e) {}

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const settings = {
        name: document.getElementById("settingAthleteName")?.value || "Daniel Saji",
        age: parseInt(document.getElementById("settingAthleteAge")?.value || "28"),
        weight: parseFloat(document.getElementById("settingAthleteWeight")?.value || "72"),
        height: parseFloat(document.getElementById("settingAthleteHeight")?.value || "178"),
        restHr: parseInt(document.getElementById("settingAthleteRestHr")?.value || "54"),
        serverUrl: document.getElementById("settingServerUrl")?.value,
        wifiSsid: document.getElementById("settingWifiSsid")?.value
      };

      try {
        localStorage.setItem("digitalTwinAthleteSettings", JSON.stringify(settings));
      } catch (e) {}

      // Update hero greeting and top nav user name
      const userNameEls = document.querySelectorAll(".user-name");
      userNameEls.forEach(el => el.textContent = settings.name);

      if (toast) {
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 3500);
      }
    });
  }
}

/* ==============================================================================
   13. DUAL LIVE CANVAS CHARTS (DASHBOARD)
   ============================================================================== */

/**
 * Renders Heart Rate (BPM) smooth glowing curve with red area gradient
 */
function renderHeartRateChart(chartData, hoverIndex = null) {
  const canvas = document.getElementById("heartRateChart");
  if (!canvas || !chartData) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 12, right: 12, bottom: 20, left: 30 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const minY = 60;
  const maxY = 220;
  const getY = val => padding.top + plotH - ((val - minY) / (maxY - minY)) * plotH;

  // Horizontal Gridlines & Y-labels: 60, 100, 140, 180, 220
  const yTicks = [60, 100, 140, 180, 220];
  ctx.strokeStyle = "rgba(226, 232, 240, 0.9)";
  ctx.lineWidth = 1;
  ctx.font = "10px Inter, sans-serif";
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "right";

  yTicks.forEach(tick => {
    const y = getY(tick);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillText(tick, padding.left - 6, y + 3.5);
  });

  // X-axis Ticks & Labels dynamically from chartData
  const xLabels = chartData.x_labels || ["0", "10", "20", "30", "40", "50", "60"];
  ctx.textAlign = "center";
  xLabels.forEach((label, i) => {
    const x = padding.left + (i / (xLabels.length - 1)) * plotW;
    ctx.fillText(label, x, h - 4);
  });

  const pts = chartData.points || [95, 115, 138, 148, 160, 155, 164, 172, 168, 165, 170, 162, 158, 164, 152];
  if (pts.length < 2) return;

  const getX = i => padding.left + (i / (pts.length - 1)) * plotW;

  // Gradient Area Fill under Curve (Soft Pinkish Coral)
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
  gradient.addColorStop(0, "rgba(239, 68, 68, 0.25)");
  gradient.addColorStop(0.7, "rgba(239, 68, 68, 0.08)");
  gradient.addColorStop(1, "rgba(239, 68, 68, 0.01)");

  ctx.beginPath();
  ctx.moveTo(getX(0), getY(pts[0]));
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = getX(i);
    const y0 = getY(pts[i]);
    const x1 = getX(i + 1);
    const y1 = getY(pts[i + 1]);
    const mx = (x0 + x1) / 2;
    ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
  }
  ctx.lineTo(getX(pts.length - 1), padding.top + plotH);
  ctx.lineTo(getX(0), padding.top + plotH);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Smooth Coral Red Curve Line
  ctx.beginPath();
  ctx.moveTo(getX(0), getY(pts[0]));
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = getX(i);
    const y0 = getY(pts[i]);
    const x1 = getX(i + 1);
    const y1 = getY(pts[i + 1]);
    const mx = (x0 + x1) / 2;
    ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
  }
  ctx.strokeStyle = "#EF4444";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Interactive Hover Crosshair and Dot Indicator
  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < pts.length) {
    const hx = getX(hoverIndex);
    const hy = getY(pts[hoverIndex]);

    ctx.save();
    // Vertical dashed crosshair line
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(0, 132, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + plotH);
    ctx.stroke();

    // Outer pulsating glow circle
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.fill();

    // Inner sharp circle with crisp white outline
    ctx.fillStyle = "#EF4444";
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Renders Movement (Acceleration) 3-axis tri-axial waveform
 */
function renderMovementChart(chartData, hoverIndex = null) {
  const canvas = document.getElementById("movementChart");
  if (!canvas || !chartData) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  const padding = { top: 12, right: 12, bottom: 20, left: 30 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  const minY = -6;
  const maxY = 6;
  const getY = val => padding.top + plotH - ((val - minY) / (maxY - minY)) * plotH;

  // Horizontal Gridlines & Y-labels: -6, -3, 0, 3, 6
  const yTicks = [-6, -3, 0, 3, 6];
  ctx.strokeStyle = "rgba(226, 232, 240, 0.9)";
  ctx.lineWidth = 1;
  ctx.font = "10px Inter, sans-serif";
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "right";

  yTicks.forEach(tick => {
    const y = getY(tick);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillText(tick, padding.left - 6, y + 3.5);
  });

  // X-axis Ticks & Labels dynamically from chartData
  const xLabels = chartData.x_labels || ["0", "10", "20", "30", "40", "50", "60"];
  ctx.textAlign = "center";
  xLabels.forEach((label, i) => {
    const x = padding.left + (i / (xLabels.length - 1)) * plotW;
    ctx.fillText(label, x, h - 4);
  });

  const len = (chartData.x && chartData.x.length) || 35;
  const getX = (i, total) => padding.left + (i / (total - 1)) * plotW;

  function drawWave(arr, color) {
    if (!arr || arr.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(getX(0, arr.length), getY(arr[0]));
    for (let i = 0; i < arr.length - 1; i++) {
      const x0 = getX(i, arr.length);
      const y0 = getY(arr[i]);
      const x1 = getX(i + 1, arr.length);
      const y1 = getY(arr[i + 1]);
      const mx = (x0 + x1) / 2;
      ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Draw X (Cyan/Blue #0284C7), Y (Green #10B981), Z (Yellow/Orange #F59E0B) conditionally
  if (accelVisibility.x) drawWave(chartData.x, "#0284C7");
  if (accelVisibility.y) drawWave(chartData.y, "#10B981");
  if (accelVisibility.z) drawWave(chartData.z, "#F59E0B");

  // Interactive Hover Crosshair & Multi-Axis Dots
  if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < len) {
    const hx = getX(hoverIndex, len);

    ctx.save();
    // Vertical dashed crosshair line
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(0, 132, 255, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, padding.top);
    ctx.lineTo(hx, padding.top + plotH);
    ctx.stroke();

    // Highlight dots for visible axes
    const dots = [];
    if (accelVisibility.x && chartData.x) dots.push({ val: chartData.x[hoverIndex], color: "#0284C7" });
    if (accelVisibility.y && chartData.y) dots.push({ val: chartData.y[hoverIndex], color: "#10B981" });
    if (accelVisibility.z && chartData.z) dots.push({ val: chartData.z[hoverIndex], color: "#F59E0B" });

    ctx.setLineDash([]);
    dots.forEach(d => {
      const dy = getY(d.val);
      ctx.fillStyle = d.color;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx, dy, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }
}

/**
 * Connects clickable legend items (• X, • Y, • Z) to toggle axis lines on/off
 */
function initMovementLegendToggle() {
  ["x", "y", "z"].forEach(axis => {
    const el = document.getElementById(`legendAxis${axis.toUpperCase()}`);
    if (el) {
      el.addEventListener("click", () => {
        accelVisibility[axis] = !accelVisibility[axis];
        if (accelVisibility[axis]) {
          el.classList.remove("axis-hidden");
          el.classList.add("active");
          showToast(`Show ${axis.toUpperCase()} axis`, "📈", 1500);
        } else {
          el.classList.add("axis-hidden");
          el.classList.remove("active");
          showToast(`Hide ${axis.toUpperCase()} axis`, "📉", 1500);
        }
        if (cachedDashboardData && cachedDashboardData.charts && cachedDashboardData.charts.movement) {
          renderMovementChart(cachedDashboardData.charts.movement);
        }
      });
    }
  });
}

/* ==============================================================================
   14. QUICK WHAT-IF SIMULATOR (DASHBOARD CARD)
   ============================================================================== */
function initWhatIfSimulator() {
  const intButtons = document.querySelectorAll(".intensity-segmented-control .int-btn");
  const runBtn = document.getElementById("btnRunSimulation");
  const feedbackToast = document.getElementById("simFeedbackToast");

  intButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      intButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedIntensity = btn.dataset.intensity;
    });
  });

  if (runBtn) {
    runBtn.addEventListener("click", async () => {
      runBtn.innerHTML = `
        <svg class="spin-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
        </svg>
        <span>Simulating...</span>
      `;

      const nodes = document.querySelectorAll(".joint-node");
      nodes.forEach(n => n.classList.add("pulse-glow"));

      try {
        const res = await fetch("/api/simulate-step", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intensity_mode: selectedIntensity,
            current_fatigue: 20.0,
            current_recovery: 82.0
          })
        });

        const result = await res.json();

        updateTwinUI({
          fatigue_label: result.fatigue_label,
          fatigue_value: result.fatigue_value,
          recovery_label: result.recovery_label,
          recovery_value: result.recovery_value,
          performance_label: result.performance_label,
          performance_value: result.performance_value
        });

        if (result.simulated_workout) {
          const actName = document.getElementById("sessionActivityName");
          const metaText = document.getElementById("sessionMetaText");
          const avgHr = document.getElementById("sessionAvgHr");
          const maxHr = document.getElementById("sessionMaxHr");
          const cals = document.getElementById("sessionCalories");

          if (actName) actName.textContent = result.simulated_workout.activity;
          if (metaText) metaText.textContent = `Simulated Session • ${result.simulated_workout.duration}`;
          if (avgHr) avgHr.textContent = `${result.simulated_workout.avg_hr} BPM`;
          if (maxHr) maxHr.textContent = `${result.simulated_workout.avg_hr + 24} BPM`;
          if (cals) cals.textContent = `${result.simulated_workout.calories} kcal`;
        }

        if (feedbackToast) {
          feedbackToast.style.display = "block";
          feedbackToast.textContent = `✓ Twin state updated for ${selectedIntensity} intensity`;
          setTimeout(() => {
            feedbackToast.style.display = "none";
          }, 3000);
        }

      } catch (err) {
        console.error("Simulation error:", err);
      } finally {
        runBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>Run Simulation</span>
        `;
      }
    });
  }
}

// Window resize chart re-render with debouncing for fluid layout responsiveness
let resizeDebounceTimer = null;
let cachedScheduleDays = null;

window.addEventListener("resize", () => {
  clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    if (cachedDashboardData && cachedDashboardData.charts) {
      renderHeartRateChart(cachedDashboardData.charts.heart_rate);
      renderMovementChart(cachedDashboardData.charts.movement);
    }
    if (currentActiveView === "analytics" && cachedAnalyticsData && cachedAnalyticsData.history) {
      renderAnalyticsFatigueRecoveryChart(cachedAnalyticsData.history);
      renderAnalyticsLoadPerfChart(cachedAnalyticsData.history);
    }
    if (currentActiveView === "what-if" && cachedScheduleDays) {
      renderScheduleTrajectoryChart(cachedScheduleDays);
    }
  }, 80);
});

/* ==============================================================================
   15. REUSABLE TOAST NOTIFICATION SYSTEM
   ============================================================================== */
function showToast(message, icon = "⚡", duration = 3200) {
  const toast = document.getElementById("globalToast");
  const msg = document.getElementById("globalToastMsg");
  if (!toast) return;

  if (msg) msg.textContent = message;
  const iconSpan = toast.querySelector("span:first-child");
  if (iconSpan) iconSpan.textContent = icon;

  toast.style.display = "flex";
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = "none";
  }, duration);
}

/* ==============================================================================
   16. ATHLETE PROFILE DROPDOWN POPOVER
   ============================================================================== */
function initProfileDropdown() {
  const profileMenu = document.querySelector(".user-profile-menu");
  const dropdown = document.getElementById("userProfileDropdown");
  const linkProfile = document.getElementById("dropdownLinkProfile");
  const linkSettings = document.getElementById("dropdownLinkSettings");

  if (!profileMenu || !dropdown) return;

  profileMenu.addEventListener("click", e => {
    e.stopPropagation();
    const isVisible = dropdown.style.display === "block";
    dropdown.style.display = isVisible ? "none" : "block";
  });

  document.addEventListener("click", e => {
    if (!dropdown.contains(e.target) && !profileMenu.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });

  if (linkProfile) {
    linkProfile.addEventListener("click", e => {
      e.preventDefault();
      dropdown.style.display = "none";
      switchView("digital-twin");
    });
  }

  if (linkSettings) {
    linkSettings.addEventListener("click", e => {
      e.preventDefault();
      dropdown.style.display = "none";
      switchView("settings");
    });
  }
}

/* ==============================================================================
   17. DUAL CHART HOVER CROSSHAIR & FLOATING TOOLTIPS
   ============================================================================== */
function positionTooltip(tooltipEl, containerEl, mouseX, mouseY) {
  const cRect = containerEl.getBoundingClientRect();
  let left = mouseX + 16;
  let top = mouseY - 45;

  if (left + 175 > cRect.width) {
    left = mouseX - 180;
  }
  if (top < 8) {
    top = mouseY + 16;
  }

  tooltipEl.style.left = `${Math.max(8, Math.round(left))}px`;
  tooltipEl.style.top = `${Math.max(6, Math.round(top))}px`;
  tooltipEl.style.display = "block";
}

function initChartTooltips() {
  const hrBox = document.getElementById("hrCanvasContainer");
  const hrCanvas = document.getElementById("heartRateChart");
  const hrTooltip = document.getElementById("hrChartTooltip");

  if (hrBox && hrCanvas && hrTooltip) {
    hrBox.addEventListener("mousemove", e => {
      if (!cachedDashboardData || !cachedDashboardData.charts || !cachedDashboardData.charts.heart_rate) return;
      const chartData = cachedDashboardData.charts.heart_rate;
      const pts = chartData.points || [];
      if (pts.length < 2) return;

      const rect = hrCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const padding = { top: 12, right: 12, bottom: 20, left: 30 };
      const plotW = rect.width - padding.left - padding.right;

      if (mouseX < padding.left || mouseX > rect.width - padding.right) {
        hrTooltip.style.display = "none";
        renderHeartRateChart(chartData, null);
        return;
      }

      const ratio = (mouseX - padding.left) / plotW;
      const idx = Math.min(pts.length - 1, Math.max(0, Math.round(ratio * (pts.length - 1))));

      renderHeartRateChart(chartData, idx);

      const bpm = pts[idx];
      let timeStr = "";
      if (chartData.time_unit === "seconds") {
        timeStr = `${Math.round(ratio * 60)}s`;
      } else {
        const maxMins = currentTimeframe === "10M" ? 10 : (currentTimeframe === "30M" ? 30 : 60);
        timeStr = `${Math.round(ratio * maxMins)} min`;
      }

      let zoneName = "Zone 3 (Aerobic Base)";
      if (bpm > 175) zoneName = "Zone 5 (Max Capacity)";
      else if (bpm > 155) zoneName = "Zone 4 (Anaerobic Threshold)";
      else if (bpm < 130) zoneName = "Zone 2 (Active Recovery)";

      hrTooltip.innerHTML = `
        <div class="tooltip-header">Time: ${timeStr}</div>
        <div class="tooltip-val">${bpm} <span style="font-size:0.75rem;color:#94A3B8;">BPM</span></div>
        <div style="font-size:0.7rem;color:#E2E8F0;margin-top:3px;">${zoneName}</div>
      `;

      positionTooltip(hrTooltip, hrBox, mouseX, mouseY);
    });

    hrBox.addEventListener("mouseleave", () => {
      hrTooltip.style.display = "none";
      if (cachedDashboardData && cachedDashboardData.charts) {
        renderHeartRateChart(cachedDashboardData.charts.heart_rate, null);
      }
    });
  }

  const movBox = document.getElementById("movementCanvasContainer");
  const movCanvas = document.getElementById("movementChart");
  const movTooltip = document.getElementById("movementChartTooltip");

  if (movBox && movCanvas && movTooltip) {
    movBox.addEventListener("mousemove", e => {
      if (!cachedDashboardData || !cachedDashboardData.charts || !cachedDashboardData.charts.movement) return;
      const chartData = cachedDashboardData.charts.movement;
      const len = (chartData.x && chartData.x.length) || 0;
      if (len < 2) return;

      const rect = movCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const padding = { top: 12, right: 12, bottom: 20, left: 30 };
      const plotW = rect.width - padding.left - padding.right;

      if (mouseX < padding.left || mouseX > rect.width - padding.right) {
        movTooltip.style.display = "none";
        renderMovementChart(chartData, null);
        return;
      }

      const ratio = (mouseX - padding.left) / plotW;
      const idx = Math.min(len - 1, Math.max(0, Math.round(ratio * (len - 1))));

      renderMovementChart(chartData, idx);

      const x = chartData.x ? chartData.x[idx] : 0;
      const y = chartData.y ? chartData.y[idx] : 0;
      const z = chartData.z ? chartData.z[idx] : 0;
      const mag = Math.sqrt(x*x + y*y + z*z).toFixed(2);

      let timeStr = "";
      if (chartData.time_unit === "seconds") {
        timeStr = `${Math.round(ratio * 60)}s`;
      } else {
        const maxMins = currentTimeframe === "10M" ? 10 : (currentTimeframe === "30M" ? 30 : 60);
        timeStr = `${Math.round(ratio * maxMins)} min`;
      }

      movTooltip.innerHTML = `
        <div class="tooltip-header">Time: ${timeStr}</div>
        <div class="tooltip-val">${mag} <span style="font-size:0.75rem;color:#94A3B8;">g Total Load</span></div>
        <div style="font-size:0.7rem;color:#E2E8F0;margin-top:3px;display:flex;gap:8px;">
          <span style="color:#38BDF8;">X: ${x >= 0 ? "+" : ""}${x.toFixed(2)}</span>
          <span style="color:#10B981;">Y: ${y >= 0 ? "+" : ""}${y.toFixed(2)}</span>
          <span style="color:#F59E0B;">Z: ${z >= 0 ? "+" : ""}${z.toFixed(2)}</span>
        </div>
      `;

      positionTooltip(movTooltip, movBox, mouseX, mouseY);
    });

    movBox.addEventListener("mouseleave", () => {
      movTooltip.style.display = "none";
      if (cachedDashboardData && cachedDashboardData.charts) {
        renderMovementChart(cachedDashboardData.charts.movement, null);
      }
    });
  }
}

/* ==============================================================================
   18. TRAINING SESSION TELEMETRY DETAIL MODAL
   ============================================================================== */
function initSessionModal() {
  const modal = document.getElementById("sessionDetailModal");
  const closeBtn = document.getElementById("btnCloseSessionModal");
  const rows = document.querySelectorAll(".session-row-clickable");

  if (!modal) return;

  rows.forEach(row => {
    row.addEventListener("click", () => {
      const type = row.dataset.sessionType || "Training";
      const date = row.dataset.date || "Today";
      const dur = row.dataset.dur || "60 min";
      const hr = row.dataset.hr || "152 BPM";
      const maxhr = row.dataset.maxhr || "182 BPM";
      const intensity = row.dataset.int || "High";
      const cals = row.dataset.cals || "680 kcal";
      const notes = row.dataset.notes || "Tactical drills";

      const titleEl = document.getElementById("sessionModalTitle");
      const subEl = document.getElementById("sessionModalSubtitle");
      const avgHrEl = document.getElementById("modalAvgHr");
      const maxHrEl = document.getElementById("modalMaxHr");
      const calsEl = document.getElementById("modalCals");
      const intEl = document.getElementById("modalIntensity");
      const notesEl = document.getElementById("modalSessionNotes");

      if (titleEl) titleEl.textContent = `${type} Telemetry Breakdown`;
      if (subEl) subEl.textContent = `${date} • ${type} (${dur})`;
      if (avgHrEl) avgHrEl.textContent = hr;
      if (maxHrEl) maxHrEl.textContent = maxhr;
      if (calsEl) calsEl.textContent = cals;
      if (intEl) {
        intEl.textContent = intensity;
        intEl.style.color = intensity === "High" ? "#EF4444" : (intensity === "Moderate" ? "#F59E0B" : "#10B981");
      }
      if (notesEl) notesEl.textContent = notes;

      modal.style.display = "flex";
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });
}

/* ==============================================================================
   19. INJURY RISK DETAIL MODAL & SORENESS SLIDER
   ============================================================================== */
const INJURY_DATABASE = {
  hamstring: {
    title: "Hamstring Strain Assessment",
    asymmetry: "+14.2% L/R",
    badge: "Elevated",
    badgeClass: "pill-red",
    desc: "High-speed running distance (>25 km/h) reached 840m in last match. Eccentric hamstring tension spikes during late swing phase before ground strike. Left biceps femoris load exceeds chronic baseline.",
    defaultSoreness: 6,
    protocol: [
      "3 sets of 5 repetitions Nordic Hamstring Curls (sub-maximal eccentric control).",
      "Limit maximum velocity sprints during today's tactical session to < 85%.",
      "Post-training percussion therapy & active hamstring floss bands."
    ]
  },
  quadriceps: {
    title: "Quadriceps Strain & Tendon Load",
    asymmetry: "+6.8% L/R",
    badge: "Moderate",
    badgeClass: "pill-yellow",
    desc: "High deceleration frequency detected by 6-DOF IMU (48 cuts > 3.0g). Patellar tendon absorbing repetitive eccentric quadriceps braking forces.",
    defaultSoreness: 4,
    protocol: [
      "Isometric wall sits (4x45s) prior to pitch session to desensitize patellar tendon.",
      "Spanish squat variations with resistance bands.",
      "Active quad foam rolling and rectus femoris dynamic stretching."
    ]
  },
  calf: {
    title: "Calf Complex (Gastrocnemius & Soleus)",
    asymmetry: "+2.1% L/R",
    badge: "Low",
    badgeClass: "pill-green",
    desc: "Symmetric vertical ground reaction impulse. Achilles tendon stiffness within optimal elastic range with low cumulative shear strain.",
    defaultSoreness: 2,
    protocol: [
      "Standard dynamic ankle mobility drills.",
      "Straight-leg and bent-knee calf raises with controlled tempo.",
      "Post-session elevation and compression socks."
    ]
  },
  achilles: {
    title: "Achilles Tendon Load & Shear Stress",
    asymmetry: "+11.5% L/R",
    badge: "Elevated",
    badgeClass: "pill-red",
    desc: "Elevated cumulative ground contact cycles on firm pitch surface. Peak acceleration spikes exceeding 2.8g in sprint transitions. Tendon stiffness adaptation required.",
    defaultSoreness: 7,
    protocol: [
      "Heavy slow resistance (HSR) heel drops off step edge.",
      "Avoid explosive plyometric hops until morning stiffness subsides.",
      "Contrast thermal bath therapy (3 min warm / 1 min ice)."
    ]
  }
};

let activeInjuryKey = "hamstring";

function initInjuryModal() {
  const modal = document.getElementById("injuryDetailModal");
  const closeBtn = document.getElementById("btnCloseInjuryModal");
  const saveBtn = document.getElementById("btnSaveInjurySoreness");
  const slider = document.getElementById("sorenessSlider");
  const label = document.getElementById("sorenessValLabel");
  const rows = document.querySelectorAll(".injury-row-item");

  if (!modal) return;

  function updateSliderLabel(val) {
    if (!label) return;
    let desc = "Low / Fresh";
    let color = "#10B981";
    if (val > 6) {
      desc = "High / Severe";
      color = "#EF4444";
    } else if (val > 3) {
      desc = "Moderate / Manageable";
      color = "#F59E0B";
    }
    label.innerHTML = `${val} / 10 (<span style="color:${color};font-weight:800;">${desc}</span>)`;
  }

  if (slider) {
    slider.addEventListener("input", () => {
      updateSliderLabel(parseInt(slider.value));
    });
  }

  rows.forEach(row => {
    row.addEventListener("click", () => {
      const key = row.dataset.injury || "hamstring";
      activeInjuryKey = key;
      const data = INJURY_DATABASE[key] || INJURY_DATABASE.hamstring;

      const titleEl = document.getElementById("injuryModalTitle");
      const badgeEl = document.getElementById("injuryModalBadge");
      const asymEl = document.getElementById("injuryModalAsym");
      const descEl = document.getElementById("injuryModalDesc");
      const protocolEl = document.getElementById("injuryModalProtocol");

      if (titleEl) titleEl.textContent = data.title;
      if (badgeEl) {
        const currentBadgeOnCard = row.querySelector(".badge-pill");
        const currentStatus = currentBadgeOnCard ? currentBadgeOnCard.textContent.trim() : data.badge;
        badgeEl.textContent = currentStatus;
        badgeEl.style.color = currentStatus === "Elevated" ? "#DC2626" : (currentStatus === "Moderate" ? "#D97706" : "#16A34A");
      }
      if (asymEl) asymEl.textContent = data.asymmetry;
      if (descEl) descEl.textContent = data.desc;

      if (protocolEl) {
        protocolEl.innerHTML = data.protocol.map(p => `<li>${p}</li>`).join("");
      }

      if (slider) {
        slider.value = data.defaultSoreness;
        updateSliderLabel(data.defaultSoreness);
      }

      modal.style.display = "flex";
    });
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const val = slider ? parseInt(slider.value) : 5;
      let newRisk = "Moderate";
      let pillClass = "pill-yellow";
      if (val <= 3) {
        newRisk = "Low";
        pillClass = "pill-green";
      } else if (val >= 7) {
        newRisk = "Elevated";
        pillClass = "pill-red";
      }

      const targetBadgeId = {
        hamstring: "badgeHamstring",
        quadriceps: "badgeQuadriceps",
        calf: "badgeCalf",
        achilles: "badgeAchilles"
      }[activeInjuryKey];

      if (targetBadgeId) {
        const badge = document.getElementById(targetBadgeId);
        if (badge) {
          badge.className = `badge-pill ${pillClass}`;
          badge.textContent = newRisk;
        }
      }

      modal.style.display = "none";
      showToast(`✓ ${INJURY_DATABASE[activeInjuryKey]?.title || "Injury"} updated: Soreness ${val}/10 (${newRisk} Risk)`, "🩺");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });
}

/* ==============================================================================
   20. DAILY WELLNESS CHECK-IN & RECOVERY DONUT RECALIBRATION
   ============================================================================== */
function initDailyCheckinModal() {
  const modal = document.getElementById("dailyCheckinModal");
  const closeBtn = document.getElementById("btnCloseCheckinModal");
  const submitBtn = document.getElementById("btnSubmitCheckin");
  const openTriggers = [
    document.getElementById("donutRecoveryWidget"),
    document.getElementById("metricFatigueItem"),
    document.getElementById("metricReadinessItem")
  ];

  if (!modal) return;

  openTriggers.forEach(el => {
    if (el) {
      el.addEventListener("click", () => {
        modal.style.display = "flex";
      });
    }
  });

  function wireRadioGroup(groupId) {
    const container = document.getElementById(groupId);
    if (!container) return;
    const btns = container.querySelectorAll(".rate-btn");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        btns.forEach(b => {
          b.classList.remove("active");
          b.style.background = "";
          b.style.color = "";
        });
        btn.classList.add("active");
        btn.style.background = "var(--primary-blue)";
        btn.style.color = "#ffffff";
      });
    });
  }

  wireRadioGroup("sleepRatingGroup");
  wireRadioGroup("sorenessRatingGroup");
  wireRadioGroup("motivationRatingGroup");

  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const sleepBtn = document.querySelector("#sleepRatingGroup .rate-btn.active");
      const sleepVal = sleepBtn ? parseFloat(sleepBtn.dataset.val) : 7.5;

      const sorenessBtn = document.querySelector("#sorenessRatingGroup .rate-btn.active");
      const soreness = sorenessBtn ? sorenessBtn.dataset.soreness : "Moderate";

      const motBtn = document.querySelector("#motivationRatingGroup .rate-btn.active");
      const motVal = motBtn ? parseInt(motBtn.dataset.mot) : 3;

      let score = 78;
      if (sleepVal >= 8.5) score += 9;
      else if (sleepVal < 7.0) score -= 14;

      if (soreness === "Low") score += 7;
      else if (soreness === "High") score -= 12;

      if (motVal === 3) score += 4;
      else if (motVal === 1) score -= 8;

      score = Math.min(98, Math.max(42, Math.round(score)));

      let fatigueLabel = "Moderate";
      let readinessLabel = "Moderate";
      if (score >= 82) {
        fatigueLabel = "Low";
        readinessLabel = "High";
      } else if (score < 65) {
        fatigueLabel = "High";
        readinessLabel = "Suboptimal";
      } else {
        fatigueLabel = "Moderate";
        readinessLabel = "Moderate";
      }

      updateTwinUI({
        recovery_value: score,
        recovery_label: `${score}%`,
        fatigue_label: fatigueLabel,
        fatigue_value: 100 - score,
        performance_label: readinessLabel,
        performance_value: score
      });

      modal.style.display = "none";
      showToast(`✓ Daily wellness check-in logged! Recovery Score recalculated: ${score}%`, "🏆");
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });
}

/* ==============================================================================
   21. RECOMMENDED PRECAUTIONS INTERACTIVE CHECKLIST
   ============================================================================== */
function initPrecautionsChecklist() {
  const items = document.querySelectorAll("#precautionsChecklist .precaution-item");
  items.forEach(item => {
    item.addEventListener("click", () => {
      const isDone = item.classList.toggle("completed");
      if (isDone) {
        showToast("✓ Precaution item marked as completed!", "✅", 2500);
      }
    });
  });
}

/* ==============================================================================
   22. SCIENTIFIC INFO POPUP MODALS (ⓘ ICONS)
   ============================================================================== */
function initInfoModals() {
  const modal = document.getElementById("infoPopModal");
  const closeBtn = document.getElementById("btnCloseInfoModal");
  const titleEl = document.getElementById("infoModalTitle");
  const bodyEl = document.getElementById("infoModalBody");

  const btnInjury = document.getElementById("btnInjuryInfo");
  const btnPrecautions = document.getElementById("btnPrecautionsInfo");

  if (!modal) return;

  if (btnInjury) {
    btnInjury.addEventListener("click", () => {
      if (titleEl) titleEl.textContent = "Biomechanical Injury Risk Model";
      if (bodyEl) {
        bodyEl.innerHTML = `
          The Digital Twin Athlete combines real-time 6-DOF IMU acceleration spikes (>2.5g), acute-to-chronic workload ratios (ACWR), and athlete-reported neuromuscular fatigue.<br><br>
          Elevated risk alerts trigger targeted pre-habilitation drills to prevent soft-tissue non-contact injuries before they occur.
        `;
      }
      modal.style.display = "flex";
    });
  }

  if (btnPrecautions) {
    btnPrecautions.addEventListener("click", () => {
      if (titleEl) titleEl.textContent = "Physiological Recovery Guidelines";
      if (bodyEl) {
        bodyEl.innerHTML = `
          Evidence-based recovery protocols derived from UEFA and FIFA medical consensus.<br><br>
          Load management combines progressive eccentric conditioning (e.g. Nordic curls), circadian-aligned sleep hygiene (minimum 8 hours), and dynamic tissue mobility.
        `;
      }
      modal.style.display = "flex";
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  modal.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });
}

/* ==============================================================================
   23. METRIC CARDS INTERACTIVE CLICK HANDLERS
   ============================================================================== */
function initMetricCardsClick() {
  const hrCard = document.querySelector(".metric-header .icon-heart")?.closest(".metric-card");
  const spo2Card = document.querySelector(".metric-header .icon-spo2")?.closest(".metric-card");
  const actCard = document.querySelector(".metric-header .icon-activity")?.closest(".metric-card");
  const accelCard = document.querySelector(".metric-header .icon-accel")?.closest(".metric-card");

  if (hrCard) {
    hrCard.addEventListener("click", () => {
      const hr = document.getElementById("vitalHrVal")?.textContent || "156";
      showToast(`Heart Rate: ${hr} BPM (Zone 4: Anaerobic Threshold) • Tap "Live Data" in sidebar for high-speed PPG inspection`, "❤️");
    });
  }

  if (spo2Card) {
    spo2Card.addEventListener("click", () => {
      const spo2 = document.getElementById("vitalSpo2Val")?.textContent || "98";
      showToast(`Blood Oxygen: ${spo2}% SpO2 • Optimal arterial oxygen saturation`, "🩸");
    });
  }

  if (actCard) {
    actCard.addEventListener("click", () => {
      const act = document.getElementById("vitalActivityVal")?.textContent || "Running";
      showToast(`Activity Status: ${act} (Team Training Session) • GPS speed & cadence streaming`, "⚽");
    });
  }

  if (accelCard) {
    accelCard.addEventListener("click", () => {
      const g = document.getElementById("vitalAccelVal")?.textContent || "2.8";
      showToast(`Instantaneous Load: ${g}g • Tri-axial IMU vector streaming`, "📈");
    });
  }
}

/* ==============================================================================
   24. WHAT-IF PREDICTIVE SIMULATOR STUDIO CONTROLS
   ============================================================================== */
function initWhatIfStudio() {
  const durRange = document.getElementById("whatifDurationRange");
  const durInput = document.getElementById("whatifDurationInput");
  const presetGroup = document.getElementById("scenarioPresetGroup");
  const intGroup = document.getElementById("whatifIntensityButtons");
  const runBtn = document.getElementById("btnRunWhatIfSim");
  const resetBtn = document.getElementById("btnResetWhatIf");

  let scenarioIntensity = "Moderate";
  let scenarioDuration = 60;
  let scenarioPreset = "Normal";

  // Baseline reference metrics for Daniel Saji
  const baselineState = {
    intensity: "Moderate",
    duration: 60,
    fatigue: 38.0,
    recovery: 78.0,
    readiness: 85.0,
    avgHr: 154,
    calories: 680
  };

  // Sync duration slider <-> numeric input
  if (durRange && durInput) {
    durRange.addEventListener("input", () => {
      durInput.value = durRange.value;
      scenarioDuration = parseInt(durRange.value);
      checkPresetMatch();
    });

    durInput.addEventListener("input", () => {
      let val = parseInt(durInput.value) || 15;
      val = Math.max(15, Math.min(120, val));
      durRange.value = val;
      scenarioDuration = val;
      checkPresetMatch();
    });
  }

  // Intensity buttons (Low, Moderate, High)
  if (intGroup) {
    const btns = intGroup.querySelectorAll(".int-btn");
    btns.forEach(btn => {
      btn.addEventListener("click", () => {
        btns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        scenarioIntensity = btn.dataset.int || "Moderate";
        checkPresetMatch();
      });
    });
  }

  // Preset Scenario pills (Normal, Increased Training, Recovery)
  if (presetGroup) {
    const pills = presetGroup.querySelectorAll(".preset-pill");
    pills.forEach(pill => {
      pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        scenarioPreset = pill.dataset.scenario;

        if (scenarioPreset === "Normal") {
          setScenarioParameters("Moderate", 60);
        } else if (scenarioPreset === "Increased Training") {
          setScenarioParameters("High", 75);
        } else if (scenarioPreset === "Recovery") {
          setScenarioParameters("Low", 30);
        }

        runSimulationCalculation();
      });
    });
  }

  function setScenarioParameters(intensity, duration) {
    scenarioIntensity = intensity;
    scenarioDuration = duration;

    if (durRange) durRange.value = duration;
    if (durInput) durInput.value = duration;

    if (intGroup) {
      const btns = intGroup.querySelectorAll(".int-btn");
      btns.forEach(b => {
        if (b.dataset.int === intensity) {
          b.classList.add("active");
        } else {
          b.classList.remove("active");
        }
      });
    }
  }

  function checkPresetMatch() {
    if (!presetGroup) return;
    const pills = presetGroup.querySelectorAll(".preset-pill");
    pills.forEach(p => p.classList.remove("active"));

    if (scenarioIntensity === "Moderate" && scenarioDuration === 60) {
      const normal = presetGroup.querySelector('[data-scenario="Normal"]');
      if (normal) normal.classList.add("active");
    } else if (scenarioIntensity === "High" && scenarioDuration === 75) {
      const increased = presetGroup.querySelector('[data-scenario="Increased Training"]');
      if (increased) increased.classList.add("active");
    } else if (scenarioIntensity === "Low" && scenarioDuration === 30) {
      const rec = presetGroup.querySelector('[data-scenario="Recovery"]');
      if (rec) rec.classList.add("active");
    }
  }

  async function runSimulationCalculation() {
    if (runBtn) {
      runBtn.innerHTML = `
        <svg class="spin-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/>
        </svg>
        <span>Calculating Model...</span>
      `;
      runBtn.disabled = true;
    }

    let intFactor = 0.65;
    if (scenarioIntensity === "Low") intFactor = 0.40;
    else if (scenarioIntensity === "High") intFactor = 0.88;

    let predictedFatigue = 38.0;
    let predictedRecovery = 78.0;
    let predictedReadiness = 85.0;
    let predictedAvgHr = 154;
    let predictedCalories = 680;
    let fatigueLabel = "Moderate";
    let recoveryLabel = "Optimal";
    let readinessLabel = "High";

    try {
      const res = await fetch("/api/simulate-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intensity_mode: scenarioIntensity,
          duration: scenarioDuration,
          intensity: intFactor,
          current_fatigue: baselineState.fatigue,
          current_recovery: baselineState.recovery
        })
      });

      if (res.ok) {
        const data = await res.json();
        predictedFatigue = data.fatigue_value !== undefined ? data.fatigue_value : 38.0;
        predictedRecovery = data.recovery_value !== undefined ? data.recovery_value : 78.0;
        predictedReadiness = data.performance_value !== undefined ? data.performance_value : 85.0;
        fatigueLabel = data.fatigue_label || (predictedFatigue > 55 ? "High" : (predictedFatigue > 35 ? "Moderate" : "Low"));
        recoveryLabel = predictedRecovery >= 75 ? "Optimal" : (predictedRecovery >= 60 ? "Moderate" : "Depleted");
        readinessLabel = data.performance_label || (predictedReadiness >= 80 ? "High" : (predictedReadiness >= 65 ? "Moderate" : "Low"));

        if (data.simulated_workout) {
          predictedAvgHr = data.simulated_workout.avg_hr || Math.round(110 + intFactor * 75);
          predictedCalories = data.simulated_workout.calories || Math.round(scenarioDuration * intFactor * 15.5);
        }
      } else {
        throw new Error("Server response not ok");
      }
    } catch (e) {
      // Robust mathematical simulation fallback
      const acuteLoad = scenarioDuration * intFactor;
      predictedFatigue = Math.min(95, Math.max(12, Math.round(20 + acuteLoad * 0.52)));
      predictedRecovery = Math.min(98, Math.max(15, Math.round(92 - acuteLoad * 0.38)));
      predictedReadiness = Math.min(99, Math.max(15, Math.round(predictedRecovery * 0.65 + (100 - predictedFatigue) * 0.35)));
      predictedAvgHr = Math.round(112 + intFactor * 74);
      predictedCalories = Math.round(scenarioDuration * intFactor * 16.2);

      fatigueLabel = predictedFatigue > 55 ? "High" : (predictedFatigue > 35 ? "Moderate" : "Low");
      recoveryLabel = predictedRecovery >= 75 ? "Optimal" : (predictedRecovery >= 60 ? "Moderate" : "Depleted");
      readinessLabel = predictedReadiness >= 80 ? "High" : (predictedReadiness >= 65 ? "Moderate" : "Low");
    } finally {
      if (runBtn) {
        runBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>Run Simulation</span>
        `;
        runBtn.disabled = false;
      }
    }

    // Update Outcome Display
    updateOutcomeDisplay({
      fatigue: predictedFatigue,
      fatigueLabel: fatigueLabel,
      recovery: predictedRecovery,
      recoveryLabel: recoveryLabel,
      readiness: predictedReadiness,
      readinessLabel: readinessLabel,
      avgHr: predictedAvgHr,
      calories: predictedCalories
    });

    showToast(`Simulation Complete: ${scenarioDuration} min at ${scenarioIntensity} intensity`, "⚡", 2500);
  }

  function updateOutcomeDisplay(outcome) {
    // 1. Fatigue
    const fatigueValEl = document.getElementById("predFatigueVal");
    const fatigueStatusEl = document.getElementById("predFatigueStatus");
    const barFatigue = document.getElementById("barFatigue");
    const deltaFatigueBadge = document.getElementById("deltaFatigueBadge");

    const fRound = Math.round(outcome.fatigue);
    if (fatigueValEl) fatigueValEl.textContent = `${fRound}%`;
    if (fatigueStatusEl) {
      fatigueStatusEl.textContent = outcome.fatigueLabel;
      fatigueStatusEl.className = `outcome-status-tag ${fRound > 55 ? "status-red" : (fRound > 35 ? "status-amber" : "status-green")}`;
    }
    if (barFatigue) {
      barFatigue.style.width = `${Math.min(100, Math.max(5, fRound))}%`;
      barFatigue.className = `progress-fill ${fRound > 55 ? "fill-red" : (fRound > 35 ? "fill-amber" : "fill-green")}`;
    }
    if (deltaFatigueBadge) {
      const diff = fRound - Math.round(baselineState.fatigue);
      if (diff === 0) {
        deltaFatigueBadge.textContent = "Baseline";
        deltaFatigueBadge.className = "delta-badge delta-neutral";
      } else if (diff > 0) {
        deltaFatigueBadge.textContent = `↑ +${diff}%`;
        deltaFatigueBadge.className = "delta-badge delta-negative";
      } else {
        deltaFatigueBadge.textContent = `↓ ${diff}%`;
        deltaFatigueBadge.className = "delta-badge delta-positive";
      }
    }

    // 2. Recovery
    const recValEl = document.getElementById("predRecoveryVal");
    const recStatusEl = document.getElementById("predRecoveryStatus");
    const barRecovery = document.getElementById("barRecovery");
    const deltaRecoveryBadge = document.getElementById("deltaRecoveryBadge");

    const rRound = Math.round(outcome.recovery);
    if (recValEl) recValEl.textContent = `${rRound}%`;
    if (recStatusEl) {
      recStatusEl.textContent = outcome.recoveryLabel;
      recStatusEl.className = `outcome-status-tag ${rRound >= 75 ? "status-blue" : (rRound >= 60 ? "status-amber" : "status-red")}`;
    }
    if (barRecovery) {
      barRecovery.style.width = `${Math.min(100, Math.max(5, rRound))}%`;
      barRecovery.className = `progress-fill ${rRound >= 75 ? "fill-blue" : (rRound >= 60 ? "fill-amber" : "fill-red")}`;
    }
    if (deltaRecoveryBadge) {
      const diff = rRound - Math.round(baselineState.recovery);
      if (diff === 0) {
        deltaRecoveryBadge.textContent = "Baseline";
        deltaRecoveryBadge.className = "delta-badge delta-neutral";
      } else if (diff > 0) {
        deltaRecoveryBadge.textContent = `↑ +${diff}%`;
        deltaRecoveryBadge.className = "delta-badge delta-positive";
      } else {
        deltaRecoveryBadge.textContent = `↓ ${diff}%`;
        deltaRecoveryBadge.className = "delta-badge delta-negative";
      }
    }

    // 3. Performance Readiness
    const readValEl = document.getElementById("predReadinessVal");
    const readStatusEl = document.getElementById("predReadinessStatus");
    const barReadiness = document.getElementById("barReadiness");
    const deltaReadinessBadge = document.getElementById("deltaReadinessBadge");

    const pRound = Math.round(outcome.readiness);
    if (readValEl) readValEl.textContent = `${pRound}%`;
    if (readStatusEl) {
      readStatusEl.textContent = outcome.readinessLabel;
      readStatusEl.className = `outcome-status-tag ${pRound >= 80 ? "status-green" : (pRound >= 65 ? "status-amber" : "status-red")}`;
    }
    if (barReadiness) {
      barReadiness.style.width = `${Math.min(100, Math.max(5, pRound))}%`;
      barReadiness.className = `progress-fill ${pRound >= 80 ? "fill-green" : (pRound >= 65 ? "fill-amber" : "fill-red")}`;
    }
    if (deltaReadinessBadge) {
      const diff = pRound - Math.round(baselineState.readiness);
      if (diff === 0) {
        deltaReadinessBadge.textContent = "Baseline";
        deltaReadinessBadge.className = "delta-badge delta-neutral";
      } else if (diff > 0) {
        deltaReadinessBadge.textContent = `↑ +${diff}%`;
        deltaReadinessBadge.className = "delta-badge delta-positive";
      } else {
        deltaReadinessBadge.textContent = `↓ ${diff}%`;
        deltaReadinessBadge.className = "delta-badge delta-negative";
      }
    }

    // Secondary metrics
    const avgHrEl = document.getElementById("predAvgHrVal");
    const calsEl = document.getElementById("predCaloriesVal");
    if (avgHrEl) avgHrEl.textContent = `${outcome.avgHr} BPM`;
    if (calsEl) calsEl.textContent = `${outcome.calories} kcal`;
  }

  // Button Listeners
  if (runBtn) {
    runBtn.addEventListener("click", runSimulationCalculation);
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      setScenarioParameters("Moderate", 60);
      checkPresetMatch();
      updateOutcomeDisplay({
        fatigue: baselineState.fatigue,
        fatigueLabel: "Moderate",
        recovery: baselineState.recovery,
        recoveryLabel: "Optimal",
        readiness: baselineState.readiness,
        readinessLabel: "High",
        avgHr: baselineState.avgHr,
        calories: baselineState.calories
      });
      showToast("Reset What-If scenario to baseline conditions", "🔄", 2000);
    });
  }
}
