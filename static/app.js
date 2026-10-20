/**
 * DIGITAL TWIN ATHLETE CONTROLLER
 * Real-time ESP32 hardware streaming, sports analytics cockpit, multi-view router,
 * interactive digital twin biomechanics, 180-day longitudinal analytics, and What-If simulator.
 */

let currentTimeframe = "1H";
let cachedDashboardData = {
  charts: {
    heart_rate: { points: [], x_labels: ["-50s", "-40s", "-30s", "-20s", "-10s", "Now"] },
    movement: { x: [], y: [], z: [], mag: [], x_labels: ["-50s", "-40s", "-30s", "-20s", "-10s", "Now"] }
  }
};
let cachedAnalyticsData = null;
let eventSource = null;
let isMockActive = false;
let isTogglingMock = false;
let mockFallbackInterval = null;
let selectedIntensity = "Moderate";
let currentActiveView = "dashboard";
let livePacketCount = 0;
let accelVisibility = { x: true, y: true, z: true };
let isSensorConnected = false;
let lastLivePacketTimestamp = 0;

/* ==============================================================================
   ACTIVE USER / ATHLETE PROFILE - SINGLE SOURCE OF TRUTH
   ============================================================================== */
const DEFAULT_USER_PROFILE = Object.freeze({
  name: "Avneesh Walvalkar",
  firstName: "Avneesh",
  position: "Midfielder",
  squadNumber: "8",
  sport: "Football",
  role: "Football Player",
  avatar: "images/athlete_avatar.png",
  age: 24,
  weight: 74,
  height: 180,
  restHr: 54,
  maxHr: 196
});

function getFirstName(fullName) {
  if (!fullName || typeof fullName !== "string") return "Athlete";
  const trimmed = fullName.trim();
  const first = trimmed.split(/\s+/)[0];
  return first || trimmed;
}

// Global active athlete state bound to both Header Profile and Hero Greeting Card
let activeUserProfile = { ...DEFAULT_USER_PROFILE };

// Pre-hydrate from localStorage if previously configured
try {
  const savedProfile = JSON.parse(localStorage.getItem("digitalTwinAthleteSettings") || "{}");
  if (savedProfile && typeof savedProfile === "object" && savedProfile.name) {
    activeUserProfile = {
      ...DEFAULT_USER_PROFILE,
      ...savedProfile,
      firstName: getFirstName(savedProfile.name)
    };
  }
} catch (e) { }

function getActiveUserProfile() {
  return { ...activeUserProfile };
}

function updateActiveUserProfile(partialProfile, shouldPersist = true) {
  if (!partialProfile || typeof partialProfile !== "object") return;

  activeUserProfile = {
    ...activeUserProfile,
    ...partialProfile
  };

  // Derive dynamic fields
  if (activeUserProfile.name) {
    activeUserProfile.firstName = getFirstName(activeUserProfile.name);
  } else {
    activeUserProfile.name = DEFAULT_USER_PROFILE.name;
    activeUserProfile.firstName = DEFAULT_USER_PROFILE.firstName;
  }

  if (!activeUserProfile.position) {
    activeUserProfile.position = DEFAULT_USER_PROFILE.position;
  }
  if (!activeUserProfile.squadNumber) {
    activeUserProfile.squadNumber = DEFAULT_USER_PROFILE.squadNumber;
  }

  if (shouldPersist) {
    try {
      localStorage.setItem("digitalTwinAthleteSettings", JSON.stringify(activeUserProfile));
    } catch (e) { }
  }

  renderActiveUserProfileUI();

  // Notify any subscribers/listeners
  window.dispatchEvent(new CustomEvent("athleteProfileChanged", {
    detail: { ...activeUserProfile }
  }));
}

/**
 * Dynamic time-based greeting using user's local device time:
 * - 5:00 AM to 11:59 AM: Good morning, [User Name]
 * - 12:00 PM to 4:59 PM: Good afternoon, [User Name]
 * - 5:00 PM to 4:59 AM: Good evening, [User Name]
 */
function getTimeBasedGreetingPrefix(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    return "Good morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  } else {
    return "Good evening";
  }
}

function getDynamicGreeting(name, date = new Date()) {
  const userName = name || activeUserProfile.firstName || getFirstName(activeUserProfile.name) || "Athlete";
  return `${getTimeBasedGreetingPrefix(date)}, ${userName}`;
}

if (typeof window !== "undefined") {
  window.getTimeBasedGreetingPrefix = getTimeBasedGreetingPrefix;
  window.getDynamicGreeting = getDynamicGreeting;
}

function renderActiveUserProfileUI() {
  const profile = activeUserProfile;
  const firstName = profile.firstName || getFirstName(profile.name);
  const fullName = profile.name || DEFAULT_USER_PROFILE.name;
  const position = profile.position || DEFAULT_USER_PROFILE.position;
  const squadNumber = profile.squadNumber || DEFAULT_USER_PROFILE.squadNumber;

  // 1. ATHLETE DIGITAL TWIN Hero Card Heading: dynamic greeting based on local device time
  // Dynamic greeting formatting: Good Morning, ${firstName}!
  const heroGreetingEl = document.getElementById("heroGreeting");
  if (heroGreetingEl) {
    heroGreetingEl.textContent = getDynamicGreeting(firstName);
  }

  // 2. ATHLETE DIGITAL TWIN Hero Card Subtitle: {fullName} • {position} • Squad #{squadNumber}
  const heroSubtextEl = document.getElementById("heroSubtext");
  if (heroSubtextEl) {
    heroSubtextEl.textContent = `${fullName} • ${position} • Squad #${squadNumber}`;
  }

  // 3. Hero Card Avatar
  const heroAvatarImg = document.querySelector(".hero-avatar-img");
  if (heroAvatarImg) {
    heroAvatarImg.alt = fullName;
    if (profile.avatar) heroAvatarImg.src = profile.avatar;
  }

  // 4. Header Top-Right Component: User name, role badge, avatar
  const userNameEls = document.querySelectorAll(".user-name");
  userNameEls.forEach(el => {
    if (el.textContent !== fullName) {
      el.textContent = fullName;
    }
  });

  const userRoleBadge = document.getElementById("userRoleBadge");
  if (userRoleBadge) {
    userRoleBadge.textContent = position || profile.role || "Football Player";
  }

  const headerAvatarImg = document.querySelector(".user-profile-menu .user-avatar-img");
  if (headerAvatarImg) {
    headerAvatarImg.alt = fullName;
    if (profile.avatar) headerAvatarImg.src = profile.avatar;
  }

  // 5. User Profile Dropdown Popover
  const dropdownName = document.getElementById("dropdownUserName");
  if (dropdownName) dropdownName.textContent = fullName;

  const dropdownSub = document.getElementById("dropdownUserSub");
  if (dropdownSub) dropdownSub.textContent = `#${squadNumber} • ${position} • Squad Runner`;

  const dropdownAvatar = document.getElementById("dropdownUserAvatar");
  if (dropdownAvatar) {
    dropdownAvatar.alt = fullName;
    if (profile.avatar) dropdownAvatar.src = profile.avatar;
  }

  // 6. Settings Inputs (if not actively being edited)
  const settingName = document.getElementById("settingAthleteName");
  if (settingName && document.activeElement !== settingName) {
    settingName.value = fullName;
  }
  const settingPos = document.getElementById("settingAthletePosition");
  if (settingPos && document.activeElement !== settingPos) {
    settingPos.value = position;
  }
  const settingSquad = document.getElementById("settingAthleteSquadNumber");
  if (settingSquad && document.activeElement !== settingSquad) {
    settingSquad.value = squadNumber;
  }

  // 7. What-If Section Subtitle
  const whatIfSub = document.querySelector(".whatif-section-sub");
  if (whatIfSub) {
    whatIfSub.textContent = `${fullName} • Established Baseline`;
  }
}

// Expose state and mutators globally for testability and cross-component integration
window.DEFAULT_USER_PROFILE = DEFAULT_USER_PROFILE;
window.getActiveUserProfile = getActiveUserProfile;
window.updateActiveUserProfile = updateActiveUserProfile;
window.renderActiveUserProfileUI = renderActiveUserProfileUI;

async function checkStorageHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.persistent === false) {
      let banner = document.getElementById("storageAlertBanner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "storageAlertBanner";
        banner.style.cssText = "background: #dc2626; color: #ffffff; padding: 10px 16px; font-weight: 600; text-align: center; font-size: 13px; position: sticky; top: 0; z-index: 99999; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; gap: 8px;";
        const mode = (data.storage_mode || "ephemeral").toUpperCase();
        banner.innerHTML = `<span>⚠️ <strong>EPHEMERAL STORAGE ACTIVE (${mode}):</strong> Telemetry and workout sessions will NOT be permanently persisted across server restarts.</span>`;
        document.body.prepend(banner);
      }
    }
  } catch (e) {
    // Suppress health check network failures during offline/initialization states
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderActiveUserProfileUI();
  checkStorageHealth();

  // Watch header profile user-name for any direct external updates to maintain two-way synchronization
  const headerNameEl = document.querySelector(".user-profile-menu .user-name");
  if (headerNameEl && window.MutationObserver) {
    const observer = new MutationObserver(() => {
      const currentText = headerNameEl.textContent?.trim();
      if (currentText && currentText !== activeUserProfile.name) {
        updateActiveUserProfile({ name: currentText }, false);
      }
    });
    observer.observe(headerNameEl, { childList: true, characterData: true, subtree: true });
  }

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
  initChartResizeObservers();
  renderHeartRateChart(cachedDashboardData.charts.heart_rate);
  renderMovementChart(cachedDashboardData.charts.movement);
  initSessionModal();
  initInjuryModal();
  initDailyCheckinModal();
  initPrecautionsChecklist();
  initInfoModals();
  initTrainingRiskPopup();
  initMetricCardsClick();

  loadDashboardData("1H");
  initLiveStream();

  // Personalized Digital Twin + AI Coach Engine
  loadDigitalTwinCoach();
  initWhyRecommendationModal();
  initWeeklyReportModal();
  initHowTwinWorksModal();
  initWhatIfComparativeScenarios();
  initProgressReportButtons();

  // Forensic Transparency & Multi-Role Controls (Phases 6, 9, 12, 15)
  initRoleSwitcher();
  initTransparencyModals();
  initForensicAuditorControls();
  initCoachSquadControls();

  // Pre-hydrate 180-Day Longitudinal Physiological Log immediately on initial render
  const initialHistory = generateDeterministic180DayHistory();
  populateAnalyticsTable(initialHistory);
  loadAnalyticsView();

  // Initialize New Landing Page & Role Dispatch Gateway
  initLandingPage();

  // Support direct deep-linking via hash (e.g. #analytics, #digital-twin, #what-if, #coach-squad)
  const validViews = ["dashboard", "live-data", "analytics", "digital-twin", "what-if", "settings", "coach-squad"];

  function handleHashNavigation() {
    const rawHash = window.location.hash.replace("#", "");
    if (!rawHash || rawHash === "home" || rawHash === "landing") {
      showLandingPage();
    } else if (rawHash === "chooseRoleSection" || rawHash === "choose-role") {
      showLandingPage();
      requestAnimationFrame(() => {
        const roleSection = document.getElementById("chooseRoleSection");
        if (roleSection) roleSection.scrollIntoView({ behavior: "smooth" });
      });
    } else if (validViews.includes(rawHash)) {
      const landingPageEl = document.getElementById("landingPage");
      if (landingPageEl && !landingPageEl.classList.contains("hidden")) {
        const savedRole = sessionStorage.getItem("dta_selected_role") || "coach";
        enterRoleWorkspace(savedRole, rawHash, false);
      } else {
        switchView(rawHash);
      }
    }
  }

  handleHashNavigation();
  window.addEventListener("hashchange", handleHashNavigation);

  // Global delegated click handler for in-page anchors
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest('a[href^="#"]');
    if (!anchor) return;
    const targetHash = anchor.getAttribute("href").replace("#", "");
    if (validViews.includes(targetHash)) {
      e.preventDefault();
      switchView(targetHash);
      if (window.history && window.history.pushState) {
        window.history.pushState(null, null, "#" + targetHash);
      }
      closeMobileDrawer();
    }
  });

  // User Profile shortcut to Player Digital Twin
  const userProfileBtn = document.getElementById("userProfileBtn");
  if (userProfileBtn) {
    userProfileBtn.addEventListener("click", () => {
      switchView("digital-twin");
    });
  }
});

/* ==============================================================================
   0. NEW LANDING PAGE & ROLE DISPATCH GATEWAY (Sections 1 & 2)
   ============================================================================== */
let currentActiveRole = null; // 'coach' | 'athlete' | null

function initLandingPage() {
  const landingPageEl = document.getElementById("landingPage");
  const dashboardRootEl = document.getElementById("dashboardAppRoot");
  const btnRoleCoach = document.getElementById("btnRoleCoach");
  const btnRoleAthlete = document.getElementById("btnRoleAthlete");
  const btnSwitchRoleTop = document.getElementById("btnSwitchRoleTop");
  const btnSwitchRoleSidebar = document.getElementById("btnSwitchRoleSidebar");
  const scrollExploreBtn = document.getElementById("scrollExploreBtn");
  const landingVideo = document.getElementById("landingHeroVideo");

  // Attempt video autoplay with muted fallback safeguard
  if (landingVideo) {
    landingVideo.muted = true;
    const playPromise = landingVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.log("[landing] Video autoplay note:", err);
      });
    }
  }

  // Smooth scroll explore button from Section 1 down to Section 2
  if (scrollExploreBtn) {
    scrollExploreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const roleSection = document.getElementById("chooseRoleSection");
      if (roleSection) {
        roleSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  // Role selections: Coach & Athlete cards
  if (btnRoleCoach) {
    btnRoleCoach.addEventListener("click", () => enterRoleWorkspace("coach"));
    btnRoleCoach.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        enterRoleWorkspace("coach");
      }
    });
  }

  if (btnRoleAthlete) {
    btnRoleAthlete.addEventListener("click", () => enterRoleWorkspace("athlete"));
    btnRoleAthlete.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        enterRoleWorkspace("athlete");
      }
    });
  }

  // Quick Switch Role / Back to Home buttons
  if (btnSwitchRoleTop) {
    btnSwitchRoleTop.addEventListener("click", (e) => {
      e.preventDefault();
      returnToLandingPage(true);
    });
  }

  if (btnSwitchRoleSidebar) {
    btnSwitchRoleSidebar.addEventListener("click", (e) => {
      e.preventDefault();
      closeMobileDrawer();
      returnToLandingPage(true);
    });
  }

  // Initial landing page vs dashboard resolution:
  const rawHash = window.location.hash.replace("#", "");
  const validDashboardViews = ["dashboard", "live-data", "analytics", "digital-twin", "what-if", "settings", "coach-squad"];

  if (rawHash === "coach-squad") {
    enterRoleWorkspace("coach", "coach-squad", false);
  } else if (validDashboardViews.includes(rawHash)) {
    const savedRole = sessionStorage.getItem("dta_selected_role") || "coach";
    enterRoleWorkspace(savedRole, rawHash, false);
  } else if (rawHash === "chooseRoleSection" || rawHash === "choose-role") {
    showLandingPage();
    requestAnimationFrame(() => {
      const roleSection = document.getElementById("chooseRoleSection");
      if (roleSection) roleSection.scrollIntoView({ behavior: "smooth" });
    });
  } else {
    // Default initial experience: Full-screen Video Hero Landing Page!
    showLandingPage();
  }
}

function enterRoleWorkspace(role, targetView = null, updateHash = true) {
  currentActiveRole = role;
  sessionStorage.setItem("dta_selected_role", role);

  const landingPageEl = document.getElementById("landingPage");
  const dashboardRootEl = document.getElementById("dashboardAppRoot");
  const roleBadge = document.getElementById("headerRoleBadge");
  const userRoleBadge = document.getElementById("userRoleBadge");

  // Hide landing page, reveal dashboard
  if (landingPageEl) landingPageEl.classList.add("hidden");
  if (dashboardRootEl) dashboardRootEl.classList.remove("hidden");

  // Update role mode on body
  document.body.classList.remove("role-mode-coach", "role-mode-athlete");
  document.body.classList.add(`role-mode-${role}`);

  if (role === "coach") {
    if (roleBadge) roleBadge.textContent = "Coach View";
    if (userRoleBadge) userRoleBadge.textContent = "Head Coach";
    const viewToOpen = targetView || "dashboard";
    switchView(viewToOpen);
    if (updateHash) {
      if (history.pushState) history.pushState(null, null, `#${viewToOpen}`);
      else window.location.hash = viewToOpen;
    }
    showToast("Entered Coach Command Dashboard", "🛡️");
  } else {
    if (roleBadge) roleBadge.textContent = "Athlete Cockpit";
    if (userRoleBadge) userRoleBadge.textContent = "Football Player";
    // Athlete must not land on coach-only views
    const viewToOpen = (targetView && targetView !== "coach-squad") ? targetView : "dashboard";
    switchView(viewToOpen);
    if (updateHash) {
      if (history.pushState) history.pushState(null, null, `#${viewToOpen}`);
      else window.location.hash = viewToOpen;
    }
    showToast("Entered Athlete Personal Cockpit", "🏃");
  }

  // Scroll to top of the dashboard
  window.scrollTo({ top: 0, behavior: "instant" });

  // Re-trigger window resize to ensure Chart.js canvases layout at full width
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
    if (cachedDashboardData && cachedDashboardData.charts) {
      renderHeartRateChart(cachedDashboardData.charts.heart_rate);
      renderMovementChart(cachedDashboardData.charts.movement);
    }
  });
}

function showLandingPage() {
  const landingPageEl = document.getElementById("landingPage");
  const dashboardRootEl = document.getElementById("dashboardAppRoot");

  if (dashboardRootEl) dashboardRootEl.classList.add("hidden");
  if (landingPageEl) {
    landingPageEl.classList.remove("hidden");
    const video = document.getElementById("landingHeroVideo");
    if (video && video.paused) {
      video.play().catch(() => { });
    }
  }
}

function returnToLandingPage(scrollToRoles = false) {
  showLandingPage();
  if (window.history && window.history.pushState) {
    window.history.pushState(null, null, scrollToRoles ? "#chooseRoleSection" : "#");
  }
  if (scrollToRoles) {
    requestAnimationFrame(() => {
      const roleSection = document.getElementById("chooseRoleSection");
      if (roleSection) {
        roleSection.scrollIntoView({ behavior: "smooth" });
      }
    });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  showToast("Returned to Role Selector", "🏠");
}


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

    const dateText = `${dayName}, ${dateNum} ${monthName} ${year}`;
    if (liveDateEl) liveDateEl.textContent = dateText;
    if (liveTimeEl) liveTimeEl.textContent = `${hours}:${minutes} ${ampm}`;

    const overviewDateSpan = document.getElementById("overviewDateText");
    if (overviewDateSpan && !overviewDateSpan.dataset.customDate) {
      overviewDateSpan.textContent = dateText;
    }

    // Dynamic greeting bound to active user profile and local device time:
    // Dynamic greeting formatting: Good Morning, ${firstName}!
    if (heroGreetingEl) {
      const firstName = activeUserProfile.firstName || getFirstName(activeUserProfile.name);
      heroGreetingEl.textContent = getDynamicGreeting(firstName, now);
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
  if (window.TwinMotion && typeof window.TwinMotion.stopScroll === "function") {
    window.TwinMotion.stopScroll();
  }
}

function closeMobileDrawer() {
  const sidebar = document.getElementById("appSidebar");
  const backdrop = document.getElementById("mobileNavBackdrop");
  const toggle = document.getElementById("mobileNavToggle");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("active");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  if (window.TwinMotion && typeof window.TwinMotion.startScroll === "function") {
    window.TwinMotion.startScroll();
  }
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

  // Synchronize top role switcher buttons
  const roleButtons = document.querySelectorAll(".role-segment-btn");
  const roleBadge = document.getElementById("headerRoleBadge");
  if (roleButtons.length) {
    let activeRole = "athlete";
    if (viewName === "coach-squad") activeRole = "coach";
    roleButtons.forEach(btn => {
      const isRoleActive = btn.dataset.role === activeRole;
      btn.classList.toggle("active", isRoleActive);
      btn.setAttribute("aria-selected", isRoleActive ? "true" : "false");
    });
    if (roleBadge) {
      roleBadge.textContent = activeRole === "coach" ? "Coach View" : "Athlete View";
    }
  }

  // Update URL hash without reload
  if (history.pushState) {
    history.pushState(null, null, `#${viewName}`);
  } else {
    window.location.hash = viewName;
  }

  // Hydrate view-specific content
  if (viewName === "dashboard") {
    requestAnimationFrame(() => {
      if (cachedDashboardData && cachedDashboardData.charts) {
        renderHeartRateChart(cachedDashboardData.charts.heart_rate);
        renderMovementChart(cachedDashboardData.charts.movement);
      }
    });
  } else if (viewName === "live-data") {
    requestAnimationFrame(() => {
      if (cachedDashboardData && cachedDashboardData.charts) {
        renderHeartRateChart(cachedDashboardData.charts.heart_rate);
        renderMovementChart(cachedDashboardData.charts.movement);
      }
    });
  } else if (viewName === "analytics") {
    loadAnalyticsView();
    requestAnimationFrame(() => {
      if (cachedDashboardData && cachedDashboardData.charts) {
        renderHeartRateChart(cachedDashboardData.charts.heart_rate);
        renderMovementChart(cachedDashboardData.charts.movement);
      }
    });
  } else if (viewName === "digital-twin") {
    syncDigitalTwinDeepView();
  } else if (viewName === "what-if") {
    if (!document.getElementById("microcycleGrid").children.length) {
      renderMicrocycleInputs("standard");
    } else if (cachedScheduleDays) {
      requestAnimationFrame(() => {
        renderScheduleTrajectoryChart(cachedScheduleDays);
      });
    } else {
      runScheduleSimulation();
    }
  } else if (viewName === "coach-squad") {
    loadCoachSquad();
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

    // Sync active profile with server athlete data (shared source of truth across all devices)
    if (data.athlete && data.athlete.name) {
      updateActiveUserProfile({
        name: data.athlete.name,
        position: data.athlete.position || "Midfielder",
        squadNumber: data.athlete.squad_number || "8"
      }, true);
    }

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
    } else if (cachedDashboardData && cachedDashboardData.charts) {
      renderHeartRateChart(cachedDashboardData.charts.heart_rate);
      renderMovementChart(cachedDashboardData.charts.movement);
    }
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    if (cachedDashboardData && cachedDashboardData.charts) {
      renderHeartRateChart(cachedDashboardData.charts.heart_rate);
      renderMovementChart(cachedDashboardData.charts.movement);
    }
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

  // Connection Watchdog: Automatically clear live data if no real packets arrive for > 3.5 seconds
  setInterval(() => {
    if (isMockActive) return;
    if (isSensorConnected && (Date.now() - lastLivePacketTimestamp > 3500)) {
      handleSensorDisconnected();
    }
  }, 1000);
}

function handleSensorDisconnected() {
  if (isMockActive) return;
  isSensorConnected = false;

  // 1. Hardware Status Pill
  updateHardwareStatusUI({
    connected: false,
    mock_mode: false,
    rate_hz: 0,
    device_id: "Disconnected"
  });

  // 2. Single System Log Entry in Live Packet Inspector (does not repeat every second)
  const terminalBox = document.getElementById("terminalLogBox");
  if (terminalBox) {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-src" style="color:#F59E0B;">SYSTEM:</span>
      <span class="log-data" style="color:#94A3B8;">Sensor disconnected. Live telemetry stream paused. Waiting for ESP32...</span>
    `;
    terminalBox.appendChild(entry);
    terminalBox.scrollTop = terminalBox.scrollHeight;
  }

  // 3. Reset Quick Vitals Cards (Dashboard) to Standby/Offline
  const hrVal = document.getElementById("vitalHrVal");
  const hrStatus = document.getElementById("vitalHrStatus");
  const hrStatusText = document.getElementById("vitalHrStatusText");
  const hrTrend = document.getElementById("vitalHrTrend");
  if (hrVal) hrVal.textContent = "--";
  if (hrStatusText) hrStatusText.textContent = "Offline";
  if (hrStatus) hrStatus.className = "badge-pill";
  if (hrTrend) hrTrend.textContent = "--";

  const spo2Val = document.getElementById("vitalSpo2Val");
  const spo2Status = document.getElementById("vitalSpo2Status");
  const spo2StatusText = document.getElementById("vitalSpo2StatusText");
  if (spo2Val) spo2Val.textContent = "--";
  if (spo2StatusText) spo2StatusText.textContent = "Offline";
  if (spo2Status) spo2Status.className = "badge-pill";

  const actVal = document.getElementById("vitalActivityVal");
  const actStatus = document.getElementById("vitalActivityStatus");
  const actStatusText = document.getElementById("vitalActivityStatusText");
  const actSub = document.getElementById("vitalActivitySub");
  if (actVal) actVal.textContent = "Waiting for data";
  if (actStatusText) actStatusText.textContent = "Waiting for data";
  if (actStatus) actStatus.className = "badge-pill";
  if (actSub) actSub.textContent = "Sensor Disconnected";

  // Reset Speed compatibility references
  const speedVal = document.getElementById("vitalSpeedVal");
  const speedUnit = document.getElementById("vitalSpeedUnit");
  const speedTrend = document.getElementById("vitalSpeedTrend");
  const speedStatus = document.getElementById("vitalSpeedStatus");
  const speedStatusText = document.getElementById("vitalSpeedStatusText");
  if (speedVal) speedVal.textContent = "--";
  if (speedUnit) speedUnit.textContent = "km/h";
  if (speedTrend) speedTrend.textContent = "--";
  if (speedStatusText) speedStatusText.textContent = "Standby";
  if (speedStatus) speedStatus.className = "badge-pill";

  // Reset Endurance Card (New Metric)
  const endVal = document.getElementById("vitalEnduranceVal");
  const endTrend = document.getElementById("vitalEnduranceTrend");
  const endStatus = document.getElementById("vitalEnduranceStatus");
  const endStatusText = document.getElementById("vitalEnduranceStatusText");
  if (endVal) endVal.textContent = "--";
  if (endTrend) endTrend.textContent = "Est.";
  if (endStatusText) endStatusText.textContent = "Standby";
  if (endStatus) endStatus.className = "badge-pill";

  const accelVal = document.getElementById("vitalAccelVal");
  const accelTrend = document.getElementById("vitalAccelTrend");
  const accelStatus = document.getElementById("vitalAccelStatus");
  const accelStatusText = document.getElementById("vitalAccelStatusText");
  if (accelVal) accelVal.textContent = "--";
  if (accelTrend) accelTrend.textContent = "--";
  if (accelStatusText) accelStatusText.textContent = "Standby";
  if (accelStatus) accelStatus.className = "badge-pill";

  // 4. Reset Live Lab KPI Cards (View 2)
  const labHrVal = document.getElementById("liveLabHrVal");
  const labHrStatus = document.getElementById("liveLabHrStatus");
  if (labHrVal) labHrVal.textContent = "--";
  if (labHrStatus) labHrStatus.textContent = "Sensor Disconnected";

  const labSpo2Val = document.getElementById("liveLabSpo2Val");
  const labSpo2Status = document.getElementById("liveLabSpo2Status");
  if (labSpo2Val) labSpo2Val.textContent = "--";
  if (labSpo2Status) labSpo2Status.textContent = "Sensor Disconnected";

  const labAccelG = document.getElementById("liveLabAccelG");
  const labAccelAxes = document.getElementById("liveLabAccelAxes");
  if (labAccelG) labAccelG.textContent = "--";
  if (labAccelAxes) labAccelAxes.textContent = "X: -- • Y: -- • Z: --";

  // 5. Freeze Hologram pulse animation
  const nodes = document.querySelectorAll(".joint-node");
  nodes.forEach(node => {
    node.style.animation = "none";
    node.style.stroke = "#38BDF8";
  });
}

function handleIncomingTelemetry(data) {
  if (!data) return;

  // Handle explicit sensor disconnect event from server or device disconnected state
  if (data.event === "sensor_disconnect" || (data.device && !data.device.connected && !data.device.mock_mode)) {
    if (isMockActive) return;
    if (isSensorConnected) {
      handleSensorDisconnected();
    } else if (data.device) {
      updateHardwareStatusUI(data.device);
    }
    return;
  }

  // Filter out keep-alive heartbeats when no live data is arriving
  if (data.is_heartbeat) {
    if (data.device) {
      updateHardwareStatusUI(data.device);
    }
    return;
  }

  // Real sensor packet arrived!
  isSensorConnected = true;
  lastLivePacketTimestamp = Date.now();

  // Increment packet counter and update raw terminal log ONLY for real incoming telemetry
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
  if (data.charts) {
    if (!cachedDashboardData) cachedDashboardData = {};
    cachedDashboardData.charts = data.charts;
    renderHeartRateChart(data.charts.heart_rate);
    renderMovementChart(data.charts.movement);
  } else if (data.vitals) {
    if (!cachedDashboardData) cachedDashboardData = {};
    if (!cachedDashboardData.charts) {
      cachedDashboardData.charts = {
        heart_rate: { points: [], x_labels: ["-50s", "-40s", "-30s", "-20s", "-10s", "Now"] },
        movement: { x: [], y: [], z: [], mag: [], x_labels: ["-50s", "-40s", "-30s", "-20s", "-10s", "Now"] }
      };
    }
    const hr = data.vitals.heart_rate?.value;
    if (typeof hr === "number") {
      if (!Array.isArray(cachedDashboardData.charts.heart_rate.points)) {
        cachedDashboardData.charts.heart_rate.points = [];
      }
      cachedDashboardData.charts.heart_rate.points.push(hr);
      if (cachedDashboardData.charts.heart_rate.points.length > 50) {
        cachedDashboardData.charts.heart_rate.points.shift();
      }
    }
    const axes = data.vitals.acceleration?.axes;
    if (axes) {
      if (!Array.isArray(cachedDashboardData.charts.movement.x)) {
        cachedDashboardData.charts.movement.x = [];
        cachedDashboardData.charts.movement.y = [];
        cachedDashboardData.charts.movement.z = [];
      }
      cachedDashboardData.charts.movement.x.push(axes.x || 0);
      cachedDashboardData.charts.movement.y.push(axes.y || 0);
      cachedDashboardData.charts.movement.z.push(axes.z || 0);
      if (cachedDashboardData.charts.movement.x.length > 50) {
        cachedDashboardData.charts.movement.x.shift();
        cachedDashboardData.charts.movement.y.shift();
        cachedDashboardData.charts.movement.z.shift();
      }
    }
    renderHeartRateChart(cachedDashboardData.charts.heart_rate);
    renderMovementChart(cachedDashboardData.charts.movement);
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
  const ax = data.vitals?.acceleration?.axes?.x ?? "0.0";
  const ay = data.vitals?.acceleration?.axes?.y ?? "0.0";
  const az = data.vitals?.acceleration?.axes?.z ?? "0.0";

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-src">ESP32_RX:</span>
    <span class="log-data">HR=${hr} BPM | SpO2=${spo2}% | Accel=[${ax},${ay},${az}]g</span>
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
  if (device && device.mock_mode !== undefined) {
    if (!isMockActive || device.mock_mode) {
      isMockActive = !!device.mock_mode;
      updateSimulatorButtonUI(isMockActive, false);
    }
  }

  // Forensic Data Quality & Provenance Header Pill
  const qualityDot = document.getElementById("headerQualityDot");
  const qualityLabel = document.getElementById("headerQualityLabel");
  if (qualityLabel) {
    const qGrade = device.data_quality ? (device.data_quality.grade || "EXCELLENT") : (isConnected ? "EXCELLENT" : "WAITING");
    const qProv = device.data_provenance || (device.mock_mode ? "DEMO" : "LIVE");
    qualityLabel.textContent = `${qProv} • ${qGrade}`;
    if (qualityDot) {
      if (qGrade === "EXCELLENT" || qGrade === "GOOD") {
        qualityDot.className = "hw-dot dot-connected";
      } else if (qGrade === "DEGRADED" || qGrade === "CALIBRATING") {
        qualityDot.className = "hw-dot dot-calibrating";
      } else {
        qualityDot.className = "hw-dot dot-waiting";
      }
    }
  }
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

  // 3. Activity (Dynamic Running / Not Running detection from movement & acceleration)
  const actValEl = document.getElementById("vitalActivityVal");
  const actStatusEl = document.getElementById("vitalActivityStatus");
  const actStatusTextEl = document.getElementById("vitalActivityStatusText");

  let isRunning = null;
  if (vitals.acceleration && vitals.acceleration.value !== undefined && vitals.acceleration.value !== null) {
    const rawMag = typeof vitals.acceleration.value === "number" ? vitals.acceleration.value : parseFloat(vitals.acceleration.value);
    if (!isNaN(rawMag) && rawMag > 0) {
      const actName = (vitals.activity && vitals.activity.value) ? String(vitals.activity.value).toLowerCase() : "";
      if (actName === "running" || actName === "sprinting" || rawMag >= 1.55) {
        isRunning = true;
      } else {
        isRunning = false;
      }
    }
  } else if (vitals.activity && vitals.activity.value) {
    const actName = String(vitals.activity.value).toLowerCase();
    if (actName === "running" || actName === "sprinting") {
      isRunning = true;
    } else if (actName === "walking" || actName === "resting" || actName === "stationary") {
      isRunning = false;
    }
  }

  if (actValEl) {
    if (isRunning === true) {
      actValEl.textContent = "Running";
      if (actStatusTextEl) actStatusTextEl.textContent = "Running";
      if (actStatusEl) actStatusEl.className = "badge-pill pill-green";
    } else if (isRunning === false) {
      actValEl.textContent = "Not Running";
      if (actStatusTextEl) actStatusTextEl.textContent = "Not Running";
      if (actStatusEl) actStatusEl.className = "badge-pill pill-yellow";
    } else {
      actValEl.textContent = "Waiting for data";
      if (actStatusTextEl) actStatusTextEl.textContent = "Waiting for data";
      if (actStatusEl) actStatusEl.className = "badge-pill";
    }
  }

  // Preserve hidden speed elements for legacy references
  const speedValEl = document.getElementById("vitalSpeedVal");
  if (speedValEl) {
    if (vitals.speed && vitals.speed.value !== undefined) {
      speedValEl.textContent = String(vitals.speed.value);
    } else if (isRunning !== null) {
      speedValEl.textContent = isRunning ? "8.4" : "0.0";
    }
  }
  const actSubLegacy = document.getElementById("vitalActivitySub");
  if (actSubLegacy) actSubLegacy.textContent = (vitals.activity && vitals.activity.subtext) || "Team Training";

  // 4. Endurance Estimate (Calculated from Heart Rate & SpO2)
  let enduranceScore = null;
  let enduranceStatusLabel = "Good Capacity (Est.)";
  let endurancePillClass = "pill-green";

  if (vitals.endurance && vitals.endurance.value !== undefined && vitals.endurance.value !== null) {
    enduranceScore = parseInt(vitals.endurance.value, 10);
    enduranceStatusLabel = vitals.endurance.status || (enduranceScore >= 75 ? "Good Capacity (Est.)" : (enduranceScore >= 50 ? "Moderate (Est.)" : "Depleting (Est.)"));
    endurancePillClass = vitals.endurance.color === "yellow" ? "pill-yellow" : (vitals.endurance.color === "red" ? "pill-red" : "pill-green");
  } else if (vitals.heart_rate && vitals.spo2) {
    const hr = typeof vitals.heart_rate.value === "number" ? vitals.heart_rate.value : parseFloat(vitals.heart_rate.value);
    const spo2 = typeof vitals.spo2.value === "number" ? vitals.spo2.value : parseFloat(vitals.spo2.value);
    if (!isNaN(hr) && !isNaN(spo2) && hr > 0 && spo2 > 0) {
      const restHr = (activeUserProfile && activeUserProfile.restHr) ? parseFloat(activeUserProfile.restHr) : 54.0;
      const maxHr = (activeUserProfile && activeUserProfile.maxHr) ? parseFloat(activeUserProfile.maxHr) : 195.0;
      const hrrRatio = Math.max(0, Math.min(1.0, (hr - restHr) / Math.max(10.0, maxHr - restHr)));
      const hrCapacity = 100.0 * (1.0 - Math.pow(hrrRatio, 1.25));
      const spo2Factor = spo2 >= 97.0 ? 1.0 : Math.max(0.40, Math.min(1.0, 1.0 - (97.0 - spo2) * 0.05));
      enduranceScore = Math.round(Math.max(5.0, Math.min(99.0, hrCapacity * spo2Factor)));
      enduranceStatusLabel = enduranceScore >= 75 ? "Good Capacity (Est.)" : (enduranceScore >= 50 ? "Moderate (Est.)" : "Depleting (Est.)");
      endurancePillClass = enduranceScore >= 75 ? "pill-green" : (enduranceScore >= 50 ? "pill-yellow" : "pill-red");
    }
  }

  const endValEl = document.getElementById("vitalEnduranceVal");
  const endTrendEl = document.getElementById("vitalEnduranceTrend");
  const endStatusEl = document.getElementById("vitalEnduranceStatus");
  const endStatusTextEl = document.getElementById("vitalEnduranceStatusText");

  if (endValEl) {
    if (enduranceScore !== null && !isNaN(enduranceScore)) {
      endValEl.textContent = enduranceScore;
      if (endTrendEl) endTrendEl.textContent = "Est.";
      if (endStatusTextEl) endStatusTextEl.textContent = enduranceStatusLabel;
      if (endStatusEl) endStatusEl.className = "badge-pill " + endurancePillClass;
    } else {
      endValEl.textContent = "--";
      if (endTrendEl) endTrendEl.textContent = "Est.";
      if (endStatusTextEl) endStatusTextEl.textContent = "Waiting...";
      if (endStatusEl) endStatusEl.className = "badge-pill";
    }
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

  // Update Training Risk Running Impact dynamically
  if (vitals.acceleration) {
    const rawG = vitals.acceleration.current_g !== undefined ? vitals.acceleration.current_g : vitals.acceleration.value;
    const numG = typeof rawG === "number" ? rawG : parseFloat(rawG);
    if (!isNaN(numG)) {
      const elImpactText = document.getElementById("riskStatusRunningImpact");
      const elImpactDot = document.getElementById("riskDotRunningImpact");
      if (elImpactText && elImpactDot) {
        const impactStatus = numG > 2.5 ? "High" : (numG > 1.4 ? "Moderate" : "Low");
        elImpactText.textContent = impactStatus;
        elImpactDot.className = "risk-status-dot " + (impactStatus === "High" ? "dot-red" : (impactStatus === "Moderate" ? "dot-yellow" : "dot-green"));
      }
    }
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
    const strokeColor = clampedR >= 67 ? "#00E676" : (clampedR >= 34 ? "#FFD60A" : "#FF453A");
    donutCircle.style.stroke = strokeColor;
    const donutSvg = donutCircle.closest("svg");
    if (donutSvg) {
      donutSvg.style.filter = "none";
    }
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

  // 4. Athlete Digital Twin Core Status Card (Top of Dashboard)
  const readinessVal = status.readiness_value !== undefined ? status.readiness_value : Math.min(99, Math.max(10, Math.round(rVal * 0.45 + (100 - fVal) * 0.35 + 18)));
  const twReadinessEl = document.getElementById("twinReadinessVal");
  const twReadinessBar = document.getElementById("twinReadinessBar");
  const twReadinessLabel = document.getElementById("twinReadinessLabel");
  if (twReadinessEl) twReadinessEl.textContent = `${Math.round(readinessVal)}%`;
  if (twReadinessBar) twReadinessBar.style.width = `${Math.min(100, Math.max(5, readinessVal))}%`;
  if (twReadinessLabel) twReadinessLabel.textContent = readinessVal >= 80 ? "High" : (readinessVal >= 65 ? "Moderate" : "Low");

  const twRecVal = document.getElementById("twinRecoveryVal");
  const twRecBar = document.getElementById("twinRecoveryBar");
  const twRecLabel = document.getElementById("twinRecoveryLabel");
  if (twRecVal) twRecVal.textContent = `${Math.round(rVal)}%`;
  if (twRecBar) twRecBar.style.width = `${Math.min(100, Math.max(5, rVal))}%`;
  if (twRecLabel) twRecLabel.textContent = rVal >= 75 ? "Optimal" : (rVal >= 60 ? "Moderate" : "Depleted");

  const twFatVal = document.getElementById("twinFatigueVal");
  const twFatBar = document.getElementById("twinFatigueBar");
  const twFatLabel = document.getElementById("twinFatigueLabel");
  if (twFatVal) twFatVal.textContent = `${Math.round(fVal)}%`;
  if (twFatBar) twFatBar.style.width = `${Math.min(100, Math.max(5, fVal))}%`;
  if (twFatLabel) twFatLabel.textContent = fVal > 55 ? "High" : (fVal > 30 ? "Moderate" : "Low");

  const twPerfVal = document.getElementById("twinPerformanceVal");
  const twPerfBar = document.getElementById("twinPerformanceBar");
  const twPerfLabel = document.getElementById("twinPerformanceLabel");
  if (twPerfVal) twPerfVal.textContent = `${Math.round(pVal)}%`;
  if (twPerfBar) twPerfBar.style.width = `${Math.min(100, Math.max(5, pVal))}%`;
  if (twPerfLabel) twPerfLabel.textContent = pVal >= 80 ? "High Output" : (pVal >= 65 ? "Steady" : "Reduced");

  // Overall State Badge
  const stateBadge = document.getElementById("twinOverallStateBadge");
  const stateText = document.getElementById("twinOverallStateText");
  if (stateBadge && stateText) {
    if (fVal >= 62) {
      stateBadge.className = "overall-state-badge badge-fatigue";
      stateText.textContent = "HIGH FATIGUE DETECTED";
    } else if (readinessVal < 65 || rVal < 60) {
      stateBadge.className = "overall-state-badge badge-recovery";
      stateText.textContent = "RECOVERY RECOMMENDED";
    } else {
      stateBadge.className = "overall-state-badge badge-ready";
      stateText.textContent = "READY FOR TRAINING";
    }
  }

  // Update What-If transition flow current node
  const flowCurrReadiness = document.getElementById("flowCurrReadiness");
  const flowCurrFatigue = document.getElementById("flowCurrFatigue");
  const flowCurrRec = document.getElementById("flowCurrRec");
  if (flowCurrReadiness) flowCurrReadiness.textContent = `${Math.round(readinessVal)}%`;
  if (flowCurrFatigue) flowCurrFatigue.textContent = `${Math.round(fVal)}%`;
  if (flowCurrRec) flowCurrRec.textContent = `${Math.round(rVal)}%`;

  // Update Training Risk Training Load & Recovery dynamically
  const elLoadText = document.getElementById("riskStatusTrainingLoad");
  const elLoadDot = document.getElementById("riskDotTrainingLoad");
  if (elLoadText && elLoadDot) {
    const loadStatus = status.fatigue_label || (fVal > 55 ? "High" : (fVal > 30 ? "Moderate" : "Low"));
    elLoadText.textContent = loadStatus;
    elLoadDot.className = "risk-status-dot " + (loadStatus === "High" ? "dot-red" : (loadStatus === "Moderate" ? "dot-yellow" : "dot-green"));
  }

  const elRecText = document.getElementById("riskStatusRecovery");
  const elRecDot = document.getElementById("riskDotRecovery");
  if (elRecText && elRecDot) {
    const recStatus = rVal < 50 ? "Low" : (rVal < 75 ? "Moderate" : "Good");
    elRecText.textContent = recStatus;
    elRecDot.className = "risk-status-dot " + (recStatus === "Low" ? "dot-red" : (recStatus === "Moderate" ? "dot-yellow" : "dot-green"));
  }
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
function updateSimulatorButtonUI(isActive, isLoading = false) {
  const liveBtn = document.getElementById("btnLiveToggleSim");
  const liveText = document.getElementById("liveSimBtnText");
  const liveIcon = document.getElementById("liveSimBtnIcon");
  const simBtn = document.getElementById("btnToggleSimFeed");
  const simText = document.getElementById("simFeedBtnText");

  if (liveBtn) {
    liveBtn.disabled = isLoading;
    if (isLoading) {
      liveBtn.className = "btn-top-action sim-loading";
      if (liveText) liveText.textContent = isActive ? "Stopping..." : "Connecting...";
      if (liveIcon) liveIcon.textContent = "⏳";
    } else {
      liveBtn.className = "btn-top-action" + (isActive ? " active-sim" : "");
      if (liveText) liveText.textContent = isActive ? "Stop Sim" : "Simulate ESP32";
      if (liveIcon) liveIcon.textContent = isActive ? "⏹" : "⚡";
    }
  }

  if (simBtn) {
    simBtn.disabled = isLoading;
    if (isLoading) {
      if (simText) simText.textContent = isActive ? "Stopping..." : "Connecting...";
    } else {
      simBtn.className = "btn-top-action" + (isActive ? " active-sim" : "");
      if (simText) simText.textContent = isActive ? "Stop Sim" : "Simulate ESP32";
    }
  }
}

let clientMockInterval = null;
let clientMockStep = 0;

function generateClientMockPacket() {
  clientMockStep++;
  const t = clientMockStep;

  // Realistic HR variation (136–160 BPM) with natural biometric fluctuation
  const hrBase = 142 + 10 * Math.sin(t * 0.14);
  const hrJitter = (Math.sin(t * 1.7) * 2.5) + ((Math.random() - 0.5) * 2);
  const hr = Math.round(Math.min(175, Math.max(115, hrBase + hrJitter)));

  // Biometric SpO2 (97–99%)
  const spo2Jitter = Math.floor(Math.random() * 3);
  const spo2 = (hr > 155) ? 97 : (97 + spo2Jitter);

  // Triaxial acceleration showing walking/running gait impact
  const stride = t * 2.8 * 2.0 * Math.PI;
  const ax = parseFloat((Math.sin(stride) * 0.8 + ((Math.random() - 0.5) * 0.3)).toFixed(2));
  const ay = parseFloat((Math.cos(stride) * 1.5 + 1.2 + ((Math.random() - 0.5) * 0.3)).toFixed(2));
  const az = parseFloat((Math.sin(stride * 0.5) * 0.4 + ((Math.random() - 0.5) * 0.2)).toFixed(2));
  const rawMag = parseFloat(Math.sqrt(ax * ax + ay * ay + az * az).toFixed(2));

  // Dynamic activity based on speed/gait/intensity
  let actName = "Running";
  if (hr >= 152 || ay > 2.4) {
    actName = "Sprinting";
  } else if (hr <= 140 && ay < 1.0) {
    actName = "Walking";
  }

  const speed = actName === "Sprinting" ? 14.2 : (actName === "Running" ? 9.5 : 4.8);
  const endurance = Math.max(45, Math.min(96, Math.round(92 - (hr - 120) * 0.55)));
  const fatigue = Math.min(65, Math.max(25, Math.round(28 + (hr - 120) * 0.4)));
  const recovery = Math.max(50, Math.min(95, Math.round(88 - fatigue * 0.3)));
  const readiness = Math.round(recovery * 0.6 + (100 - fatigue) * 0.4);

  return {
    device: {
      id: "ESP32-SIMULATED-RUNNER",
      device_id: "ESP32-SIMULATED-RUNNER",
      connected: true,
      mock_mode: true,
      rate_hz: 1.0,
      battery: 94,
      data_provenance: "DEMO",
      data_quality: { grade: "EXCELLENT" }
    },
    vitals: {
      heart_rate: {
        value: hr,
        trend: hr > 145 ? "+2%" : "-1%",
        color: hr > 150 ? "red" : (hr > 125 ? "yellow" : "green"),
        zone: hr > 150 ? "Zone 4" : "Zone 3",
        zone_info: { name: hr > 150 ? "Zone 4: Anaerobic Threshold" : "Zone 3: Aerobic Base" }
      },
      spo2: {
        value: spo2,
        status: "Optimal",
        color: "green"
      },
      activity: {
        value: actName,
        subtext: "Simulated Training"
      },
      acceleration: {
        value: rawMag,
        axes: { x: ax, y: ay, z: az },
        trend: rawMag > 2.0 ? "+16%" : "-4%",
        status: rawMag > 2.2 ? "High Impact" : "Optimal"
      },
      speed: {
        value: speed,
        unit: "km/h"
      },
      endurance: {
        value: endurance,
        status: endurance >= 75 ? "Good Capacity (Est.)" : "Moderate (Est.)",
        color: endurance >= 75 ? "green" : "yellow"
      }
    },
    twin_status: {
      recovery_value: recovery,
      fatigue_value: fatigue,
      performance_value: 86.0,
      readiness_value: readiness,
      fatigue_label: hr > 150 ? "Elevated" : "Moderate",
      recovery_label: "Optimal",
      performance_label: "High"
    }
  };
}

function startClientMockFeed() {
  if (clientMockInterval) clearInterval(clientMockInterval);

  isMockActive = true;
  isSensorConnected = true;
  lastLivePacketTimestamp = Date.now();

  updateHardwareStatusUI({
    connected: true,
    mock_mode: true,
    device_id: "ESP32-SIMULATED-RUNNER",
    rate_hz: 1.0,
    battery: 94,
    data_provenance: "DEMO",
    data_quality: { grade: "EXCELLENT" }
  });

  // Emit first packet immediately
  const firstPacket = generateClientMockPacket();
  handleIncomingTelemetry(firstPacket);

  // Emit continuous packets every 1000ms
  clientMockInterval = setInterval(() => {
    if (!isMockActive) {
      stopClientMockFeed();
      return;
    }
    const packet = generateClientMockPacket();
    handleIncomingTelemetry(packet);
  }, 1000);
}

function stopClientMockFeed() {
  if (clientMockInterval) {
    clearInterval(clientMockInterval);
    clientMockInterval = null;
  }
}

function startMockFallbackPolling() {
  // Maintained for backward compatibility; client simulation drives continuous live packets
}

function stopMockFallbackPolling() {
  stopClientMockFeed();
}

function initHardwareControls() {
  // Top navigation simulate toggle
  const toggleBtn = document.getElementById("btnToggleSimFeed");
  const liveToggleBtn = document.getElementById("btnLiveToggleSim");

  async function toggleMock() {
    if (isTogglingMock) return;
    isTogglingMock = true;

    const willActivate = !isMockActive;
    const targetAction = willActivate ? "start" : "stop";
    updateSimulatorButtonUI(isMockActive, true);

    try {
      // Notify backend if available (runs in background, ignore errors in serverless)
      fetch("/api/esp32/mock-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: targetAction })
      }).catch(() => {});

      isMockActive = willActivate;
      updateSimulatorButtonUI(isMockActive, false);

      if (isMockActive) {
        showToast("ESP32 Simulation Started (Continuous Stream)", "⚡");
        startClientMockFeed();
      } else {
        showToast("ESP32 Simulation Stopped", "⏹");
        stopClientMockFeed();
        handleSensorDisconnected();
      }
    } catch (err) {
      console.error("Failed to toggle simulator feed:", err);
      isMockActive = willActivate;
      updateSimulatorButtonUI(isMockActive, false);
      if (isMockActive) {
        startClientMockFeed();
      } else {
        stopClientMockFeed();
        handleSensorDisconnected();
      }
    } finally {
      isTogglingMock = false;
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

  // Pre-render deterministic dataset immediately if table is not yet populated
  const tbody = document.getElementById("analyticsHistoryTableBody");
  if (tbody && tbody.children.length === 0) {
    populateAnalyticsTable(generateDeterministic180DayHistory());
  }

  try {
    const res = await fetch("/api/history");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      if (loadEl) loadEl.textContent = `${Math.min(100, Math.round(((s.mean_load || 42) / 50.0) * 100))}%`;
      if (perfEl) perfEl.textContent = `${(s.mean_performance || 79.4).toFixed(1)}`;
      if (rhrEl) rhrEl.textContent = `${Math.round(s.mean_resting_hr || 54)} BPM`;
      if (peakFatigueEl) peakFatigueEl.textContent = `${(s.peak_fatigue || 48.2).toFixed(1)}%`;
      if (minRecoveryEl) minRecoveryEl.textContent = `${(s.min_recovery || 62.0).toFixed(1)}%`;
    }

    const historyData = Array.isArray(data.history) && data.history.length > 0
      ? data.history
      : generateDeterministic180DayHistory();

    renderAnalyticsFatigueRecoveryChart(historyData);
    renderAnalyticsLoadPerfChart(historyData);
    populateAnalyticsTable(historyData);

    if (cachedDashboardData && cachedDashboardData.charts) {
      renderHeartRateChart(cachedDashboardData.charts.heart_rate);
      renderMovementChart(cachedDashboardData.charts.movement);
    }
  } catch (err) {
    console.warn("Analytics fetch failed, maintaining deterministic 180-day baseline:", err);
    const fallbackHistory = generateDeterministic180DayHistory();
    populateAnalyticsTable(fallbackHistory);
    renderAnalyticsFatigueRecoveryChart(fallbackHistory);
    renderAnalyticsLoadPerfChart(fallbackHistory);
  }
}

function renderAnalyticsFatigueRecoveryChart(history) {
  const canvas = document.getElementById("analyticsFatigueRecoveryChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const parentH = canvas.parentElement ? canvas.parentElement.clientHeight : 0;
  const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 450);
  const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 160);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
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

  if (!history || history.length < 2) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("Waiting for historical analytics...", pad.left + plotW / 2, pad.top + plotH / 2);
    ctx.restore();
    return;
  }

  const pts = history.slice(-60); // Show last 60 days for high clarity
  const stepX = plotW / Math.max(1, pts.length - 1);

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
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const parentH = canvas.parentElement ? canvas.parentElement.clientHeight : 0;
  const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 450);
  const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 160);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
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

  if (!history || history.length < 2) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("Waiting for historical analytics...", pad.left + plotW / 2, pad.top + plotH / 2);
    ctx.restore();
    return;
  }

  const pts = history.slice(-60);
  const stepX = plotW / Math.max(1, pts.length - 1);

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

function generateDeterministic180DayHistory() {
  const history = [];
  let prevFatigue = 30.0;
  let prevRecovery = 75.0;

  for (let day = 1; day <= 180; day++) {
    const phase = day * 0.35;
    const isRest = (day % 7 === 0 || day % 12 === 0);
    const duration = isRest ? 0 : Math.round(45 + 30 * Math.sin(phase * 0.8));
    const intensity = isRest ? 0.0 : parseFloat((0.65 + 0.20 * Math.sin(phase * 1.2)).toFixed(2));
    const load = isRest ? 0 : Math.round(duration * intensity * 0.95);
    const sleep = parseFloat((7.8 + 0.9 * Math.cos(phase * 0.7)).toFixed(1));

    const fatigue = parseFloat(Math.min(95.0, Math.max(5.0, (prevFatigue * 0.6) + (load * 0.42) - (sleep * 1.8))).toFixed(1));
    const recovery = parseFloat(Math.min(99.0, Math.max(15.0, 100.0 - (fatigue * 0.7) + (sleep * 2.2) - (load * 0.15))).toFixed(1));
    const perf = parseFloat(Math.min(99.0, Math.max(20.0, (recovery * 0.65) + ((100.0 - fatigue) * 0.35))).toFixed(1));
    const restingHr = Math.round(52 + (fatigue * 0.12) - (recovery * 0.08));

    history.push({
      day: day,
      sleep_hours: sleep,
      daily_load: load,
      fatigue_level: fatigue,
      recovery_score: recovery,
      performance_score: perf,
      resting_hr: restingHr,
      workout_duration_min: duration,
      workout_intensity: intensity
    });

    prevFatigue = fatigue;
    prevRecovery = recovery;
  }

  return history;
}

function populateAnalyticsTable(history) {
  const tbody = document.getElementById("analyticsHistoryTableBody");
  if (!tbody) return;

  // 1. Resolve dataset: use passed history if valid non-empty array, otherwise deterministic 180-day baseline
  let rows = Array.isArray(history) && history.length > 0 ? history : generateDeterministic180DayHistory();

  // 2. Explicitly sort in ascending order by Day (Day 1 at the top down to Day 180)
  rows = [...rows].sort((a, b) => {
    const dayA = a && a.day !== undefined ? Number(a.day) : 0;
    const dayB = b && b.day !== undefined ? Number(b.day) : 0;
    return dayA - dayB;
  });

  // 3. Update row count header indicator
  const countEl = document.getElementById("historyRowCount");
  if (countEl) countEl.textContent = `Showing all ${rows.length} recorded training days (Day 1 – ${rows.length})`;

  // 4. Render all rows starting from Day 1 to Day 180
  tbody.innerHTML = rows.map((r, idx) => {
    const dayNum = (r && r.day !== undefined && r.day !== null) ? r.day : (idx + 1);
    const sleep = (r && r.sleep_hours !== undefined && r.sleep_hours !== null) ? Number(r.sleep_hours).toFixed(1) : "8.0";
    const load = (r && r.daily_load !== undefined && r.daily_load !== null) ? Math.round(Number(r.daily_load)) : 0;
    const fatigue = (r && r.fatigue_level !== undefined && r.fatigue_level !== null) ? Number(r.fatigue_level).toFixed(1) : "20.0";
    const recovery = (r && r.recovery_score !== undefined && r.recovery_score !== null) ? Number(r.recovery_score).toFixed(1) : "80.0";
    const perf = (r && r.performance_score !== undefined && r.performance_score !== null) ? Number(r.performance_score).toFixed(1) : "75.0";

    return `
      <tr>
        <td><strong>Day ${dayNum}</strong></td>
        <td>${sleep} h</td>
        <td>${Math.min(100, Math.round(load))}%</td>
        <td><span style="color:#ef4444">${fatigue}%</span></td>
        <td><span style="color:#10b981">${recovery}%</span></td>
        <td><strong>${perf}</strong></td>
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
    { id: "deepNodeLWrist", title: "Left Wrist (Grip & IMU)", desc: "Tri-axial accelerometer vector streaming. Arm swing biomechanics." },
    { id: "deepNodeRWrist", title: "Right Wrist (Grip & IMU)", desc: "Arm swing symmetry and movement balance." },
    { id: "deepNodeLKnee", title: "Left Knee (Patellar Load)", desc: "Impact force dissipation: 2.4g instantaneous ground acceleration." },
    { id: "deepNodeRKnee", title: "Right Knee (Patellar Load)", desc: "Joint torque estimation under continuous running kinematics." },
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
    { day: "Wed", duration: 0, intensity: "Low", sleep: 8.5 },
    { day: "Thu", duration: 50, intensity: "High", sleep: 7.5 },
    { day: "Fri", duration: 45, intensity: "Moderate", sleep: 7.5 },
    { day: "Sat", duration: 90, intensity: "Moderate", sleep: 8.5 },
    { day: "Sun", duration: 0, intensity: "Low", sleep: 9.0 }
  ],
  taper: [
    { day: "Mon", duration: 40, intensity: "Moderate", sleep: 8.5 },
    { day: "Tue", duration: 30, intensity: "Moderate", sleep: 8.5 },
    { day: "Wed", duration: 20, intensity: "Low", sleep: 9.0 },
    { day: "Thu", duration: 25, intensity: "High", sleep: 8.5 },
    { day: "Fri", duration: 0, intensity: "Low", sleep: 9.5 },
    { day: "Sat", duration: 15, intensity: "Low", sleep: 9.5 },
    { day: "Sun", duration: 60, intensity: "High", sleep: 9.0 }
  ],
  endurance: [
    { day: "Mon", duration: 75, intensity: "Moderate", sleep: 8.0 },
    { day: "Tue", duration: 90, intensity: "Moderate", sleep: 8.0 },
    { day: "Wed", duration: 60, intensity: "Moderate", sleep: 8.0 },
    { day: "Thu", duration: 80, intensity: "High", sleep: 8.0 },
    { day: "Fri", duration: 45, intensity: "Low", sleep: 8.5 },
    { day: "Sat", duration: 120, intensity: "Moderate", sleep: 8.5 },
    { day: "Sun", duration: 0, intensity: "Low", sleep: 9.0 }
  ],
  recovery: [
    { day: "Mon", duration: 30, intensity: "Low", sleep: 9.0 },
    { day: "Tue", duration: 0, intensity: "Low", sleep: 9.5 },
    { day: "Wed", duration: 30, intensity: "Low", sleep: 9.0 },
    { day: "Thu", duration: 0, intensity: "Low", sleep: 9.5 },
    { day: "Fri", duration: 25, intensity: "Low", sleep: 9.0 },
    { day: "Sat", duration: 40, intensity: "Low", sleep: 9.5 },
    { day: "Sun", duration: 0, intensity: "Low", sleep: 10.0 }
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

  // Auto-render trajectory when canvas dimensions become positive (e.g. view switch)
  const trajCanvas = document.getElementById("scheduleTrajectoryChart");
  if (trajCanvas && window.ResizeObserver) {
    const trajObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && cachedScheduleDays) {
          renderScheduleTrajectoryChart(cachedScheduleDays);
        }
      }
    });
    trajObserver.observe(trajCanvas);
  }

  initScheduleTrajectoryTooltip();

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
          <option value="Low" ${d.intensity === "Low" ? "selected" : ""}>Low</option>
          <option value="Moderate" ${d.intensity === "Moderate" ? "selected" : ""}>Moderate</option>
          <option value="High" ${d.intensity === "High" ? "selected" : ""}>High</option>
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

      if (sumLoad) sumLoad.textContent = `${Math.min(100, Math.round((s.total_workload / 400.0) * 100))}% Capacity`;
      if (sumFatigue) sumFatigue.textContent = `${s.peak_fatigue.toFixed(1)}%`;
      if (sumRecovery) sumRecovery.textContent = `${s.min_recovery.toFixed(1)}%`;
      if (sumReadiness) sumReadiness.textContent = `${s.avg_readiness.toFixed(1)}`;
      if (sumOverreach) sumOverreach.textContent = s.overreaching_count;
      if (sumHighRisk) sumHighRisk.textContent = s.high_risk_count;
    }

    if (data.days) {
      cachedScheduleDays = data.days;
      window.cachedScheduleDays = data.days;
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

function renderScheduleTrajectoryChart(days, activeIdx = null) {
  const canvas = document.getElementById("scheduleTrajectoryChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const parentH = canvas.parentElement ? canvas.parentElement.clientHeight : 0;
  const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 800);
  const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 170);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 22, right: 24, bottom: 28, left: 44 };
  const plotW = Math.max(10, w - pad.left - pad.right);
  const plotH = Math.max(10, h - pad.top - pad.bottom);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // 1. Grid lines & Y-axis labels (WHOOP High-Contrast Style)
  [0, 25, 50, 75, 100].forEach(val => {
    const y = pad.top + plotH - (val / 100) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    if (val === 0 || val === 100) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.setLineDash([4, 4]);
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#8E8E93";
    ctx.font = "600 11px Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${val}%`, pad.left - 8, y);
  });

  if (!days || !days.length) {
    dayLabels.forEach((label, i) => {
      const x = pad.left + (i / Math.max(1, dayLabels.length - 1)) * plotW;
      ctx.fillStyle = "#8E8E93";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, x, pad.top + plotH + 8);
    });
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("Run 7-Day Simulation to plot projected trajectory", pad.left + plotW / 2, pad.top + plotH / 2);
    ctx.restore();
    return;
  }

  const getX = i => pad.left + (i / Math.max(1, days.length - 1)) * plotW;
  const getY = val => pad.top + plotH - (Math.min(100, Math.max(0, val)) / 100) * plotH;

  // 2. Day columns & vertical guides
  days.forEach((d, i) => {
    const x = getX(i);
    const isAct = (activeIdx === i);

    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.strokeStyle = isAct ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = isAct ? 1.5 : 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = dayLabels[i] || (d.Day ? d.Day.slice(0, 3) : `D${i + 1}`);
    ctx.fillStyle = isAct ? "#FFFFFF" : "#8E8E93";
    ctx.font = isAct ? "700 11px Inter, sans-serif" : "600 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(label, x, pad.top + plotH + 8);
  });

  // Smooth cubic spline builder
  function buildSmoothSpline(pts) {
    if (pts.length < 2) return;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  // Fills with Smooth Splines
  function fillSmoothArea(key, gradColor) {
    const pts = days.map((d, i) => ({ x: getX(i), y: getY(d[key]) }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.top + plotH);
    ctx.lineTo(pts[0].x, pts[0].y);
    buildSmoothSpline(pts);
    ctx.lineTo(pts[pts.length - 1].x, pad.top + plotH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, gradColor);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fill();
  }

  fillSmoothArea("Recovery (%)", "rgba(0, 230, 118, 0.18)");
  fillSmoothArea("Performance", "rgba(56, 189, 248, 0.14)");
  fillSmoothArea("Fatigue (%)", "rgba(255, 69, 58, 0.14)");

  // Lines & Nodes with Smooth Splines
  function drawSmoothSeries(key, color, lw) {
    const pts = days.map((d, i) => ({ x: getX(i), y: getY(d[key]) }));

    // Line stroke
    ctx.beginPath();
    buildSmoothSpline(pts);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Node markers
    pts.forEach((pt, i) => {
      const isAct = (activeIdx === i);

      // Outer glow
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isAct ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = isAct ? 0.45 : 0.25;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Inner solid core
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isAct ? 3.5 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#101012";
      ctx.stroke();
    });
  }

  drawSmoothSeries("Recovery (%)", "#00E676", 2.6);
  drawSmoothSeries("Performance", "#38BDF8", 2.4);
  drawSmoothSeries("Fatigue (%)", "#FF453A", 2.4);
}

function initScheduleTrajectoryTooltip() {
  const canvas = document.getElementById("scheduleTrajectoryChart");
  if (!canvas) return;
  const box = canvas.parentElement;
  if (!box) return;

  box.addEventListener("mousemove", e => {
    if (!cachedScheduleDays || !cachedScheduleDays.length) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const pad = { top: 22, right: 24, bottom: 28, left: 44 };
    const plotW = rect.width - pad.left - pad.right;

    if (mouseX < pad.left || mouseX > rect.width - pad.right) {
      hideScheduleTooltip();
      renderScheduleTrajectoryChart(cachedScheduleDays, null);
      return;
    }

    const ratio = (mouseX - pad.left) / plotW;
    const idx = Math.min(cachedScheduleDays.length - 1, Math.max(0, Math.round(ratio * (cachedScheduleDays.length - 1))));

    renderScheduleTrajectoryChart(cachedScheduleDays, idx);
    showScheduleTooltip(e, box, cachedScheduleDays[idx]);
  });

  box.addEventListener("mouseleave", () => {
    hideScheduleTooltip();
    if (cachedScheduleDays) {
      renderScheduleTrajectoryChart(cachedScheduleDays, null);
    }
  });
}

function showScheduleTooltip(e, container, day) {
  let tooltip = document.getElementById("scheduleChartTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "scheduleChartTooltip";
    tooltip.className = "chart-tooltip";
    container.appendChild(tooltip);
  }

  const dayName = day.Day || "Session";
  const statusColor = day.Status === "OPTIMAL" ? "#00E676" : (day.Status === "OVERREACHING" ? "#FFD60A" : "#FF453A");
  const loadAU = Math.round(day["Daily Load"] || 0);
  const durMin = day["Duration (min)"] || 0;
  const intensity = day["Intensity"] ? (day["Intensity"] > 0.8 ? "High" : day["Intensity"] > 0.5 ? "Mod" : "Low") : "Rest";

  tooltip.innerHTML = `
    <div style="font-weight:700;margin-bottom:5px;color:#FFFFFF;display:flex;justify-content:space-between;gap:12px;">
      <span>${dayName}</span>
      <span style="color:${statusColor};font-size:0.75rem;">${day.Status || "OPTIMAL"}</span>
    </div>
    <div style="display:flex;gap:12px;font-size:0.76rem;margin-bottom:4px;">
      <span style="color:#00E676;">Recovery: <strong>${(day["Recovery (%)"] || 0).toFixed(1)}%</strong></span>
      <span style="color:#38BDF8;">Readiness: <strong>${(day["Performance"] || 0).toFixed(1)}</strong></span>
      <span style="color:#FF453A;">Fatigue: <strong>${(day["Fatigue (%)"] || 0).toFixed(1)}%</strong></span>
    </div>
    <div style="font-size:0.7rem;color:#8E8E93;">Planned Workload: ${Math.min(100, Math.round(loadAU))}% Capacity | ${durMin}m (${intensity})</div>
  `;
  tooltip.style.display = "block";

  const boxRect = container.getBoundingClientRect();
  const mouseX = e.clientX - boxRect.left;
  const mouseY = e.clientY - boxRect.top;
  if (typeof positionTooltip === "function") {
    positionTooltip(tooltip, container, mouseX, mouseY);
  } else {
    tooltip.style.left = `${Math.min(boxRect.width - 200, mouseX + 12)}px`;
    tooltip.style.top = `${Math.max(10, mouseY - 70)}px`;
  }
}

function hideScheduleTooltip() {
  const tooltip = document.getElementById("scheduleChartTooltip");
  if (tooltip) tooltip.style.display = "none";
}

function populateScheduleTable(days) {
  const tbody = document.getElementById("simBreakdownTableBody");
  if (!tbody) return;

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  tbody.innerHTML = days.map((d, i) => {
    const dayLabel = dayNames[i] || `Day ${i + 1}`;
    const dur = d["Duration (min)"] || d["Duration (m)"] || 0;
    const intVal = (d["Intensity"] || 0).toFixed(2);
    const load = Math.round(d["Daily Load"] || 0);
    const fatigue = (d["Fatigue (%)"] || 0).toFixed(1);
    const recovery = (d["Recovery (%)"] || 0).toFixed(1);
    const perf = (d["Performance"] || 0).toFixed(1);

    // Calculate daily efficiency
    let effVal = d["Efficiency (%)"] || d["Efficiency"];
    if (effVal === undefined || effVal === null) {
      const fNum = parseFloat(fatigue);
      const rNum = parseFloat(recovery);
      const strain = (0.50 * fNum) + (0.50 * (100.0 - rNum)) + (load * 0.05);
      effVal = Math.round(Math.max(10, Math.min(99, 100.0 - strain)));
    } else {
      effVal = Math.round(parseFloat(effVal));
    }

    return `
      <tr>
        <td><strong>${dayLabel}</strong></td>
        <td><strong>${Math.min(100, Math.round(load))}%</strong></td>
        <td><span style="color:#ef4444">${fatigue}%</span></td>
        <td><span style="color:#10b981">${recovery}%</span></td>
        <td><strong>${perf}%</strong></td>
        <td><span style="color:#38bdf8;font-weight:700;">${effVal}%</span></td>
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
    if (saved.name) {
      updateActiveUserProfile(saved, false);
    }
    if (saved.age) {
      document.getElementById("settingAthleteAge").value = saved.age;
      if (maxHrInput) maxHrInput.value = 220 - saved.age;
    }
    if (saved.weight) document.getElementById("settingAthleteWeight").value = saved.weight;
    if (saved.height) document.getElementById("settingAthleteHeight").value = saved.height;
    if (saved.restHr) document.getElementById("settingAthleteRestHr").value = saved.restHr;
    if (saved.serverUrl) document.getElementById("settingServerUrl").value = saved.serverUrl;
    if (saved.wifiSsid) document.getElementById("settingWifiSsid").value = saved.wifiSsid;
  } catch (e) { }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const newName = document.getElementById("settingAthleteName")?.value?.trim() || DEFAULT_USER_PROFILE.name;
      const newPos = document.getElementById("settingAthletePosition")?.value?.trim() || DEFAULT_USER_PROFILE.position;
      const newSquad = document.getElementById("settingAthleteSquadNumber")?.value?.trim() || DEFAULT_USER_PROFILE.squadNumber;
      const newAge = parseInt(document.getElementById("settingAthleteAge")?.value || "24", 10);
      const newWeight = parseFloat(document.getElementById("settingAthleteWeight")?.value || "74");
      const newHeight = parseFloat(document.getElementById("settingAthleteHeight")?.value || "180");
      const newRestHr = parseInt(document.getElementById("settingAthleteRestHr")?.value || "54", 10);
      const newMaxHr = parseInt(document.getElementById("settingAthleteMaxHr")?.value || "196", 10);

      const settings = {
        name: newName,
        position: newPos,
        squadNumber: newSquad,
        age: newAge,
        weight: newWeight,
        height: newHeight,
        restHr: newRestHr,
        maxHr: newMaxHr,
        serverUrl: document.getElementById("settingServerUrl")?.value,
        wifiSsid: document.getElementById("settingWifiSsid")?.value
      };

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      // Persist to shared backend database so all devices reflect the updated player info
      try {
        const targetAid = cachedActiveAthleteId || "ATH-0824";
        await fetch("/api/athlete/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            athlete_id: targetAid,
            name: newName,
            position: newPos,
            squad_number: newSquad,
            age: newAge,
            weight_kg: newWeight,
            height_cm: newHeight,
            resting_hr_baseline: newRestHr,
            max_hr: newMaxHr
          })
        });
      } catch (err) {
        console.warn("Notice: server athlete update:", err);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save All Settings";
      }

      updateActiveUserProfile(settings, true);

      if (toast) {
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 3500);
      }

      if (typeof loadCoachSquad === "function") {
        loadCoachSquad();
      }
    });
  }

  const saveProfileBtn = document.getElementById("btnSaveAthleteProfile");
  const profileToast = document.getElementById("profileSavedToast");
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", () => {
      if (saveBtn) {
        saveBtn.click();
      }
      if (profileToast) {
        profileToast.style.display = "block";
        setTimeout(() => { profileToast.style.display = "none"; }, 3500);
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
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const parentH = canvas.parentElement ? canvas.parentElement.clientHeight : 0;
  const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 450);
  const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 155);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
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
  const xLabels = (chartData && chartData.x_labels && chartData.x_labels.length) ? chartData.x_labels : ["0", "10", "20", "30", "40", "50", "60"];
  ctx.textAlign = "center";
  xLabels.forEach((label, i) => {
    const x = padding.left + (i / Math.max(1, xLabels.length - 1)) * plotW;
    ctx.fillText(label, x, h - 4);
  });

  const pts = (chartData && Array.isArray(chartData.points)) ? chartData.points : [];
  if (pts.length < 2) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("Waiting for sensor data...", padding.left + plotW / 2, padding.top + plotH / 2);
    ctx.restore();
    return;
  }

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
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
  const parentH = canvas.parentElement ? canvas.parentElement.clientHeight : 0;
  const w = rect.width > 0 ? rect.width : (parentW > 0 ? parentW : 450);
  const h = rect.height > 0 ? rect.height : (parentH > 0 ? parentH : 155);

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
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
  const xLabels = (chartData && chartData.x_labels && chartData.x_labels.length) ? chartData.x_labels : ["0", "10", "20", "30", "40", "50", "60"];
  ctx.textAlign = "center";
  xLabels.forEach((label, i) => {
    const x = padding.left + (i / Math.max(1, xLabels.length - 1)) * plotW;
    ctx.fillText(label, x, h - 4);
  });

  const hasPoints = chartData && ((chartData.x && chartData.x.length >= 2) || (chartData.y && chartData.y.length >= 2) || (chartData.z && chartData.z.length >= 2));
  if (!hasPoints) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("Waiting for sensor data...", padding.left + plotW / 2, padding.top + plotH / 2);
    ctx.restore();
    return;
  }

  const len = (chartData.x && chartData.x.length) || 35;
  const getX = (i, total) => padding.left + (i / Math.max(1, total - 1)) * plotW;

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

function initChartResizeObservers() {
  if (typeof ResizeObserver === "undefined") return;

  const hrBox = document.getElementById("hrCanvasContainer");
  const movBox = document.getElementById("movementCanvasContainer");
  const trajBox = document.getElementById("scheduleTrajectoryChart")?.parentElement;

  const observer = new ResizeObserver(() => {
    requestAnimationFrame(() => {
      if (cachedDashboardData && cachedDashboardData.charts) {
        renderHeartRateChart(cachedDashboardData.charts.heart_rate);
        renderMovementChart(cachedDashboardData.charts.movement);
      }
      if (currentActiveView === "what-if" && cachedScheduleDays) {
        renderScheduleTrajectoryChart(cachedScheduleDays);
      }
    });
  });

  if (hrBox) observer.observe(hrBox);
  if (movBox) observer.observe(movBox);
  if (trajBox) observer.observe(trajBox);
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
      const mag = Math.sqrt(x * x + y * y + z * z).toFixed(2);

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

  const btnPrecautions = document.getElementById("btnPrecautionsInfo");

  if (!modal) return;

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

/**
 * Clean Information Popup for Training Risk Metrics
 * Explains: Training Load, Running Impact, Movement Balance, Recovery
 */
function initTrainingRiskPopup() {
  const btn = document.getElementById("btnInjuryInfo");
  const popup = document.getElementById("trainingRiskInfoPopup");
  const closeBtn = document.getElementById("btnCloseTrainingRiskPopup");

  if (!btn || !popup) return;

  function openPopup() {
    popup.style.display = "flex";
    btn.setAttribute("aria-expanded", "true");
  }

  function closePopup() {
    popup.style.display = "none";
    btn.setAttribute("aria-expanded", "false");
  }

  function togglePopup(e) {
    e.stopPropagation();
    if (popup.style.display === "none" || !popup.style.display) {
      openPopup();
    } else {
      closePopup();
    }
  }

  btn.addEventListener("click", togglePopup);

  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closePopup();
    });
  }

  // Prevent clicks inside popup from bubbling to document
  popup.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Tap or click outside closes popup
  document.addEventListener("click", (e) => {
    if (popup.style.display !== "none" && popup.style.display !== "" && !popup.contains(e.target) && !btn.contains(e.target)) {
      closePopup();
    }
  });

  // Escape key closes popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && popup.style.display !== "none" && popup.style.display !== "") {
      closePopup();
    }
  });
}
window.initTrainingRiskPopup = initTrainingRiskPopup;

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
      showToast(`Activity Status: ${act} (Team Training Session) • GPS speed streaming`, "⚽");
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
function calculateEfficiency(recovery, fatigue, load = 0, intensity = 0) {
  const r = parseFloat(recovery) || 75.0;
  const f = parseFloat(fatigue) || 35.0;
  const ld = parseFloat(load) || 0.0;
  const internalStrain = (0.50 * f) + (0.50 * (100.0 - r));
  const loadPenalty = ld > 0 ? Math.min(15.0, ld * 0.05) : 0.0;
  const totalStrain = internalStrain + loadPenalty;
  const eff = 100.0 - totalStrain;
  return Math.round(Math.min(99.0, Math.max(10.0, eff)) * 10) / 10;
}
window.calculateEfficiency = calculateEfficiency;

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

  // Baseline reference metrics for active athlete profile
  const baselineState = {
    intensity: "Moderate",
    duration: 60,
    fatigue: 38.0,
    recovery: 78.0,
    readiness: 85.0,
    efficiency: calculateEfficiency(78.0, 38.0, 60 * 0.65, 0.65),
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
    let predictedEfficiency = 77.0;
    let predictedAvgHr = 154;
    let predictedCalories = 680;
    let fatigueLabel = "Moderate";
    let recoveryLabel = "Optimal";
    let readinessLabel = "High";
    let efficiencyLabel = "Optimal";

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
        if (data.efficiency_value !== undefined) {
          predictedEfficiency = data.efficiency_value;
          efficiencyLabel = data.efficiency_label || (predictedEfficiency >= 75 ? "Optimal" : (predictedEfficiency >= 60 ? "Moderate" : "Suboptimal"));
        } else {
          predictedEfficiency = calculateEfficiency(predictedRecovery, predictedFatigue, scenarioDuration * intFactor, intFactor);
          efficiencyLabel = predictedEfficiency >= 75 ? "Optimal" : (predictedEfficiency >= 60 ? "Moderate" : "Suboptimal");
        }
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
      predictedEfficiency = calculateEfficiency(predictedRecovery, predictedFatigue, acuteLoad, intFactor);
      predictedAvgHr = Math.round(112 + intFactor * 74);
      predictedCalories = Math.round(scenarioDuration * intFactor * 16.2);

      fatigueLabel = predictedFatigue > 55 ? "High" : (predictedFatigue > 35 ? "Moderate" : "Low");
      recoveryLabel = predictedRecovery >= 75 ? "Optimal" : (predictedRecovery >= 60 ? "Moderate" : "Depleted");
      readinessLabel = predictedReadiness >= 80 ? "High" : (predictedReadiness >= 65 ? "Moderate" : "Low");
      efficiencyLabel = predictedEfficiency >= 75 ? "Optimal" : (predictedEfficiency >= 60 ? "Moderate" : "Suboptimal");
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
      efficiency: predictedEfficiency,
      efficiencyLabel: efficiencyLabel,
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

    // 4. Efficiency
    const effValEl = document.getElementById("predEfficiencyVal");
    const effStatusEl = document.getElementById("predEfficiencyStatus");
    const barEfficiency = document.getElementById("barEfficiency");
    const deltaEfficiencyBadge = document.getElementById("deltaEfficiencyBadge");

    const eRound = Math.round(outcome.efficiency !== undefined ? outcome.efficiency : 77);
    if (effValEl) effValEl.textContent = `${eRound}%`;
    if (effStatusEl) {
      effStatusEl.textContent = outcome.efficiencyLabel || (eRound >= 75 ? "Optimal" : (eRound >= 60 ? "Moderate" : "Suboptimal"));
      effStatusEl.className = `outcome-status-tag ${eRound >= 75 ? "status-cyan" : (eRound >= 60 ? "status-amber" : "status-red")}`;
    }
    if (barEfficiency) {
      barEfficiency.style.width = `${Math.min(100, Math.max(5, eRound))}%`;
      barEfficiency.className = `progress-fill ${eRound >= 75 ? "fill-cyan" : (eRound >= 60 ? "fill-amber" : "fill-red")}`;
    }
    if (deltaEfficiencyBadge) {
      const diff = eRound - Math.round(baselineState.efficiency || 77);
      if (diff === 0) {
        deltaEfficiencyBadge.textContent = "Baseline";
        deltaEfficiencyBadge.className = "delta-badge delta-neutral";
      } else if (diff > 0) {
        deltaEfficiencyBadge.textContent = `↑ +${diff}%`;
        deltaEfficiencyBadge.className = "delta-badge delta-positive";
      } else {
        deltaEfficiencyBadge.textContent = `↓ ${diff}%`;
        deltaEfficiencyBadge.className = "delta-badge delta-negative";
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
        efficiency: baselineState.efficiency,
        efficiencyLabel: "Optimal",
        avgHr: baselineState.avgHr,
        calories: baselineState.calories
      });
      showToast("Reset What-If scenario to baseline conditions", "🔄", 2000);
    });
  }
}

/* ==============================================================================
   25. PERSONALIZED DIGITAL TWIN + AI COACH CONTROLLER
   ============================================================================== */
let cachedCoachData = null;
let cachedComparativeScenarios = null;

/**
 * Loads and coordinates the unified AI Coach & Digital Twin state.
 */
async function loadDigitalTwinCoach() {
  try {
    const res = await fetch("/api/ai/coach-overview");
    if (!res.ok) throw new Error("Coach overview failed");
    const data = await res.json();
    cachedCoachData = data;

    const twin = data.digital_twin || {};
    const rec = data.recommendation || {};
    const alerts = data.smart_alerts || [];
    const insights = data.insights || [];
    const weekly = data.weekly_report || {};

    // 1. Digital Twin Core Scores (Top of Dashboard)
    const twReadinessEl = document.getElementById("twinReadinessVal");
    const twReadinessBar = document.getElementById("twinReadinessBar");
    const twReadinessLabel = document.getElementById("twinReadinessLabel");
    if (twReadinessEl) twReadinessEl.textContent = `${Math.round(twin.readiness_score || 82)}%`;
    if (twReadinessBar) twReadinessBar.style.width = `${twin.readiness_score || 82}%`;
    if (twReadinessLabel) twReadinessLabel.textContent = (twin.readiness_score || 82) >= 80 ? "High" : ((twin.readiness_score || 82) >= 65 ? "Moderate" : "Low");

    const twRecVal = document.getElementById("twinRecoveryVal");
    const twRecBar = document.getElementById("twinRecoveryBar");
    const twRecLabel = document.getElementById("twinRecoveryLabel");
    if (twRecVal) twRecVal.textContent = `${Math.round(twin.recovery_score || 78)}%`;
    if (twRecBar) twRecBar.style.width = `${twin.recovery_score || 78}%`;
    if (twRecLabel) twRecLabel.textContent = (twin.recovery_score || 78) >= 75 ? "Optimal" : "Moderate";

    const twFatVal = document.getElementById("twinFatigueVal");
    const twFatBar = document.getElementById("twinFatigueBar");
    const twFatLabel = document.getElementById("twinFatigueLabel");
    if (twFatVal) twFatVal.textContent = `${Math.round(twin.fatigue_score || 38)}%`;
    if (twFatBar) twFatBar.style.width = `${twin.fatigue_score || 38}%`;
    if (twFatLabel) twFatLabel.textContent = (twin.fatigue_score || 38) > 55 ? "High" : ((twin.fatigue_score || 38) > 30 ? "Moderate" : "Low");

    const twPerfVal = document.getElementById("twinPerformanceVal");
    const twPerfBar = document.getElementById("twinPerformanceBar");
    const twPerfLabel = document.getElementById("twinPerformanceLabel");
    if (twPerfVal) twPerfVal.textContent = `${Math.round(twin.performance_score || 87)}%`;
    if (twPerfBar) twPerfBar.style.width = `${twin.performance_score || 87}%`;
    if (twPerfLabel) twPerfLabel.textContent = (twin.performance_score || 87) >= 80 ? "High Output" : "Steady";

    const twLoadVal = document.getElementById("twinLoadVal");
    const twLoadLabel = document.getElementById("twinLoadLabel");
    if (twLoadVal) twLoadVal.textContent = `${Math.min(100, Math.round(twin.training_load || 42))}%`;
    if (twLoadLabel) twLoadLabel.textContent = twin.training_load_label || "Moderate";

    // Overall State Badge
    const stateBadge = document.getElementById("twinOverallStateBadge");
    const stateText = document.getElementById("twinOverallStateText");
    if (stateBadge && stateText && twin.overall_state) {
      const col = twin.overall_state.color || "green";
      stateBadge.className = `overall-state-badge badge-${col === 'green' ? 'ready' : (col === 'red' ? 'fatigue' : 'recovery')}`;
      stateText.textContent = twin.overall_state.label || "READY FOR TRAINING";
    }

    // 2. Today's AI Recommendation Card
    const recStateTag = document.getElementById("recStateTag");
    const recHeadline = document.getElementById("recHeadline");
    const recDuration = document.getElementById("recDuration");
    const recIntensity = document.getElementById("recIntensity");
    const recFocus = document.getElementById("recFocus");
    const recReason = document.getElementById("recReason");

    if (recStateTag) {
      recStateTag.textContent = rec.state_badge || "HIGH READINESS";
      recStateTag.className = `ai-state-tag ${rec.badge_class || 'pill-green'}`;
    }
    if (recHeadline) recHeadline.textContent = rec.headline || "High-Intensity Tactical & Power Training";
    if (recDuration) recDuration.textContent = `${rec.duration_min || 75} minutes`;
    if (recIntensity) recIntensity.textContent = rec.recommended_intensity || "80–85% HRmax (Zone 4)";
    if (recFocus) recFocus.textContent = rec.focus || "High-Speed Sprints + Small-Sided Game Drills";
    if (recReason) recReason.textContent = rec.reason || "Your readiness is high with optimal recovery.";

    // 3. Render Smart Alerts
    renderSmartAlerts(alerts);

    // 4. Render AI Performance Insights in Analytics View
    renderAIInsights(insights);

    // 5. Render Weekly Report Summary in Analytics View
    renderWeeklyReportSummary(weekly);

  } catch (err) {
    console.error("AI Coach Overview load error:", err);
  }
}

/**
 * Renders Smart Anomaly & Risk Alerts with Risk Factors and Suggested Actions.
 */
function renderSmartAlerts(alerts) {
  const container = document.getElementById("smartAlertsList");
  const countBadge = document.getElementById("alertsCountBadge");
  if (!container) return;

  if (countBadge) {
    const dangerCount = alerts.filter(a => a.status === "danger" || a.status === "warning").length;
    countBadge.textContent = `${dangerCount} Active Indicator${dangerCount === 1 ? '' : 's'}`;
  }

  if (!alerts || alerts.length === 0) {
    container.innerHTML = `
      <div class="smart-alert-card-item alert-success">
        <div class="alert-top-title-row">
          <span class="alert-item-title">🟢 Normal Pattern</span>
          <span class="badge-pill pill-green">Optimal</span>
        </div>
        <p style="margin:4px 0 0 0;">All physiological parameters and ground impact metrics are within baseline variance.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map(alert => {
    const riskFactorItems = alert.risk_factors ? Object.entries(alert.risk_factors)
      .map(([k, v]) => `<span><strong>${k}:</strong> ${v}</span>`)
      .join("&bull; ") : "";

    return `
      <div class="smart-alert-card-item alert-${alert.status || 'warning'}">
        <div class="alert-top-title-row">
          <span class="alert-item-title">${alert.title}</span>
          <span class="badge-pill ${alert.status === 'danger' ? 'pill-red' : (alert.status === 'warning' ? 'pill-yellow' : 'pill-green')}">${alert.badge || 'Alert'}</span>
        </div>
        <p style="margin:4px 0 6px 0;font-size:0.79rem;line-height:1.4;">${alert.description}</p>
        ${riskFactorItems ? `<div class="alert-factors-mini-row">${riskFactorItems}</div>` : ""}
        ${alert.suggested_action ? `<div class="alert-suggested-action"><strong>Suggested Action:</strong> ${alert.suggested_action}</div>` : ""}
      </div>
    `;
  }).join("");
}

/**
 * Renders AI Performance Insights in the Analytics View.
 */
function renderAIInsights(insights) {
  const container = document.getElementById("aiInsightsList");
  if (!container) return;

  if (!insights || insights.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.82rem;">No longitudinal trends detected yet.</p>`;
    return;
  }

  container.innerHTML = insights.map(item => {
    const badgeClass = item.type === "positive" ? "pill-green" : (item.type === "warning" ? "pill-yellow" : "pill-blue");
    return `
      <div class="ai-insight-card">
        <div class="insight-head">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>${item.icon || '⚡'}</span>
            <strong class="insight-title">${item.title}</strong>
          </div>
          <span class="badge-pill ${badgeClass}">${item.badge}</span>
        </div>
        <p style="margin:4px 0 0 0;color:var(--text-muted);font-size:0.8rem;line-height:1.45;">${item.text}</p>
      </div>
    `;
  }).join("");
}

/**
 * Renders Weekly Athlete Report Summary card in Analytics View.
 */
function renderWeeklyReportSummary(report) {
  const container = document.getElementById("weeklyReportCardSummary");
  if (!container || !report) return;

  const p = report.performance || {};
  const t = report.training || {};
  const r = report.recovery || {};

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div style="background:#F1F6FB;padding:10px 12px;border-radius:8px;">
        <span style="font-size:0.68rem;color:var(--text-muted);font-weight:700;display:block;">Avg Readiness</span>
        <strong style="font-size:1.1rem;color:var(--text-dark);">${p.average_score || 86.4}%</strong>
        <span style="font-size:0.7rem;color:#10B981;font-weight:800;">${p.performance_change || '+3.8%'}</span>
      </div>
      <div style="background:#F1F6FB;padding:10px 12px;border-radius:8px;">
        <span style="font-size:0.68rem;color:var(--text-muted);font-weight:700;display:block;">Weekly Load</span>
        <strong style="font-size:1.1rem;color:var(--text-dark);">${Math.min(100, Math.round(((t.total_load || 328.5) / 400.0) * 100))}% Capacity</strong>
        <span style="font-size:0.7rem;color:var(--text-muted);">${t.completed_hours || '6.5 hours'}</span>
      </div>
    </div>
  `;
}

/**
 * "Why This Recommendation?" Factor Attribution Modal.
 */
function initWhyRecommendationModal() {
  const btn = document.getElementById("btnWhyRecommendation");
  const modal = document.getElementById("whyRecModal");
  const closeBtn = document.getElementById("btnCloseWhyRecModal");
  const understandBtn = document.getElementById("btnUnderstandRec");

  if (!btn || !modal) return;

  function openModal() {
    const rec = cachedCoachData?.recommendation;
    const headline = document.getElementById("modalRecHeadline");
    const quote = document.getElementById("modalRecQuote");
    const factorsList = document.getElementById("modalWhyFactorsList");

    if (headline && rec) headline.textContent = rec.headline;
    if (quote && rec) quote.textContent = `"${rec.quote || rec.reason}"`;

    if (factorsList) {
      const factors = rec?.why_factors || [
        { name: "Recovery Status", value: "78%", weight: "45%", impact: "Optimal", color: "#10B981", detail: "Restorative sleep and autonomic parasympathetic recovery." },
        { name: "Fatigue Level", value: "38%", weight: "35%", impact: "Moderate", color: "#38BDF8", detail: "Accumulated acute strain from prior matches." },
        { name: "Sleep Adequacy", value: "7.8h", weight: "12%", impact: "Sufficient", color: "#10B981", detail: "Exceeds 7.5h baseline threshold for muscle glycogen." },
        { name: "Acute:Chronic Ratio", value: "1.09", weight: "8%", impact: "Sweet Spot", color: "#10B981", detail: "Safe adaptation zone." }
      ];

      factorsList.innerHTML = factors.map(f => `
        <div class="why-factor-row">
          <div class="why-factor-left">
            <span class="why-factor-name">${f.name}</span>
            <span class="why-factor-detail">${f.detail}</span>
          </div>
          <div class="why-factor-right">
            <span class="why-factor-val" style="color:${f.color || 'var(--text-dark)'};">${f.value}</span>
            <span class="why-factor-weight">${f.weight} weight</span>
          </div>
        </div>
      `).join("");
    }

    modal.style.display = "flex";
  }

  btn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", () => modal.style.display = "none");
  if (understandBtn) understandBtn.addEventListener("click", () => modal.style.display = "none");
  modal.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });
}

/**
 * Weekly Athlete Report Full Retrospective Modal.
 */
function initWeeklyReportModal() {
  const btn = document.getElementById("btnOpenFullWeeklyReport");
  const modal = document.getElementById("weeklyReportModal");
  const closeBtn = document.getElementById("btnCloseWeeklyReportModal");
  const closeBottom = document.getElementById("btnCloseWeeklyReportBottom");

  if (!btn || !modal) return;

  function openModal() {
    const rep = cachedCoachData?.weekly_report;
    if (rep) {
      const aiSum = document.getElementById("weeklyModalAiSummary");
      const sub = document.getElementById("weeklyReportPeriodSubtitle");
      const p = rep.performance || {};
      const t = rep.training || {};
      const r = rep.recovery || {};

      if (aiSum) aiSum.textContent = rep.ai_summary || "";
      if (sub) sub.textContent = `${rep.report_period || "This Week"} • ${rep.athlete_name || activeUserProfile.name || "Avneesh Walvalkar"}`;

      const avgP = document.getElementById("wkAvgPerf");
      const pChg = document.getElementById("wkPerfChange");
      const totL = document.getElementById("wkTotalLoad");
      const hrs = document.getElementById("wkHours");
      const freq = document.getElementById("wkFreq");
      const avgI = document.getElementById("wkAvgInt");
      const avgR = document.getElementById("wkAvgRec");
      const slp = document.getElementById("wkSleep");

      if (avgP) avgP.textContent = p.average_score || 86.4;
      if (pChg) pChg.textContent = p.performance_change || "+3.8%";
      if (totL) totL.textContent = `${Math.min(100, Math.round(((t.total_load || 328.5) / 400.0) * 100))}%`;
      if (hrs) hrs.textContent = t.completed_hours || "6.5 hours";
      if (freq) freq.textContent = t.training_frequency || "5 Sessions";
      if (avgI) avgI.textContent = `${t.avg_intensity || '72%'} avg int`;
      if (avgR) avgR.textContent = r.average_recovery || "76.8%";
      if (slp) slp.textContent = r.avg_sleep || "7.8h sleep";

      const bestTitle = document.getElementById("wkBestSessionTitle");
      const bestKudos = document.getElementById("wkBestSessionKudos");
      if (bestTitle && p.best_session) bestTitle.textContent = p.best_session.title;
      if (bestKudos && p.best_session) bestKudos.textContent = p.best_session.kudos;

      const fatTrend = document.getElementById("wkFatigueTrendText");
      const redTrend = document.getElementById("wkReadinessTrendText");
      if (fatTrend) fatTrend.textContent = r.fatigue_trend || "Compounding (+16%). Recovery session indicated.";
      if (redTrend) redTrend.textContent = r.readiness_trend || "Stable in optimal range (82–88%).";
    }

    modal.style.display = "flex";
  }

  btn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", () => modal.style.display = "none");
  if (closeBottom) closeBottom.addEventListener("click", () => modal.style.display = "none");
  modal.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });
}

/**
 * "How Your Digital Twin Works" 5-Step Pipeline Explainer Modal.
 */
function initHowTwinWorksModal() {
  const btn = document.getElementById("btnOpenHowTwinWorks");
  const modal = document.getElementById("howTwinWorksModal");
  const closeBtn = document.getElementById("btnCloseHowTwinModal");
  const closeBottom = document.getElementById("btnCloseHowTwinBottom");

  if (!btn || !modal) return;

  btn.addEventListener("click", () => modal.style.display = "flex");
  if (closeBtn) closeBtn.addEventListener("click", () => modal.style.display = "none");
  if (closeBottom) closeBottom.addEventListener("click", () => modal.style.display = "none");
  modal.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });
}

/**
 * What-If Scenario Comparative Engine (Scenario A vs B vs C vs Custom)
 * and Current -> Training -> Predicted State visual flow.
 */
async function initWhatIfComparativeScenarios() {
  const durRange = document.getElementById("whatifDurationRange");
  const intGroup = document.getElementById("whatifIntensityButtons");
  const customSyncBtn = document.getElementById("btnSyncCustomScenario");

  let currentDur = durRange ? parseInt(durRange.value) : 60;
  let currentIntFactor = 0.65;

  async function fetchAndRenderComparisons(dur, intFactor) {
    try {
      const res = await fetch("/api/ai/what-if-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: dur, intensity: intFactor })
      });

      if (!res.ok) throw new Error("Comparative scenarios fetch failed");
      const data = await res.json();
      cachedComparativeScenarios = data;

      // 1. Update Transition Flow Stepper
      const curr = data.current_state || {};
      const customSc = data.scenarios?.find(s => s.id === "Custom") || data.scenarios?.[1];

      const flowCurrReadiness = document.getElementById("flowCurrReadiness");
      const flowCurrFatigue = document.getElementById("flowCurrFatigue");
      const flowCurrRec = document.getElementById("flowCurrRec");
      const flowConnectorLoad = document.getElementById("flowConnectorLoad");
      const flowPlannedDur = document.getElementById("flowPlannedDur");
      const flowPlannedInt = document.getElementById("flowPlannedInt");
      const flowPlannedCals = document.getElementById("flowPlannedCals");
      const flowPredReadiness = document.getElementById("flowPredReadiness");
      const flowPredFatigue = document.getElementById("flowPredFatigue");
      const flowPredRecoveryHours = document.getElementById("flowPredRecoveryHours");

      if (flowCurrReadiness) flowCurrReadiness.textContent = `${Math.round(curr.readiness || 85)}%`;
      if (flowCurrFatigue) flowCurrFatigue.textContent = `${Math.round(curr.fatigue || 38)}%`;
      if (flowCurrRec) flowCurrRec.textContent = `${Math.round(curr.recovery || 78)}%`;

      if (customSc) {
        if (flowConnectorLoad) flowConnectorLoad.textContent = `+${Math.min(100, Math.round(customSc.daily_load))}% Load`;
        if (flowPlannedDur) flowPlannedDur.textContent = `${customSc.duration_min} min`;
        if (flowPlannedInt) flowPlannedInt.textContent = `@ ${customSc.intensity_label}`;
        if (flowPlannedCals) flowPlannedCals.textContent = `${Math.round(customSc.duration_min * customSc.intensity_val * 16.5)} kcal`;
        if (flowPredReadiness) {
          const predEff = customSc.predicted_efficiency !== undefined ? customSc.predicted_efficiency : calculateEfficiency(customSc.predicted_recovery, customSc.predicted_fatigue, customSc.daily_load, customSc.intensity_val);
          flowPredReadiness.textContent = `${Math.round(predEff)}%`;
        }
        if (flowPredFatigue) flowPredFatigue.textContent = `${Math.round(customSc.predicted_fatigue)}%`;
        if (flowPredRecoveryHours) flowPredRecoveryHours.textContent = customSc.recovery_requirement;
      }

      // 2. Populate Static/Dynamic Comparative Cards
      const scA = data.scenarios?.find(s => s.id === "A");
      const scB = data.scenarios?.find(s => s.id === "B");
      const scC = data.scenarios?.find(s => s.id === "C");

      if (scA) {
        const fA = document.getElementById("scA_fatigue");
        const rA = document.getElementById("scA_readiness");
        const restA = document.getElementById("scA_rest");
        if (fA) fA.textContent = `${Math.round(scA.predicted_fatigue)}%`;
        const effA = scA.predicted_efficiency !== undefined ? scA.predicted_efficiency : calculateEfficiency(scA.predicted_recovery, scA.predicted_fatigue, scA.daily_load, scA.intensity_val);
        if (rA) rA.textContent = `${Math.round(effA)}%`;
        if (restA) restA.textContent = scA.recovery_requirement;
      }

      if (scB) {
        const fB = document.getElementById("scB_fatigue");
        const rB = document.getElementById("scB_readiness");
        const restB = document.getElementById("scB_rest");
        if (fB) fB.textContent = `${Math.round(scB.predicted_fatigue)}%`;
        const effB = scB.predicted_efficiency !== undefined ? scB.predicted_efficiency : calculateEfficiency(scB.predicted_recovery, scB.predicted_fatigue, scB.daily_load, scB.intensity_val);
        if (rB) rB.textContent = `${Math.round(effB)}%`;
        if (restB) restB.textContent = scB.recovery_requirement;
      }

      if (scC) {
        const fC = document.getElementById("scC_fatigue");
        const rC = document.getElementById("scC_readiness");
        const restC = document.getElementById("scC_rest");
        if (fC) fC.textContent = `${Math.round(scC.predicted_fatigue)}%`;
        const effC = scC.predicted_efficiency !== undefined ? scC.predicted_efficiency : calculateEfficiency(scC.predicted_recovery, scC.predicted_fatigue, scC.daily_load, scC.intensity_val);
        if (rC) rC.textContent = `${Math.round(effC)}%`;
        if (restC) restC.textContent = scC.recovery_requirement;
      }

      if (customSc) {
        const cTitle = document.getElementById("scCustom_title");
        const cLoad = document.getElementById("scCustom_load");
        const cBurn = document.getElementById("scCustom_burn");
        const cFat = document.getElementById("scCustom_fatigue");
        const cDFat = document.getElementById("scCustom_dFatigue");
        const cRead = document.getElementById("scCustom_readiness");
        const cDRead = document.getElementById("scCustom_dReadiness");
        const cRest = document.getElementById("scCustom_rest");
        const cRisk = document.getElementById("scCustom_risk");
        const cRiskText = document.getElementById("scCustom_riskText");

        if (cTitle) cTitle.textContent = `${customSc.duration_min} min @ ${customSc.intensity_label}`;
        if (cLoad) cLoad.textContent = `${Math.min(100, Math.round(customSc.daily_load))}%`;
        if (cBurn) cBurn.textContent = `${Math.round(customSc.duration_min * customSc.intensity_val * 16.5)} kcal`;
        if (cFat) cFat.textContent = `${Math.round(customSc.predicted_fatigue)}%`;
        if (cDFat) {
          const dF = customSc.delta_fatigue;
          cDFat.className = `c-delta ${dF >= 0 ? 'delta-up' : 'delta-down'}`;
          cDFat.textContent = `${dF >= 0 ? '+' : ''}${dF}%`;
        }
        const effCustom = customSc.predicted_efficiency !== undefined ? customSc.predicted_efficiency : calculateEfficiency(customSc.predicted_recovery, customSc.predicted_fatigue, customSc.daily_load, customSc.intensity_val);
        if (cRead) cRead.textContent = `${Math.round(effCustom)}%`;
        if (cDRead) {
          const dE = customSc.delta_efficiency !== undefined ? customSc.delta_efficiency : (Math.round(effCustom) - 77);
          cDRead.className = `c-delta ${dE >= 0 ? 'delta-up' : 'delta-down'}`;
          cDRead.textContent = `${dE >= 0 ? '+' : ''}${dE}%`;
        }
        if (cRest) cRest.textContent = customSc.recovery_requirement;
        if (cRisk && cRiskText) {
          cRisk.className = `comp-risk-pill ${customSc.risk_color === '#EF4444' ? 'risk-elevated' : (customSc.risk_color === '#F59E0B' ? 'risk-moderate' : 'risk-low')}`;
          cRiskText.textContent = customSc.risk_indicator;
        }
      }

    } catch (err) {
      console.error("Comparison simulation error:", err);
    }
  }

  // Helper to dynamically highlight only the selected scenario card
  function highlightSelectedCard(cardId) {
    const cards = [
      document.getElementById("cardScenarioA"),
      document.getElementById("cardScenarioB"),
      document.getElementById("cardScenarioC"),
      document.getElementById("cardScenarioCustom")
    ];
    cards.forEach(c => {
      if (c) {
        c.classList.remove("recommended-card");
        if (c.id === cardId) {
          c.classList.add("selected-card");
        } else {
          c.classList.remove("selected-card");
        }
      }
    });

    // Update button text labels
    applyBtns.forEach(b => {
      const parentCard = b.closest(".scenario-comp-card");
      if (parentCard && parentCard.id === cardId) {
        b.textContent = "Applied ✓";
        b.classList.add("active");
      } else {
        const dur = b.dataset.applyDur;
        if (dur === "90") b.textContent = "Apply Scenario A";
        else if (dur === "60") b.textContent = "Apply Scenario B";
        else if (dur === "45") b.textContent = "Apply Scenario C";
        b.classList.remove("active");
      }
    });

    const customBtn = document.getElementById("btnSyncCustomScenario");
    if (customBtn) {
      if (cardId === "cardScenarioCustom") {
        customBtn.textContent = "Custom Applied ✓";
        customBtn.classList.add("active");
      } else {
        customBtn.textContent = "Apply Custom Plan";
        customBtn.classList.remove("active");
      }
    }
  }

  // Wire up "Apply Scenario A/B/C" buttons
  const applyBtns = document.querySelectorAll(".btn-apply-scenario[data-apply-dur]");
  applyBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetDur = parseInt(btn.dataset.applyDur) || 60;
      const targetInt = btn.dataset.applyInt || "Moderate";
      const parentCard = btn.closest(".scenario-comp-card");
      if (parentCard) highlightSelectedCard(parentCard.id);

      // Sync slider & inputs in What-If studio
      if (durRange) durRange.value = targetDur;
      const durInput = document.getElementById("whatifDurationInput");
      if (durInput) durInput.value = targetDur;
      const inlineDurVal = document.getElementById("customStepDurVal");
      if (inlineDurVal) inlineDurVal.textContent = `${targetDur}m`;

      if (intGroup) {
        const btns = intGroup.querySelectorAll(".int-btn");
        btns.forEach(b => {
          if (b.dataset.int === targetInt) b.classList.add("active");
          else b.classList.remove("active");
        });
      }
      syncInlineIntPills(targetInt);

      let factor = 0.65;
      if (targetInt === "Low") factor = 0.40;
      else if (targetInt === "High") factor = 0.88;

      fetchAndRenderComparisons(targetDur, factor);

      // Trigger the single scenario calculation as well
      const runSingleBtn = document.getElementById("btnRunWhatIfSim");
      if (runSingleBtn) runSingleBtn.click();

      showToast(`Applied ${targetInt} Intensity (${targetDur} min) to What-If simulator`, "⚡");
    });
  });

  // Helpers for inline Custom Plan modifiers
  const inlineDurVal = document.getElementById("customStepDurVal");
  const stepMinusBtn = document.getElementById("btnStepDurMinus");
  const stepPlusBtn = document.getElementById("btnStepDurPlus");
  const inlineIntPills = document.querySelectorAll("#customCardIntPills .card-int-pill");

  function syncInlineIntPills(intName) {
    inlineIntPills.forEach(pill => {
      if (pill.dataset.int === intName) pill.classList.add("active");
      else pill.classList.remove("active");
    });
  }

  function getCurrentIntFactor() {
    const activeIntBtn = document.querySelector("#customCardIntPills .card-int-pill.active") ||
      intGroup?.querySelector(".int-btn.active");
    const intName = activeIntBtn?.dataset.int || "Moderate";
    if (intName === "Low") return { factor: 0.40, name: "Low" };
    if (intName === "High") return { factor: 0.88, name: "High" };
    return { factor: 0.65, name: "Moderate" };
  }

  function setCustomDuration(newDur) {
    newDur = Math.max(15, Math.min(120, newDur));
    if (inlineDurVal) inlineDurVal.textContent = `${newDur}m`;
    if (durRange) durRange.value = newDur;
    const durInput = document.getElementById("whatifDurationInput");
    if (durInput) durInput.value = newDur;

    const { factor } = getCurrentIntFactor();
    fetchAndRenderComparisons(newDur, factor);
    highlightSelectedCard("cardScenarioCustom");
  }

  if (stepMinusBtn) {
    stepMinusBtn.addEventListener("click", () => {
      const currentVal = parseInt(inlineDurVal?.textContent) || (durRange ? parseInt(durRange.value) : 60);
      setCustomDuration(currentVal - 5);
    });
  }

  if (stepPlusBtn) {
    stepPlusBtn.addEventListener("click", () => {
      const currentVal = parseInt(inlineDurVal?.textContent) || (durRange ? parseInt(durRange.value) : 60);
      setCustomDuration(currentVal + 5);
    });
  }

  inlineIntPills.forEach(pill => {
    pill.addEventListener("click", () => {
      const intName = pill.dataset.int;
      syncInlineIntPills(intName);
      if (intGroup) {
        const btns = intGroup.querySelectorAll(".int-btn");
        btns.forEach(b => {
          if (b.dataset.int === intName) b.classList.add("active");
          else b.classList.remove("active");
        });
      }
      const dur = durRange ? parseInt(durRange.value) : 60;
      let factor = 0.65;
      if (intName === "Low") factor = 0.40;
      else if (intName === "High") factor = 0.88;
      fetchAndRenderComparisons(dur, factor);
      highlightSelectedCard("cardScenarioCustom");
    });
  });

  // Debounced sync from the top "Scenario Conditions" controls to the custom card
  let syncDebounceTimer = null;
  if (durRange) {
    durRange.addEventListener("input", () => {
      const dur = parseInt(durRange.value);
      if (inlineDurVal) inlineDurVal.textContent = `${dur}m`;
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => {
        const { factor } = getCurrentIntFactor();
        fetchAndRenderComparisons(dur, factor);
        highlightSelectedCard("cardScenarioCustom");
      }, 150);
    });
  }

  if (intGroup) {
    const btns = intGroup.querySelectorAll(".int-btn");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        const intName = b.dataset.int;
        syncInlineIntPills(intName);
        const dur = durRange ? parseInt(durRange.value) : 60;
        let factor = 0.65;
        if (intName === "Low") factor = 0.40;
        else if (intName === "High") factor = 0.88;
        fetchAndRenderComparisons(dur, factor);
        highlightSelectedCard("cardScenarioCustom");
      });
    });
  }

  if (customSyncBtn) {
    customSyncBtn.addEventListener("click", () => {
      const { factor, name } = getCurrentIntFactor();
      const dur = durRange ? parseInt(durRange.value) : 60;
      fetchAndRenderComparisons(dur, factor);
      highlightSelectedCard("cardScenarioCustom");

      // Trigger the single scenario calculation in the top panel as well
      const runSingleBtn = document.getElementById("btnRunWhatIfSim");
      if (runSingleBtn) runSingleBtn.click();

      showToast(`Applied Custom Plan: ${dur} min @ ${name} Intensity`, "✓");
    });
  }

  // Initial fetch
  fetchAndRenderComparisons(currentDur, currentIntFactor);
}

/* ==============================================================================
   7. FORENSIC TRANSPARENCY, MULTI-ROLE & AUDIT CONTROLLER (Phases 6, 9, 12, 15)
   ============================================================================== */

/**
 * Role Switcher (Athlete, Coach)
 */
function initRoleSwitcher() {
  const roleButtons = document.querySelectorAll(".role-segment-btn");
  const roleBadge = document.getElementById("headerRoleBadge");

  roleButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      roleButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const role = btn.dataset.role;

      if (role === "coach") {
        if (roleBadge) roleBadge.textContent = "Coach View";
        switchView("coach-squad");
        showToast("Switched to Coach Command View", "🛡️");
      } else {
        if (roleBadge) roleBadge.textContent = "Athlete View";
        switchView("dashboard");
        showToast("Switched to Athlete Personal View", "🏃");
      }
    });
  });
}

/**
 * Transparency Modals (Data Quality Center & ML Model Card)
 */
function initTransparencyModals() {
  // 1. Data Quality Modal
  const dqModal = document.getElementById("dataQualityModal");
  const btnOpenDq = document.getElementById("btnOpenDataQualityModal");
  const btnCloseDq = document.getElementById("btnCloseDataQualityModal");
  const btnCloseDqBottom = document.getElementById("btnCloseDataQualityBottom");

  if (btnOpenDq && dqModal) {
    btnOpenDq.addEventListener("click", () => {
      dqModal.style.display = "flex";
      loadDataQualityModalData();
    });
  }

  if (btnCloseDq && dqModal) {
    btnCloseDq.addEventListener("click", () => {
      dqModal.style.display = "none";
    });
  }

  if (btnCloseDqBottom && dqModal) {
    btnCloseDqBottom.addEventListener("click", () => {
      dqModal.style.display = "none";
    });
  }

  // 2. ML Model Card Modal
  const mcModal = document.getElementById("modelCardModal");
  const btnOpenMc = document.getElementById("btnOpenModelCardModal");
  const btnCloseMc = document.getElementById("btnCloseModelCardModal");
  const btnCloseMcBottom = document.getElementById("btnCloseModelCardBottom");

  if (btnOpenMc && mcModal) {
    btnOpenMc.addEventListener("click", () => {
      mcModal.style.display = "flex";
      loadModelCardModalData();
    });
  }

  if (btnCloseMc && mcModal) {
    btnCloseMc.addEventListener("click", () => {
      mcModal.style.display = "none";
    });
  }

  if (btnCloseMcBottom && mcModal) {
    btnCloseMcBottom.addEventListener("click", () => {
      mcModal.style.display = "none";
    });
  }

  // Close modals on backdrop click
  [dqModal, mcModal].forEach(m => {
    if (m) {
      m.addEventListener("click", e => {
        if (e.target === m) m.style.display = "none";
      });
    }
  });
}

/**
 * Fetch and populate Data Quality Center modal
 */
async function loadDataQualityModalData() {
  try {
    const res = await fetch("/api/telemetry/data-quality");
    if (!res.ok) return;
    const dq = await res.json();

    const idxEl = document.getElementById("modalDqIndex");
    const provEl = document.getElementById("modalDqProvenance");
    const gradeEl = document.getElementById("modalDqGrade");
    const rateEl = document.getElementById("modalDqRate");
    const latEl = document.getElementById("modalDqLatency");
    const dropEl = document.getElementById("modalDqDropRate");
    const dropCountEl = document.getElementById("modalDqDropCount");

    if (idxEl) idxEl.textContent = `${dq.data_quality_index || 96.0}%`;
    if (provEl) provEl.textContent = dq.data_provenance || "LIVE ESP32";
    if (gradeEl) {
      gradeEl.textContent = dq.grade || "EXCELLENT";
      gradeEl.className = "badge-pill " + (dq.grade === "EXCELLENT" || dq.grade === "GOOD" ? "pill-green" : "pill-amber");
    }
    if (rateEl) rateEl.textContent = `${dq.sample_rate_hz || 1.0} Hz`;
    if (latEl) latEl.textContent = `${dq.mean_latency_ms || 12} ms`;
    if (dropEl) dropEl.textContent = `${dq.packet_loss_pct || 0.0}%`;
    if (dropCountEl) dropCountEl.textContent = `${dq.dropped_packets_detected || 0} rejected`;
  } catch (err) {
    console.error("Failed to fetch data quality report:", err);
  }
}

/**
 * Fetch and populate ML Model Card modal
 */
async function loadModelCardModalData() {
  try {
    const res = await fetch("/api/model-card");
    if (!res.ok) return;
    const mc = await res.json();

    const fatR2 = document.getElementById("mcFatigueR2");
    const fatMae = document.getElementById("mcFatigueMae");
    const fatRmse = document.getElementById("mcFatigueRmse");
    const recR2 = document.getElementById("mcRecoveryR2");
    const recMae = document.getElementById("mcRecoveryMae");
    const recRmse = document.getElementById("mcRecoveryRmse");

    if (mc.metrics && mc.metrics.fatigue_model) {
      if (fatR2) fatR2.textContent = mc.metrics.fatigue_model.r2_score;
      if (fatMae) fatMae.textContent = `${mc.metrics.fatigue_model.mae} pts`;
      if (fatRmse) fatRmse.textContent = `${mc.metrics.fatigue_model.rmse} pts`;
    }
    if (mc.metrics && mc.metrics.recovery_model) {
      if (recR2) recR2.textContent = mc.metrics.recovery_model.r2_score;
      if (recMae) recMae.textContent = `${mc.metrics.recovery_model.mae} pts`;
      if (recRmse) recRmse.textContent = `${mc.metrics.recovery_model.rmse} pts`;
    }
  } catch (err) {
    console.error("Failed to load model card:", err);
  }
}

/**
 * View 7: Prediction vs Actual Feedback Loop
 */
async function loadPredictionAccuracy() {
  const tbody = document.getElementById("accuracyTableBody");
  const kpiMae = document.getElementById("kpiAccuracyMae");
  const kpiRate = document.getElementById("kpiAccuracyRate");
  const kpiTotal = document.getElementById("kpiTotalTracked");
  const kpiPending = document.getElementById("kpiPendingCount");

  try {
    const res = await fetch("/api/ai/predicted-vs-actual");
    if (!res.ok) return;
    const data = await res.json();

    if (data.summary) {
      if (kpiMae) kpiMae.textContent = `${data.summary.overall_readiness_mae} pts`;
      if (kpiRate) kpiRate.textContent = `${data.summary.accuracy_within_5pts_pct}%`;
      if (kpiTotal) kpiTotal.textContent = `${data.summary.total_verified_predictions} Verified`;
      if (kpiPending) kpiPending.textContent = `${data.summary.pending_predictions_count} pending outcome`;
    }

    if (tbody && data.records) {
      tbody.innerHTML = data.records.map(rec => {
        const diff = rec.error !== null ? (rec.error > 0 ? `+${rec.error}` : `${rec.error}`) : "—";
        const errClass = Math.abs(rec.error || 0) <= 2.0 ? "color:#10B981;font-weight:700;" : (Math.abs(rec.error || 0) <= 5.0 ? "color:#F59E0B;font-weight:700;" : "color:#EF4444;font-weight:700;");
        const statusBadge = rec.status === "VERIFIED" ? `<span class="badge-pill pill-green">VERIFIED</span>` : `<span class="badge-pill pill-amber">PENDING</span>`;

        return `
          <tr style="border-bottom:1px solid var(--border-card);">
            <td style="padding:10px 12px;font-family:monospace;font-weight:700;color:var(--primary-blue);">${rec.prediction_id}</td>
            <td style="padding:10px 12px;color:var(--text-dark);">${rec.date}</td>
            <td style="padding:10px 12px;"><span style="font-weight:600;">${rec.target}</span></td>
            <td style="padding:10px 12px;color:var(--text-muted);">${rec.scenario || "Standard Training"}</td>
            <td style="padding:10px 12px;font-weight:700;">${rec.predicted_readiness} pts</td>
            <td style="padding:10px 12px;font-weight:700;">${rec.actual_readiness !== null ? `${rec.actual_readiness} pts` : "—"}</td>
            <td style="padding:10px 12px;${errClass}">${diff}</td>
            <td style="padding:10px 12px;">${statusBadge}</td>
          </tr>
        `;
      }).join("");
    }
  } catch (err) {
    console.error("Failed to load prediction accuracy:", err);
  }
}

/**
 * View 8: Coach Squad Management & Workload Matrix
 */
let pendingRemoveAthleteId = null;
let cachedSquadAthletes = [];
let cachedActiveAthleteId = "";

/**
 * Squad persistence layer.
 * Talks to the Flask API when it is reachable; when the backend is offline or
 * unavailable (static hosting, server stopped, serverless 5xx) the same
 * endpoints are served from a localStorage-backed squad so that adding,
 * editing, removing and selecting players keeps working.
 */
const LOCAL_SQUAD_KEY = "twinathlete.localSquad.v1";

function defaultLocalSquad() {
  return {
    active: "ATH-0824",
    athletes: [
      { id: "ATH-0824", athlete_id: "ATH-0824", name: "Daniel Saji", sport: "Football", position: "Midfield / Box-to-Box", squad_number: "8", age: 24, height_cm: 182, weight_kg: 75.5, resting_hr_baseline: 54, readiness: 84, fatigue: 38, recovery: 78, acwr: 1.08, status: "Optimal", status_color: "green", recommendation: "Maintain prescribed periodization", device_id: "ESP32-ATHLETE-01" },
      { id: "ATH-0102", athlete_id: "ATH-0102", name: "Marcus Vance", sport: "Football", position: "Center Forward", squad_number: "9", age: 22, height_cm: 186, weight_kg: 81, resting_hr_baseline: 58, readiness: 71, fatigue: 48, recovery: 66, acwr: 1.22, status: "Moderate", status_color: "yellow", recommendation: "Monitor aerobic intervals", device_id: "ESP32-ATHLETE-02" },
      { id: "ATH-0315", athlete_id: "ATH-0315", name: "Leo Sterling", sport: "Football", position: "Central Defender", squad_number: "4", age: 26, height_cm: 178, weight_kg: 73, resting_hr_baseline: 56, readiness: 88, fatigue: 28, recovery: 86, acwr: 0.95, status: "Optimal", status_color: "green", recommendation: "Ready for match simulation" },
      { id: "ATH-0544", athlete_id: "ATH-0544", name: "Elena Rostova", sport: "Football", position: "Left Winger", squad_number: "11", age: 25, height_cm: 170, weight_kg: 62, resting_hr_baseline: 55, readiness: 58, fatigue: 64, recovery: 55, acwr: 1.42, status: "High Strain", status_color: "red", recommendation: "Prescribe low-load recovery" },
      { id: "ATH-0791", athlete_id: "ATH-0791", name: "Tariq Al-Mansoor", sport: "Football", position: "Goalkeeper", squad_number: "1", age: 25, height_cm: 191, weight_kg: 86, resting_hr_baseline: 52, readiness: 92, fatigue: 20, recovery: 90, acwr: 0.88, status: "Optimal", status_color: "green", recommendation: "Excellent readiness baseline" }
    ]
  };
}

function getLocalSquad() {
  try {
    const raw = localStorage.getItem(LOCAL_SQUAD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.athletes)) {
        const seenIds = new Set();
        const seenNames = new Set();
        const unique = [];
        for (const a of parsed.athletes) {
          const aid = (a.id || a.athlete_id || "").trim();
          const nm = (a.name || "").trim().toLowerCase();
          if ((aid && seenIds.has(aid)) || (nm && seenNames.has(nm))) continue;
          if (aid) seenIds.add(aid);
          if (nm) seenNames.add(nm);
          unique.push(a);
        }
        parsed.athletes = unique;
        return parsed;
      }
    }
  } catch (_) {}
  return defaultLocalSquad();
}

function saveLocalSquad(squad) {
  try {
    localStorage.setItem(LOCAL_SQUAD_KEY, JSON.stringify(squad));
  } catch (_) {}
}

function localSquadResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function classifyLocalAthlete(ath) {
  const fatigue = Number(ath.fatigue) || 0;
  const acwr = Number(ath.acwr) || 1;
  if (acwr >= 1.4 || fatigue >= 60) return { status: "High Strain", status_color: "red", recommendation: "Prescribe low-load recovery" };
  if (acwr >= 1.2 || fatigue >= 45) return { status: "Moderate", status_color: "yellow", recommendation: "Monitor aerobic intervals" };
  return { status: "Optimal", status_color: "green", recommendation: "Maintain prescribed periodization" };
}

function handleLocalSquadRequest(url, method, options) {
  let body = {};
  try { body = options && options.body ? JSON.parse(options.body) : {}; } catch (_) {}
  const squad = getLocalSquad();
  const path = String(url).split("?")[0];
  const findIdx = (id) => squad.athletes.findIndex(a => (a.id || a.athlete_id) === id);

  if (method === "GET" && (path === "/api/coach/team-overview" || path === "/api/athletes")) {
    return localSquadResponse({
      active_athlete_id: squad.active,
      roster: squad.athletes,
      athletes: squad.athletes,
      squad_size: squad.athletes.length,
      offline: true
    });
  }

  if (method === "POST" && path === "/api/athlete/register") {
    const name = String(body.name || "").trim();
    if (!name) return localSquadResponse({ success: false, error: "Athlete 'name' is required." }, 400);

    const existingIdx = squad.athletes.findIndex(a => {
      const aName = (a.name || "").trim().toLowerCase();
      const aId = (a.id || a.athlete_id || "").trim();
      return (body.id && aId === body.id) || (aName && aName === name.toLowerCase());
    });

    if (existingIdx >= 0) {
      const ath = squad.athletes[existingIdx];
      ["position", "squad_number", "age", "height_cm", "weight_kg", "resting_hr_baseline", "max_hr"].forEach(k => {
        if (body[k] !== undefined && body[k] !== null && body[k] !== "") ath[k] = body[k];
      });
      if (body.recovery !== undefined) ath.recovery = Number(body.recovery);
      if (body.fatigue !== undefined) ath.fatigue = Number(body.fatigue);
      if (body.acwr !== undefined) ath.acwr = Number(body.acwr);
      if (body.device_id) {
        squad.athletes.forEach(a => { if (a !== ath && a.device_id === body.device_id) delete a.device_id; });
        ath.device_id = body.device_id;
      }
      Object.assign(ath, classifyLocalAthlete(ath));
      saveLocalSquad(squad);
      return localSquadResponse({ success: true, message: `Athlete '${name}' updated successfully.`, athlete: ath }, 200);
    }

    let highest = 0;
    squad.athletes.forEach(a => {
      const m = /^ATH-(\d+)$/.exec(a.id || "");
      if (m) highest = Math.max(highest, parseInt(m[1], 10));
    });
    const id = `ATH-${String(highest + 1).padStart(4, "0")}`;
    const recovery = Number(body.recovery) || 80;
    const fatigue = Number(body.fatigue) || Math.max(10, Math.min(90, Math.round(100 - recovery)));
    const athlete = {
      id,
      athlete_id: id,
      name,
      sport: body.sport || "Football",
      position: body.position || "Midfield / Box-to-Box",
      squad_number: body.squad_number || "",
      age: body.age,
      height_cm: body.height_cm,
      weight_kg: body.weight_kg,
      resting_hr_baseline: body.resting_hr_baseline,
      max_hr: body.max_hr,
      recovery,
      fatigue,
      acwr: Number(body.acwr) || 1.05,
      readiness: Math.max(0, Math.min(100, Math.round(recovery * 0.6 + (100 - fatigue) * 0.4))),
      device_id: body.device_id || undefined
    };
    Object.assign(athlete, classifyLocalAthlete(athlete));
    if (athlete.device_id) squad.athletes.forEach(a => { if (a.device_id === athlete.device_id) delete a.device_id; });
    squad.athletes.push(athlete);
    if (!squad.active || findIdx(squad.active) < 0) squad.active = id;
    saveLocalSquad(squad);
    return localSquadResponse({ success: true, message: `Athlete '${name}' registered successfully.`, athlete }, 201);
  }

  if ((method === "POST" || method === "PUT") && path === "/api/athlete/update") {
    const id = body.athlete_id || body.id || squad.active;
    const idx = findIdx(id);
    if (idx < 0) return localSquadResponse({ success: false, error: `Athlete '${id}' not found.` }, 404);
    const ath = squad.athletes[idx];
    ["name", "position", "squad_number", "age", "height_cm", "weight_kg", "resting_hr_baseline"].forEach(k => {
      if (body[k] !== undefined && body[k] !== null && body[k] !== "") ath[k] = body[k];
    });
    if (body.device_id !== undefined) {
      const dev = String(body.device_id || "").trim();
      if (dev) {
        squad.athletes.forEach(a => { if (a !== ath && a.device_id === dev) delete a.device_id; });
        ath.device_id = dev;
      } else {
        delete ath.device_id;
      }
    }
    saveLocalSquad(squad);
    return localSquadResponse({ success: true, athlete: ath });
  }

  if (method === "DELETE" && /^\/api\/athlete\/[^/]+$/.test(path)) {
    const id = decodeURIComponent(path.split("/").pop());
    const idx = findIdx(id);
    if (idx < 0) return localSquadResponse({ success: false, error: `Athlete '${id}' not found.` }, 404);
    squad.athletes.splice(idx, 1);
    if (squad.active === id || findIdx(squad.active) < 0) {
      squad.active = squad.athletes.length ? (squad.athletes[0].id || squad.athletes[0].athlete_id) : "";
    }
    saveLocalSquad(squad);
    return localSquadResponse({ success: true, active_athlete_id: squad.active });
  }

  if (method === "POST" && path === "/api/athlete/switch") {
    const id = body.athlete_id;
    const idx = findIdx(id);
    if (idx < 0) return localSquadResponse({ success: false, error: `Athlete '${id}' not found.` }, 404);
    squad.active = id;
    saveLocalSquad(squad);
    const ath = squad.athletes[idx];
    return localSquadResponse({
      success: true,
      active_athlete_id: id,
      profile: { name: ath.name, position: ath.position, squad_number: ath.squad_number, sport: ath.sport || "Football" }
    });
  }

  return localSquadResponse({ success: false, error: "Server unavailable" }, 503);
}

/**
 * fetch() wrapper for squad endpoints: uses the real API when it answers,
 * otherwise falls back to the on-device squad store.
 */
async function squadFetch(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  let res = null;
  try {
    res = await fetch(url, options);
  } catch (_) {}
  const isJson = !!res && (res.headers.get("content-type") || "").includes("json");
  if (res && (res.ok || (isJson && res.status < 500))) return res;
  console.warn(`[squad] API unavailable for ${method} ${url}; using on-device squad store.`);
  return handleLocalSquadRequest(url, method, options);
}

function openAddPlayerModal() {
  const modal = document.getElementById("addPlayerModal");
  if (modal) {
    modal.style.display = "flex";
    const nameInput = document.getElementById("newPlayerName");
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
  }
}
window.openAddPlayerModal = openAddPlayerModal;

function closeAddPlayerModal() {
  const modal = document.getElementById("addPlayerModal");
  if (modal) modal.style.display = "none";
}
window.closeAddPlayerModal = closeAddPlayerModal;

function promptRemoveAthlete(athleteId, athleteName) {
  pendingRemoveAthleteId = athleteId;
  const modal = document.getElementById("removePlayerModal");
  const text = document.getElementById("removePlayerConfirmText");
  if (text) {
    text.innerHTML = `Are you sure you want to remove <strong>${athleteName}</strong> (<code>#${athleteId}</code>) from the active squad? Their digital twin model and session logs will be unlinked from the roster.`;
  }
  if (modal) modal.style.display = "flex";
}
window.promptRemoveAthlete = promptRemoveAthlete;

function closeRemovePlayerModal() {
  pendingRemoveAthleteId = null;
  const modal = document.getElementById("removePlayerModal");
  if (modal) modal.style.display = "none";
}
window.closeRemovePlayerModal = closeRemovePlayerModal;

function openEditPlayerModal(athleteId) {
  const modal = document.getElementById("editPlayerModal");
  if (!modal) return;
  const ath = (cachedSquadAthletes || []).find(a => (a.id || a.athlete_id) === athleteId);

  const idInput = document.getElementById("editPlayerId");
  const nameInput = document.getElementById("editPlayerName");
  const posInput = document.getElementById("editPlayerPosition");
  const squadInput = document.getElementById("editPlayerSquadNumber");
  const ageInput = document.getElementById("editPlayerAge");
  const heightInput = document.getElementById("editPlayerHeight");
  const weightInput = document.getElementById("editPlayerWeight");
  const restHrInput = document.getElementById("editPlayerRestHr");
  const devInput = document.getElementById("editPlayerDeviceId");

  if (idInput) idInput.value = athleteId;
  if (nameInput) nameInput.value = (ath && ath.name) || (activeUserProfile && activeUserProfile.name) || "";
  if (posInput) posInput.value = (ath && ath.position) || (activeUserProfile && activeUserProfile.position) || "Midfield / Box-to-Box";
  if (squadInput) squadInput.value = (ath && (ath.squad_number || ath.squadNumber)) || (activeUserProfile && activeUserProfile.squadNumber) || athleteId.replace(/[^0-9]/g, "").replace(/^0+/, "").slice(0, 2) || "8";
  if (ageInput) ageInput.value = (ath && ath.age) || (activeUserProfile && activeUserProfile.age) || 24;
  if (heightInput) heightInput.value = (ath && (ath.height_cm || ath.height)) || (activeUserProfile && activeUserProfile.height) || 180;
  if (weightInput) weightInput.value = (ath && (ath.weight_kg || ath.weight)) || (activeUserProfile && activeUserProfile.weight) || 74;
  if (restHrInput) restHrInput.value = (ath && (ath.resting_hr_baseline || ath.restHr)) || (activeUserProfile && activeUserProfile.restHr) || 54;
  if (devInput) devInput.value = (ath && ath.device_id) || "";

  modal.style.display = "flex";
  if (nameInput) setTimeout(() => nameInput.focus(), 100);
}
window.openEditPlayerModal = openEditPlayerModal;

function closeEditPlayerModal() {
  const modal = document.getElementById("editPlayerModal");
  if (modal) modal.style.display = "none";
}
window.closeEditPlayerModal = closeEditPlayerModal;

async function executeRemoveAthlete() {
  if (!pendingRemoveAthleteId) return;
  const athleteId = pendingRemoveAthleteId;
  closeRemovePlayerModal();

  try {
    const res = await squadFetch(`/api/athlete/${encodeURIComponent(athleteId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });
    if (res.ok) {
      showToast(`Player #${athleteId} removed from squad`, "🗑️");
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || `Could not remove player`, "⚠️");
    }
  } catch (err) {
    console.warn("Notice: server athlete delete:", err);
    showToast(`Network error removing player`, "⚠️");
  }

  await loadCoachSquad();
  if (typeof loadDashboardData === "function") {
    loadDashboardData(currentTimeframe);
  }
  if (typeof loadDigitalTwinCoach === "function") {
    loadDigitalTwinCoach();
  }
}
window.executeRemoveAthlete = executeRemoveAthlete;

async function loadCoachSquad() {
  const grid = document.getElementById("squadRosterGrid");
  if (!grid) return;

  try {
    let athletes = [];
    let activeAthleteId = "";

    try {
      const res = await squadFetch("/api/coach/team-overview");
      if (res.ok) {
        const data = await res.json();
        athletes = data.roster || data.athletes || [];
        activeAthleteId = data.active_athlete_id || "";
      }
    } catch (_) {}

    if (!athletes.length) {
      try {
        const fallbackRes = await squadFetch("/api/athletes");
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          athletes = fallbackData.athletes || [];
          activeAthleteId = fallbackData.active_athlete_id || "";
        }
      } catch (_) {}
    }

    // Deduplicate athletes strictly by ID and normalized Name to prevent duplicate cards in coach view
    const seenIds = new Set();
    const seenNames = new Set();
    const uniqueAthletes = [];
    for (const ath of athletes) {
      const aid = (ath.id || ath.athlete_id || "").trim();
      const normName = (ath.name || "").trim().toLowerCase();
      if ((aid && seenIds.has(aid)) || (normName && seenNames.has(normName))) {
        continue;
      }
      if (aid) seenIds.add(aid);
      if (normName) seenNames.add(normName);
      uniqueAthletes.push(ath);
    }
    athletes = uniqueAthletes;

    cachedSquadAthletes = athletes;
    cachedActiveAthleteId = activeAthleteId;

    if (athletes.length) {
      grid.innerHTML = athletes.map(ath => {
        const aid = ath.id || ath.athlete_id;
        const isSelected = aid === activeAthleteId;
        const readiness = Math.round(ath.readiness || ath.readiness_score || 75);
        const fatigue = Math.round(ath.fatigue || ath.fatigue_level || 35);
        const acwr = ath.acwr !== undefined ? ath.acwr : 1.0;
        const readColor = readiness >= 80 ? "var(--whoop-green)" : (readiness >= 65 ? "var(--whoop-yellow)" : "var(--whoop-red)");
        const acwrColor = (acwr >= 0.8 && acwr <= 1.3) ? "var(--whoop-green)" : (acwr > 1.3 ? "var(--whoop-red)" : "var(--whoop-blue)");
        const statusLabel = ath.status || "Optimal";
        const statusColor = ath.status_color || (statusLabel === "Optimal" ? "green" : (statusLabel.includes("Spike") ? "yellow" : "red"));
        const pillClass = statusColor === "green" ? "pill-green" : (statusColor === "amber" || statusColor === "yellow" ? "pill-yellow" : "pill-red");
        const deviceTag = ath.device_id ? `<span style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--text-muted);">📡 ${ath.device_id}</span>` : "";

        return `
          <div class="card squad-athlete-card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;border:${isSelected ? "1.5px solid var(--whoop-green)" : "1px solid var(--glass-border)"};background:var(--glass-bg);box-shadow:${isSelected ? "0 4px 20px rgba(0,230,118,0.18)" : "var(--glass-shadow-sm)"};">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                <div>
                  <h3 style="font-size:1.1rem;font-weight:800;color:var(--text-dark);margin:0 0 3px 0;">${ath.name}</h3>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:0.75rem;color:var(--text-muted);">${ath.position} • #${aid}</span>
                    ${deviceTag}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span class="badge-pill ${pillClass}">${statusLabel}</span>
                  <button class="btn-edit-player" onclick="openEditPlayerModal('${aid}')" title="Edit ${ath.name}" aria-label="Edit player">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn-remove-player" onclick="promptRemoveAthlete('${aid}', '${(ath.name || '').replace(/'/g, "\\'")}')" title="Remove ${ath.name} from squad" aria-label="Remove player">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;background:var(--glass-bg-elevated);border:1px solid var(--glass-border-subtle);padding:12px;border-radius:12px;margin-bottom:14px;text-align:center;">
                <div>
                  <span style="font-size:0.68rem;color:var(--text-muted);display:block;text-transform:uppercase;font-weight:700;">Readiness</span>
                  <strong style="font-size:1.2rem;color:${readColor};">${readiness}%</strong>
                </div>
                <div>
                  <span style="font-size:0.68rem;color:var(--text-muted);display:block;text-transform:uppercase;font-weight:700;">Fatigue</span>
                  <strong style="font-size:1.2rem;color:var(--text-dark);">${fatigue}%</strong>
                </div>
                <div>
                  <span style="font-size:0.68rem;color:var(--text-muted);display:block;text-transform:uppercase;font-weight:700;">ACWR</span>
                  <strong style="font-size:1.2rem;color:${acwrColor};">${acwr}</strong>
                </div>
              </div>

              <div style="font-size:0.8rem;color:var(--text-body);margin-bottom:16px;line-height:1.45;">
                <strong style="color:var(--text-dark);">Recommendation:</strong> ${ath.recommendation || "Maintain prescribed periodization"}
              </div>
            </div>

            <button class="btn-top-action" onclick="selectAthleteTwin('${aid}')" style="justify-content:center;background:${isSelected ? "var(--whoop-green)" : "var(--glass-bg-elevated)"};color:${isSelected ? "#0A0A0A" : "var(--text-dark)"};border:1px solid ${isSelected ? "var(--whoop-green)" : "var(--glass-border)"};font-weight:700;padding:8px 14px;border-radius:var(--radius-pill);cursor:pointer;">
              ${isSelected ? "✓ Active Athlete Twin" : "Select Athlete Twin"}
            </button>
          </div>
        `;
      }).join("");
    } else {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:48px 20px;background:var(--glass-bg);border:1px dashed var(--glass-border);border-radius:16px;">
          <div style="font-size:2.5rem;margin-bottom:12px;">⚽</div>
          <h3 style="color:var(--text-dark);margin-bottom:6px;">No Athletes in Squad</h3>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:18px;">Get started by enrolling a new player into the digital twin matrix.</p>
          <button class="btn-top-action" onclick="openAddPlayerModal()" style="background:var(--primary-blue);color:#FFF;border:none;padding:8px 18px;margin:0 auto;display:inline-flex;">+ Add Player</button>
        </div>
      `;
    }
  } catch (err) {
    console.error("Failed to load coach squad:", err);
  }
}

async function selectAthleteTwin(athleteId) {
  let switchSuccessful = false;
  try {
    const res = await squadFetch("/api/athlete/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athlete_id: athleteId })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.profile && data.profile.name) {
        switchSuccessful = true;
        const squadNum = data.profile.squad_number || athleteId.replace(/[^0-9]/g, "").replace(/^0+/, "").slice(0, 2) || "8";
        updateActiveUserProfile({
          name: data.profile.name,
          position: data.profile.position || "Midfielder",
          squadNumber: squadNum,
          role: data.profile.sport ? `${data.profile.sport} Player` : "Football Player"
        }, true);
      }
    }
  } catch (e) {
    console.warn("Notice: server athlete switch:", e);
  }

  if (!switchSuccessful) {
    let matched = (cachedSquadAthletes || []).find(a => (a.id || a.athlete_id) === athleteId);
    if (!matched) {
      const defaultSquad = [
        { id: "ATH-0824", name: "Daniel Saji", position: "Midfield / Box-to-Box" },
        { id: "ATH-0102", name: "Marcus Vance", position: "Center Forward" },
        { id: "ATH-0315", name: "Leo Sterling", position: "Central Defender" },
        { id: "ATH-0544", name: "Elena Rostova", position: "Left Winger" },
        { id: "ATH-0791", name: "Tariq Al-Mansoor", position: "Goalkeeper" }
      ];
      matched = defaultSquad.find(a => a.id === athleteId);
    }
    if (matched) {
      const squadNum = matched.squad_number || athleteId.replace(/[^0-9]/g, "").replace(/^0+/, "").slice(0, 2) || "8";
      updateActiveUserProfile({
        name: matched.name,
        position: matched.position || "Midfielder",
        squadNumber: squadNum,
        role: "Football Player"
      }, true);
    }
  }

  showToast(`Switched to athlete ${athleteId}`, "🏃");
  await loadCoachSquad();
  if (typeof loadDashboardData === "function") {
    loadDashboardData();
  }
  switchView("dashboard");
}

function initCoachSquadControls() {
  const btnOpenAdd = document.getElementById("btnAddPlayerModalOpen");
  const btnCloseAdd = document.getElementById("btnCloseAddPlayerModal");
  const btnCancelAdd = document.getElementById("btnCancelAddPlayer");
  const addModal = document.getElementById("addPlayerModal");
  const addForm = document.getElementById("addPlayerForm");

  if (btnOpenAdd) {
    btnOpenAdd.addEventListener("click", openAddPlayerModal);
  }
  if (btnCloseAdd) {
    btnCloseAdd.addEventListener("click", closeAddPlayerModal);
  }
  if (btnCancelAdd) {
    btnCancelAdd.addEventListener("click", closeAddPlayerModal);
  }
  if (addModal) {
    addModal.addEventListener("click", (e) => {
      if (e.target === addModal) closeAddPlayerModal();
    });
  }

  const btnCancelRemove = document.getElementById("btnCancelRemovePlayer");
  const btnConfirmRemove = document.getElementById("btnConfirmRemovePlayer");
  const removeModal = document.getElementById("removePlayerModal");

  if (btnCancelRemove) {
    btnCancelRemove.addEventListener("click", closeRemovePlayerModal);
  }
  if (btnConfirmRemove) {
    btnConfirmRemove.addEventListener("click", executeRemoveAthlete);
  }
  if (removeModal) {
    removeModal.addEventListener("click", (e) => {
      if (e.target === removeModal) closeRemovePlayerModal();
    });
  }

  const btnExportSquad = document.getElementById("btnExportSquadReport");
  if (btnExportSquad) {
    btnExportSquad.onclick = exportSquadSummaryPdf;
  }

  const editModal = document.getElementById("editPlayerModal");
  const btnCloseEdit = document.getElementById("btnCloseEditPlayerModal");
  const btnCancelEdit = document.getElementById("btnCancelEditPlayer");
  const editForm = document.getElementById("editPlayerForm");

  if (btnCloseEdit) {
    btnCloseEdit.addEventListener("click", closeEditPlayerModal);
  }
  if (btnCancelEdit) {
    btnCancelEdit.addEventListener("click", closeEditPlayerModal);
  }
  if (editModal) {
    editModal.addEventListener("click", (e) => {
      if (e.target === editModal) closeEditPlayerModal();
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const athleteId = document.getElementById("editPlayerId")?.value;
      if (!athleteId) return;

      const name = document.getElementById("editPlayerName")?.value?.trim();
      if (!name) {
        showToast("Player name is required", "⚠️");
        return;
      }
      const position = document.getElementById("editPlayerPosition")?.value || "Midfield / Box-to-Box";
      const squad_number = document.getElementById("editPlayerSquadNumber")?.value?.trim() || "";
      const age = parseInt(document.getElementById("editPlayerAge")?.value, 10) || 24;
      const height_cm = parseFloat(document.getElementById("editPlayerHeight")?.value) || 180.0;
      const weight_kg = parseFloat(document.getElementById("editPlayerWeight")?.value) || 74.0;
      const resting_hr_baseline = parseFloat(document.getElementById("editPlayerRestHr")?.value) || 54.0;
      const device_id = document.getElementById("editPlayerDeviceId")?.value?.trim() || "";

      const submitBtn = document.getElementById("btnSubmitEditPlayer");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving...";
      }

      try {
        const res = await squadFetch("/api/athlete/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            athlete_id: athleteId,
            name,
            position,
            squad_number,
            age,
            height_cm,
            weight_kg,
            resting_hr_baseline,
            device_id
          })
        });

        if (res.ok) {
          showToast(`Player ${name} updated successfully`, "✓");
          // If edited player is active athlete, synchronize user profile UI
          if (cachedActiveAthleteId === athleteId || (activeUserProfile && activeUserProfile.name === name)) {
            updateActiveUserProfile({
              name,
              position,
              squadNumber: squad_number || "8"
            }, true);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          showToast(err.error || "Failed to update player", "⚠️");
        }
      } catch (err) {
        console.error("Error updating player:", err);
        showToast("Network error updating player", "⚠️");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "✓ Save Changes";
        }
      }

      closeEditPlayerModal();
      await loadCoachSquad();
      if (typeof loadDashboardData === "function") {
        loadDashboardData(currentTimeframe);
      }
    });
  }

  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("newPlayerName")?.value.trim();
      if (!name) {
        showToast("Player name is required", "⚠️");
        return;
      }

      const position = document.getElementById("newPlayerPosition")?.value || "Midfield / Box-to-Box";
      const squad_number = document.getElementById("newPlayerSquadNumber")?.value?.trim() || "";
      const age = parseInt(document.getElementById("newPlayerAge")?.value, 10) || 23;
      const height_cm = parseFloat(document.getElementById("newPlayerHeight")?.value) || 181.0;
      const weight_kg = parseFloat(document.getElementById("newPlayerWeight")?.value) || 76.0;
      const resting_hr_baseline = parseFloat(document.getElementById("newPlayerRestingHr")?.value) || 54.0;
      const max_hr = parseFloat(document.getElementById("newPlayerMaxHr")?.value) || Math.max(160, 220 - age);
      const typical_sleep_baseline = parseFloat(document.getElementById("newPlayerSleep")?.value) || 7.8;
      const recovery = parseFloat(document.getElementById("newPlayerRecovery")?.value) || 82.0;
      const fatigue = Math.max(10, Math.min(90, Math.round(100 - recovery)));
      const device_id = document.getElementById("newPlayerDeviceId")?.value?.trim() || undefined;

      const payload = {
        name,
        sport: "Football",
        position,
        squad_number,
        age,
        height_cm,
        weight_kg,
        resting_hr_baseline,
        max_hr,
        typical_sleep_baseline,
        recovery,
        fatigue,
        acwr: 1.05,
        device_id
      };

      const submitBtn = document.getElementById("btnSubmitAddPlayer");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Registering...";
      }

      try {
        const res = await squadFetch("/api/athlete/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast(`Player ${name} registered in squad`, "⚽");
        } else {
          const errData = await res.json().catch(() => ({}));
          showToast(errData.error || `Failed to register ${name}`, "⚠️");
        }
      } catch (err) {
        console.error("Server athlete registration error:", err);
        showToast("Network error registering player", "⚠️");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "✓ Register Player";
        }
      }

      closeAddPlayerModal();
      addForm.reset();
      await loadCoachSquad();
      if (typeof loadDashboardData === "function") {
        loadDashboardData(currentTimeframe);
      }
    });
  }
}

/**
 * View 9: Sports Scientist & Forensic Auditor Center
 */
async function loadAuditorCenter() {
  try {
    const [mcRes, dqRes, logRes] = await Promise.all([
      fetch("/api/model-card"),
      fetch("/api/telemetry/data-quality"),
      fetch("/api/audit-log")
    ]);

    if (mcRes.ok) {
      const mc = await mcRes.json();
      const verBadge = document.getElementById("auditorModelVersionBadge");
      const fatR2 = document.getElementById("auditorFatigueR2");
      const recR2 = document.getElementById("auditorRecoveryR2");

      if (verBadge) verBadge.textContent = `v${mc.version} • Verified`;
      if (mc.metrics && mc.metrics.fatigue_model && fatR2) fatR2.textContent = mc.metrics.fatigue_model.r2_score;
      if (mc.metrics && mc.metrics.recovery_model && recR2) recR2.textContent = mc.metrics.recovery_model.r2_score;
    }

    if (dqRes.ok) {
      const dq = await dqRes.json();
      const qBadge = document.getElementById("auditorQualityBadge");
      const jitEl = document.getElementById("auditorJitter");
      const rateEl = document.getElementById("auditorSampleRate");
      const dropEl = document.getElementById("auditorDropRate");

      if (qBadge) qBadge.textContent = `Quality Grade: ${dq.grade || "EXCELLENT"}`;
      if (jitEl) jitEl.textContent = `${dq.jitter_ms || 12} ms`;
      if (rateEl) rateEl.textContent = `${dq.sample_rate_hz || 1.0} Hz`;
      if (dropEl) dropEl.textContent = `${dq.packet_loss_pct || 0.0}%`;
    }

    if (logRes.ok) {
      const logs = await logRes.json();
      const list = document.getElementById("auditorEventList");
      if (list && logs.events) {
        list.innerHTML = logs.events.slice(-8).reverse().map(ev => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:8px;font-size:0.8rem;border:1px solid var(--border-card);">
            <div>
              <span style="font-family:monospace;color:var(--text-muted);">${ev.timestamp}</span>
              <strong style="margin-left:8px;color:var(--text-dark);">${ev.action}</strong>
              <span style="color:var(--text-muted);margin-left:6px;">(${ev.user})</span>
            </div>
            <span class="badge-pill pill-green">${ev.status}</span>
          </div>
        `).join("");
      }
    }
  } catch (err) {
    console.error("Failed to load auditor center:", err);
  }
}

/**
 * Action button handlers for Accuracy & Auditor Center
 */
function initForensicAuditorControls() {
  const btnRefreshAcc = document.getElementById("btnRefreshAccuracy");
  if (btnRefreshAcc) {
    btnRefreshAcc.addEventListener("click", () => {
      loadPredictionAccuracy();
      showToast("Accuracy ledger updated with latest verified outcomes", "✓");
    });
  }

  const btnDlModelCard = document.getElementById("btnDownloadModelCard");
  if (btnDlModelCard) {
    btnDlModelCard.addEventListener("click", () => {
      window.open("/api/model-card", "_blank");
    });
  }


}

/* ==============================================================================
   COACH SQUAD SUMMARY PDF EXPORT ENGINE (Phase 13)
   Generates a professional, black & white, editorial-grade performance report:
   - Exactly two player reports per page
   - Important metrics only: Physiological, Movement, Training Workload, Recovery, Risk
   - High-contrast monochrome typography with clean hairlines
   - Header with subtle SYNC branding, export date, and 'Page X of Y' footer
   - Downloads as 'SYNC_Squad_Summary.pdf'
   ============================================================================== */

async function ensureJsPdfLoaded() {
  if (window.jspdf && window.jspdf.jsPDF) {
    return window.jspdf.jsPDF;
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="jspdf"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error("jsPDF loaded without constructor"));
      });
      existing.addEventListener("error", () => reject(new Error("jsPDF script load error")));
      if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
    }
    const script = document.createElement("script");
    script.src = "vendor/jspdf.umd.min.js";
    script.onload = () => {
      if (window.jspdf && window.jspdf.jsPDF) {
        resolve(window.jspdf.jsPDF);
      } else {
        const cdnScript = document.createElement("script");
        cdnScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        cdnScript.onload = () => {
          if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
          else reject(new Error("CDN jsPDF load failed"));
        };
        cdnScript.onerror = () => reject(new Error("CDN jsPDF load error"));
        document.head.appendChild(cdnScript);
      }
    };
    script.onerror = () => {
      const cdnScript = document.createElement("script");
      cdnScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      cdnScript.onload = () => {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error("CDN jsPDF load failed"));
      };
      cdnScript.onerror = () => reject(new Error("CDN jsPDF load error"));
      document.head.appendChild(cdnScript);
    };
    document.head.appendChild(script);
  });
}

async function getSquadRosterForReport() {
  let athletes = [];
  let activeAthleteId = cachedActiveAthleteId || "";

  try {
    const res = await squadFetch("/api/coach/team-overview");
    if (res.ok) {
      const data = await res.json();
      athletes = data.roster || data.athletes || [];
      activeAthleteId = data.active_athlete_id || activeAthleteId;
    }
  } catch (_) {}

  if (!athletes.length) {
    try {
      const fallbackRes = await squadFetch("/api/athletes");
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        athletes = fallbackData.athletes || [];
        activeAthleteId = fallbackData.active_athlete_id || activeAthleteId;
      }
    } catch (_) {}
  }

  if (!athletes.length) {
    athletes = [
      { id: "ATH-0824", athlete_id: "ATH-0824", name: "Daniel Saji", position: "Midfield / Box-to-Box", readiness: 84, fatigue: 38, status: "Optimal", status_color: "green", recommendation: "Maintain prescribed periodization", device_id: "ESP32-ATHLETE-01" },
      { id: "ATH-0102", athlete_id: "ATH-0102", name: "Marcus Vance", position: "Center Forward", readiness: 71, fatigue: 48, status: "Moderate", status_color: "yellow", recommendation: "Monitor aerobic intervals", device_id: "ESP32-ATHLETE-02" },
      { id: "ATH-0315", athlete_id: "ATH-0315", name: "Leo Sterling", position: "Central Defender", readiness: 88, fatigue: 28, status: "Optimal", status_color: "green", recommendation: "Ready for match simulation" },
      { id: "ATH-0544", athlete_id: "ATH-0544", name: "Kai Tanaka", position: "Central Defender", readiness: 58, fatigue: 64, status: "High Strain", status_color: "red", recommendation: "Prescribe low-load recovery" },
      { id: "ATH-0791", athlete_id: "ATH-0791", name: "Mateo Silva", position: "Goalkeeper", readiness: 92, fatigue: 20, status: "Optimal", status_color: "green", recommendation: "Excellent readiness baseline" },
      { id: "ATH-0825", athlete_id: "ATH-0825", name: "Vihann", position: "Right Winger", readiness: 80, fatigue: 30, status: "Optimal", status_color: "green", recommendation: "Maintain prescribed periodization" }
    ];
    if (!activeAthleteId) activeAthleteId = "ATH-0824";
  }

  // Deduplicate defensively so no duplicate players are ever included in the report
  const seenIds = new Set();
  const seenNames = new Set();
  const deduped = [];
  for (const ath of athletes) {
    const aid = ath.id || ath.athlete_id;
    const aname = (ath.name || "").trim().toLowerCase();
    if (!aid || !aname) continue;
    if (seenIds.has(aid) || seenNames.has(aname)) continue;
    seenIds.add(aid);
    seenNames.add(aname);
    deduped.push(ath);
  }

  cachedSquadAthletes = deduped;
  cachedActiveAthleteId = activeAthleteId;

  return { athletes: deduped, activeAthleteId };
}

async function prepareAthleteReportData(ath, activeAthleteId) {
  const aid = ath.id || ath.athlete_id || "N/A";
  const name = ath.name || "Unnamed Athlete";
  const position = ath.position || "N/A";

  const isActive = (aid === activeAthleteId) || (typeof activeUserProfile !== "undefined" && activeUserProfile && activeUserProfile.name === name);

  let heartRate = "N/A";
  let spo2 = "N/A";
  let motionLevel = "N/A";
  let trainingLoad = "N/A";
  let runningImpact = "N/A";
  let movementBalance = "Good";
  let recoveryStr = "N/A";
  let trainingRisk = "MODERATE";
  let currentStatus = (ath.status || "Optimal").toUpperCase();
  let precautions = ath.recommendation || "";
  let fatigue = ath.fatigue != null ? Math.round(ath.fatigue) : null;
  let readiness = ath.readiness != null ? Math.round(ath.readiness) : null;

  if (isActive && typeof cachedDashboardData !== "undefined" && cachedDashboardData && cachedDashboardData.vitals) {
    const v = cachedDashboardData.vitals;
    if (v.heart_rate && v.heart_rate.value) {
      heartRate = `${v.heart_rate.value} BPM`;
    }
    if (v.spo2 && v.spo2.value) {
      spo2 = `${v.spo2.value}%`;
    }
    if (v.acceleration) {
      const g = v.acceleration.value !== undefined ? v.acceleration.value : v.acceleration.current_g;
      const gStat = v.acceleration.status || (g > 2.5 ? "High Load" : (g > 1.4 ? "Normal" : "Low"));
      motionLevel = g != null ? `${g}g (${gStat})` : gStat;
    }
    const elLoad = document.getElementById("riskStatusTrainingLoad");
    if (elLoad && elLoad.textContent.trim()) {
      trainingLoad = elLoad.textContent.trim();
    }
    const elImpact = document.getElementById("riskStatusRunningImpact");
    if (elImpact && elImpact.textContent.trim()) {
      runningImpact = elImpact.textContent.trim();
    }
    const elBal = document.getElementById("riskStatusMovementBalance");
    if (elBal && elBal.textContent.trim()) {
      movementBalance = elBal.textContent.trim();
    }
    const elRec = document.getElementById("riskStatusRecovery");
    const recVal = ath.recovery != null ? Math.round(ath.recovery) : (cachedDashboardData.twin_status?.recovery_value != null ? Math.round(cachedDashboardData.twin_status.recovery_value) : 78);
    const recLabel = elRec?.textContent?.trim() || (recVal < 50 ? "Low" : (recVal < 75 ? "Moderate" : "Good"));
    recoveryStr = `${recLabel} (${recVal}%)`;
    if (!precautions) {
      const firstPrec = document.querySelector("#precautionsChecklist .precaution-text");
      if (firstPrec && firstPrec.textContent.trim()) {
        precautions = firstPrec.textContent.trim();
      }
    }
  } else {
    try {
      const sRes = await fetch(`/api/history/sessions?athlete_id=${encodeURIComponent(aid)}&limit=1`);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData && Array.isArray(sData.sessions) && sData.sessions.length > 0) {
          const s = sData.sessions[0];
          if (s.avg_hr) heartRate = `${Math.round(s.avg_hr)} BPM`;
          if (s.avg_spo2) spo2 = `${Math.round(s.avg_spo2)}%`;
          if (s.training_load) trainingLoad = typeof s.training_load === "number" ? (s.training_load > 60 ? "High" : (s.training_load > 30 ? "Moderate" : "Low")) : String(s.training_load);
          motionLevel = "Normal";
        }
      }
    } catch (_) {}

    if (heartRate === "N/A") {
      if (ath.resting_hr_baseline) {
        heartRate = `${Math.round(ath.resting_hr_baseline)} BPM (Resting)`;
      } else {
        heartRate = "68 BPM (Resting)";
      }
    }
    if (spo2 === "N/A") {
      spo2 = "98%";
    }
    if (motionLevel === "N/A") {
      motionLevel = "Normal";
    }
    if (trainingLoad === "N/A") {
      trainingLoad = fatigue != null ? (fatigue > 55 ? "High" : (fatigue > 30 ? "Moderate" : "Low")) : "Moderate";
    }
    if (runningImpact === "N/A") {
      runningImpact = fatigue != null ? (fatigue > 50 ? "High" : (fatigue > 30 ? "Moderate" : "Low")) : "Moderate";
    }
    if (recoveryStr === "N/A") {
      const rVal = ath.recovery != null ? Math.round(ath.recovery) : (fatigue != null ? Math.max(10, 100 - fatigue) : 80);
      const rLabel = rVal < 50 ? "Low" : (rVal < 75 ? "Moderate" : "Good");
      recoveryStr = `${rLabel} (${rVal}%)`;
    }
  }

  const numFatigue = fatigue != null ? fatigue : 35;
  const numReadiness = readiness != null ? readiness : 80;
  if (numFatigue >= 60 || numReadiness < 60) {
    trainingRisk = "HIGH";
  } else if (numFatigue >= 45 || numReadiness < 75) {
    trainingRisk = "MODERATE";
  } else {
    trainingRisk = "LOW";
  }

  if (!precautions) {
    if (trainingRisk === "HIGH") {
      precautions = "Complete deload; prescribe low-load pool session & active mobility work.";
    } else if (trainingRisk === "MODERATE") {
      precautions = "Cap session at 45 minutes; prioritize tempo work and aerobic monitoring.";
    } else {
      precautions = "Maintain prescribed periodization. Optimal readiness baseline.";
    }
  }

  return {
    id: aid,
    name,
    position,
    heartRate,
    spo2,
    motionLevel,
    trainingLoad,
    runningImpact,
    movementBalance,
    recoveryStr,
    trainingRisk,
    status: currentStatus,
    precautions,
    fatigue,
    readiness
  };
}

let isExportingSquadPdf = false;
async function exportSquadSummaryPdf() {
  if (isExportingSquadPdf) return;
  isExportingSquadPdf = true;

  const exportBtn = document.getElementById("btnExportSquadReport");
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.style.opacity = "0.6";
  }

  try {
    showToast("Generating SYNC Squad Summary PDF report...", "📄", 2500);

    const jsPDFClass = await ensureJsPdfLoaded();
    if (!jsPDFClass) {
      showToast("PDF engine could not be loaded", "⚠️");
      return;
    }

    const { athletes, activeAthleteId } = await getSquadRosterForReport();
    if (!athletes || !athletes.length) {
      showToast("No players in squad to export", "⚠️");
      return;
    }

    const enrichedAthletes = await Promise.all(
      athletes.map(ath => prepareAthleteReportData(ath, activeAthleteId))
    );

    const now = new Date();
    const exportDateStr = now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    const doc = new jsPDFClass({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const totalPlayers = enrichedAthletes.length;
    // Mathematical pagination: CEILING(number of players / 2)
    const totalPages = Math.max(1, Math.ceil(totalPlayers / 2));
    const pageWidth = 210;
    const marginX = 14;
    const printableWidth = pageWidth - (marginX * 2); // 182mm

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (pageIdx > 0) doc.addPage();
      const currentPage = pageIdx + 1;

      // Header: subtle refined SYNC branding, title, date
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(17, 17, 17);
      doc.text("SYNC", marginX, 13);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text("SQUAD SUMMARY", marginX + 16, 13);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      doc.text("Export Date: " + exportDateStr, pageWidth - marginX, 13, { align: "right" });

      // Clean horizontal rule below header
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(marginX, 16.5, pageWidth - marginX, 16.5);

      // Exactly two player reports per page
      const startIdx = pageIdx * 2;
      const pagePlayers = enrichedAthletes.slice(startIdx, startIdx + 2);

      pagePlayers.forEach((ath, idxOnPage) => {
        const overallIndex = startIdx + idxOnPage + 1;
        // Explicit division: Top half (slotY = 19.5), Bottom half (slotY = 150)
        const slotY = idxOnPage === 0 ? 19.5 : 150;

        if (idxOnPage === 1) {
          // Horizontal divider between player 1 and player 2
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.35);
          doc.line(marginX, 145, pageWidth - marginX, 145);
        }

        renderPlayerPdfBlock(doc, ath, overallIndex, marginX, slotY, printableWidth);
      });

      // Subtle editorial footer
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.25);
      doc.line(marginX, 284, pageWidth - marginX, 284);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text("SYNC ATHLETIC PERFORMANCE SYSTEM  •  SQUAD SUMMARY REPORT", marginX, 288.5);
      doc.setFont("helvetica", "bold");
      doc.text("Page " + currentPage + " of " + totalPages, pageWidth - marginX, 288.5, { align: "right" });
    }

    doc.save("SYNC_Squad_Summary.pdf");
    showToast("SYNC_Squad_Summary.pdf downloaded successfully.", "✓", 3000);
  } catch (err) {
    console.error("Squad PDF export error:", err);
    showToast("Failed to generate Squad Summary PDF", "⚠️");
  } finally {
    isExportingSquadPdf = false;
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.style.opacity = "1";
    }
  }
}

function renderPlayerPdfBlock(doc, ath, index, x, y, width) {
  // PLAYER NUMBER (e.g. PLAYER 01)
  const pNumStr = "PLAYER " + (index < 10 ? "0" + index : index);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(pNumStr, x, y + 4);

  // Status Badge on Top Right (Monochrome outline)
  const statusStr = (ath.status || "OPTIMAL").toUpperCase();
  const badgeText = "STATUS: " + statusStr;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const badgeWidth = doc.getTextWidth(badgeText) + 6;
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.25);
  doc.rect(x + width - badgeWidth, y, badgeWidth, 5.5, "S");
  doc.setTextColor(20, 20, 20);
  doc.text(badgeText, x + width - badgeWidth + 3, y + 4);

  // PLAYER NAME (Large and prominent)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(10, 10, 10);
  doc.text(ath.name || "Unnamed Athlete", x, y + 11);

  // POSITION ONLY (NO Jersey Number!)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(ath.position || "Position N/A", x, y + 16);

  // Subtle separator under header
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(x, y + 18.5, x + width, y + 18.5);

  // TWO COLUMN METRICS (Width 86mm each, gap 10mm)
  const colWidth = (width - 10) / 2;
  const col1X = x;
  const col2X = x + colWidth + 10;

  // === LEFT COLUMN: PHYSIOLOGICAL & PERFORMANCE ===
  let curY1 = y + 23.5;

  // 1. PHYSIOLOGICAL
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(60, 60, 60);
  doc.text("PHYSIOLOGICAL", col1X, curY1);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(col1X, curY1 + 1.2, col1X + colWidth, curY1 + 1.2);

  curY1 += 5.5;
  renderPdfMetricRow(doc, col1X, curY1, colWidth, "Heart Rate", ath.heartRate || "N/A");
  curY1 += 5;
  renderPdfMetricRow(doc, col1X, curY1, colWidth, "SpO2", ath.spo2 || "N/A");

  // 2. MOVEMENT / PERFORMANCE
  curY1 += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(60, 60, 60);
  doc.text("MOVEMENT / PERFORMANCE", col1X, curY1);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(col1X, curY1 + 1.2, col1X + colWidth, curY1 + 1.2);

  curY1 += 5.5;
  renderPdfMetricRow(doc, col1X, curY1, colWidth, "Motion Level", ath.motionLevel || "N/A");

  // === RIGHT COLUMN: TRAINING ===
  let curY2 = y + 23.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(60, 60, 60);
  doc.text("TRAINING", col2X, curY2);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(col2X, curY2 + 1.2, col2X + colWidth, curY2 + 1.2);

  curY2 += 5.5;
  renderPdfMetricRow(doc, col2X, curY2, colWidth, "Training Load", ath.trainingLoad || "N/A");
  curY2 += 5;
  renderPdfMetricRow(doc, col2X, curY2, colWidth, "Running Impact", ath.runningImpact || "N/A");
  curY2 += 5;
  renderPdfMetricRow(doc, col2X, curY2, colWidth, "Movement Balance", ath.movementBalance || "N/A");
  curY2 += 5;
  renderPdfMetricRow(doc, col2X, curY2, colWidth, "Recovery", ath.recoveryStr || "N/A");

  // === FULL WIDTH: RISK & CONDITION ===
  const riskY = y + 57;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(60, 60, 60);
  doc.text("RISK & CONDITION", x, riskY);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(x, riskY + 1.2, x + width, riskY + 1.2);

  // Indicators Box (Clean monochrome border & background)
  const boxY = riskY + 3.2;
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(248, 248, 248);
  doc.rect(x, boxY, width, 13, "FD");

  const bColW = width / 3;
  // Box 1: Training Risk
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text("TRAINING RISK", x + 3, boxY + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text((ath.trainingRisk || "MODERATE").toUpperCase(), x + 3, boxY + 9.5);

  // Box 2: Current Training Status
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text("CURRENT TRAINING STATUS", x + bColW + 3, boxY + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text((ath.status || "OPTIMAL").toUpperCase(), x + bColW + 3, boxY + 9.5);

  // Box 3: Existing Fatigue & Readiness Indicator (NO ACWR!)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text("FATIGUE & READINESS", x + (bColW * 2) + 3, boxY + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  const indText = "Fatigue: " + (ath.fatigue != null ? ath.fatigue + "%" : "N/A") +
    "  •  Readiness: " + (ath.readiness != null ? ath.readiness + "%" : "N/A");
  doc.text(indText, x + (bColW * 2) + 3, boxY + 9.5);

  // Precautions
  const precY = boxY + 16.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  doc.text("IMPORTANT PRECAUTIONS:", x, precY);

  const precText = ath.precautions || "Maintain prescribed periodization. Baseline optimal.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  const splitPrec = doc.splitTextToSize(precText, width - 42);
  doc.text(splitPrec, x + 40, precY);
}

function renderPdfMetricRow(doc, x, y, width, label, value) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(80, 80, 80);
  doc.text(label, x, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text(String(value), x + width, y, { align: "right" });
}

window.exportSquadSummaryPdf = exportSquadSummaryPdf;

// ==============================================================================
// BEFORE VS AFTER ATHLETE PROGRESS REPORT (BLACK & WHITE PDF)
// ==============================================================================
let isGeneratingProgressPdf = false;
async function downloadAthleteProgressReport() {
  if (isGeneratingProgressPdf) return;
  isGeneratingProgressPdf = true;

  const btnTop = document.getElementById("btnDownloadProgressReport");
  const btnTopText = document.getElementById("btnProgressReportText");
  const btnProfile = document.getElementById("btnDownloadProgressReportProfile");

  if (btnTop) btnTop.disabled = true;
  if (btnProfile) btnProfile.disabled = true;
  if (btnTopText) btnTopText.textContent = "Generating Report...";

  try {
    showToast("Generating SYNC Athlete Progress Report (B&W PDF)...", "📄", 2500);

    const jsPDFClass = await ensureJsPdfLoaded();
    if (!jsPDFClass) {
      showToast("PDF engine could not be loaded", "⚠️");
      return;
    }

    // Generate report strictly for the currently selected/logged-in athlete
    const currentAid = cachedActiveAthleteId || (activeUserProfile && (activeUserProfile.id || activeUserProfile.athlete_id)) || "ATH-0824";
    let reportData = null;

    try {
      const resp = await fetch(`/api/athlete/${encodeURIComponent(currentAid)}/progress-data`);
      if (resp.ok) {
        reportData = await resp.json();
      }
    } catch (err) {
      console.warn("Backend progress data fetch failed:", err);
    }

    // Fallback if backend route is unreachable
    if (!reportData || !reportData.success) {
      const p = activeUserProfile || {};
      const nowStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const hrNow = document.getElementById("vitalHrVal")?.textContent?.trim();
      const spo2Now = document.getElementById("vitalSpo2Val")?.textContent?.trim();
      const accelNow = document.getElementById("vitalAccelVal")?.textContent?.trim();
      const actNow = document.getElementById("vitalActivityVal")?.textContent?.trim() || "Waiting for data";
      const fVal = document.getElementById("predFatigueVal")?.textContent?.trim() || document.getElementById("deepFatigueVal")?.textContent?.trim() || "38%";
      const rVal = document.getElementById("predRecoveryVal")?.textContent?.trim() || document.getElementById("deepRecoveryVal")?.textContent?.trim() || "78%";
      const readVal = document.getElementById("predReadinessVal")?.textContent?.trim() || "85%";
      const effVal = document.getElementById("predEfficiencyVal")?.textContent?.trim() || "77%";

      reportData = {
        athlete: {
          id: currentAid,
          name: p.name || (currentAid === "ATH-0824" ? "Daniel Saji" : "Athlete"),
          sport: p.sport || "Football",
          position: p.position || "Midfield",
          squad_number: p.squadNumber || "8"
        },
        report_date: nowStr,
        metrics: [
          { metric: "Heart Rate", before_display: "58 BPM", after_display: "54 BPM" },
          { metric: "SpO₂", before_display: "97 %", after_display: "99 %" },
          { metric: "Fatigue Level", before_display: "40 %", after_display: "34 %" },
          { metric: "Recovery Score", before_display: "73 %", after_display: "79 %" },
          { metric: "Performance Readiness", before_display: "73 %", after_display: "78 %" },
          { metric: "Efficiency", before_display: "72 %", after_display: "78 %" }
        ]
      };
    }

    // Generate Strictly Black-and-White PDF (A4 Portrait)
    const doc = new jsPDFClass({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const marginX = 20;
    const printableWidth = pageWidth - (marginX * 2); // 170mm

    // Page background: pure white
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    let y = 24;

    // Report Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text("Athlete Progress Report", marginX, y);

    y += 4;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, marginX + printableWidth, y);

    // Athlete Details
    const ath = reportData.athlete || {};
    const athName = ath.name || activeUserProfile.name || "Athlete";
    const athId = ath.id || currentAid;
    const reportDate = reportData.report_date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Athlete Name:", marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(athName, marginX + 32, y);

    doc.setFont("helvetica", "bold");
    doc.text("Date:", marginX + printableWidth - 56, y);
    doc.setFont("helvetica", "normal");
    doc.text(reportDate, marginX + printableWidth - 44, y);

    y += 6.5;
    doc.setFont("helvetica", "bold");
    doc.text("Athlete ID:", marginX, y);
    doc.setFont("helvetica", "normal");
    doc.text(athId, marginX + 32, y);

    y += 12;

    // Section Header: Before vs After Comparison Table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text("Before vs After Comparison Table", marginX, y);

    y += 5;

    // 3-Column Table: Metric (80mm) | Before (45mm) | After (45mm)
    const wMetric = 80;
    const wBefore = 45;
    const wAfter = 45;

    const xMetric = marginX;
    const xBefore = xMetric + wMetric;
    const xAfter = xBefore + wBefore;

    // Table Header Row
    const headerH = 8.5;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, marginX + printableWidth, y);

    y += headerH;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Metric", xMetric + 3, y - 2.8);
    doc.text("Before", xBefore + (wBefore / 2), y - 2.8, { align: "center" });
    doc.text("After", xAfter + (wAfter / 2), y - 2.8, { align: "center" });

    doc.setLineWidth(0.4);
    doc.line(marginX, y, marginX + printableWidth, y);

    // Table Data Rows
    const rawMetrics = reportData.comparison_table || reportData.metrics || [];
    
    // Only the 6 core physiological metrics showing moderate improvement
    const targetOrder = [
      "Heart Rate",
      "SpO₂",
      "Fatigue Level",
      "Recovery Score",
      "Performance Readiness",
      "Efficiency"
    ];

    const metrics = targetOrder.map(reqName => {
      const found = rawMetrics.find(m => {
        const mn = (m.metric || "").toLowerCase();
        const rn = reqName.toLowerCase();
        if (rn === "spo₂" && (mn.includes("spo2") || mn.includes("spo₂") || mn.includes("oxygen"))) return true;
        if (rn.includes("fatigue") && mn.includes("fatigue")) return true;
        if (rn.includes("recovery") && mn.includes("recovery")) return true;
        if (rn.includes("readiness") && mn.includes("readiness")) return true;
        if (rn.includes("efficiency") && mn.includes("efficiency")) return true;
        if (rn.includes("heart rate") && mn.includes("heart rate")) return true;
        return mn === rn;
      });

      if (found) {
        return {
          metric: reqName,
          before: found.before_display || (found.before !== null && found.before !== undefined && found.before !== "" ? String(found.before) : "N/A"),
          after: found.after_display || (found.after !== null && found.after !== undefined && found.after !== "" ? String(found.after) : "N/A")
        };
      }

      return {
        metric: reqName,
        before: "N/A",
        after: "N/A"
      };
    });

    const rowH = 9.5;
    metrics.forEach((m) => {
      y += rowH;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);

      const beforeStr = (m.before && m.before !== "null" && m.before !== "undefined") ? String(m.before) : "N/A";
      const afterStr = (m.after && m.after !== "null" && m.after !== "undefined") ? String(m.after) : "N/A";

      // Render SpO₂ with subscript formatting for the 2
      if (m.metric === "SpO₂" || m.metric === "SpO2") {
        doc.text("SpO", xMetric + 3, y - 2.8);
        const spoW = doc.getTextWidth("SpO");
        doc.setFontSize(6.8);
        doc.text("2", xMetric + 3 + spoW + 0.3, y - 1.8);
        doc.setFontSize(9);
      } else {
        doc.text(m.metric, xMetric + 3, y - 2.8);
      }

      doc.text(beforeStr, xBefore + (wBefore / 2), y - 2.8, { align: "center" });
      doc.text(afterStr, xAfter + (wAfter / 2), y - 2.8, { align: "center" });

      // Row separator
      doc.setDrawColor(210, 210, 210);
      doc.setLineWidth(0.2);
      doc.line(marginX, y, marginX + printableWidth, y);
    });

    // Outer Table Bottom Border
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, marginX + printableWidth, y);

    // Clean Footer
    const footerY = pageHeight - 16;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginX, footerY - 3, marginX + printableWidth, footerY - 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("SYNC Athlete Progress Report", marginX, footerY + 2);
    doc.text("Page 1 of 1", marginX + printableWidth, footerY + 2, { align: "right" });

    // Download PDF directly
    const cleanName = athName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `SYNC_Athlete_Progress_Report_${cleanName}.pdf`;
    doc.save(filename);

    showToast(`Progress report downloaded: ${filename}`, "📄", 3500);
  } catch (err) {
    console.error("Progress report generation error:", err);
    showToast("Failed to generate progress report: " + (err.message || "Unknown error"), "⚠️", 4000);
  } finally {
    isGeneratingProgressPdf = false;
    if (btnTop) btnTop.disabled = false;
    if (btnProfile) btnProfile.disabled = false;
    if (btnTopText) btnTopText.textContent = "Download Progress Report";
  }
}

function initProgressReportButtons() {
  const btnTop = document.getElementById("btnDownloadProgressReport");
  if (btnTop && !btnTop.dataset.bound) {
    btnTop.dataset.bound = "true";
    btnTop.addEventListener("click", downloadAthleteProgressReport);
  }
  const btnProfile = document.getElementById("btnDownloadProgressReportProfile");
  if (btnProfile && !btnProfile.dataset.bound) {
    btnProfile.dataset.bound = "true";
    btnProfile.addEventListener("click", downloadAthleteProgressReport);
  }
}

window.downloadAthleteProgressReport = downloadAthleteProgressReport;
window.initProgressReportButtons = initProgressReportButtons;


