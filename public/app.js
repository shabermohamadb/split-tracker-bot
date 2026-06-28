// State Management
let playersData = [];
let selectedPlayerName = null;

// DOM Elements
const elements = {
  statusText: document.getElementById('status-text'),
  statusContainer: document.querySelector('.server-status'),
  ignInput: document.getElementById('ign-search'),
  searchBtn: document.getElementById('search-btn'),
  autocompleteList: document.getElementById('autocomplete-list'),
  playerProfile: document.getElementById('player-profile'),
  profileName: document.getElementById('profile-name'),
  profileStatus: document.getElementById('profile-status'),
  valWithdrawable: document.getElementById('val-withdrawable'),
  valStarting: document.getElementById('val-starting'),
  valFines: document.getElementById('val-fines'),
  sessionTimeline: document.getElementById('session-timeline'),
  leaderboardBody: document.getElementById('leaderboard-body'),
  quickLinks: document.getElementById('quick-links'),
  tabs: document.querySelectorAll('.tab-btn'),
  filterBtns: document.querySelectorAll('.filter-btn')
};

// Initialize Application
async function init() {
  setupTabs();
  setupFilters();
  setupAutocomplete();
  
  // 1. Fetch Bot status
  checkBotStatus();
  
  // 2. Fetch Spreadsheet data
  await loadSpreadsheetData();

  // 3. Render sample quick links
  renderQuickLinks();

  // 4. Register search click
  elements.searchBtn.addEventListener('click', () => {
    performSearch(elements.ignInput.value);
  });

  // 5. Register search Enter key
  elements.ignInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performSearch(elements.ignInput.value);
    }
  });
}

// 🌐 Check Bot and API status
async function checkBotStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      elements.statusContainer.classList.add('online');
      elements.statusText.textContent = `Bot: Online (${data.bot})`;
    }
  } catch (err) {
    console.warn('Could not connect to bot status API. Running in offline/independent mode.');
    elements.statusText.textContent = 'API Server: Online';
    elements.statusContainer.classList.add('online');
  }
}

// 📋 Fetch sheet splits
async function loadSpreadsheetData() {
  try {
    const res = await fetch('/api/splits');
    if (!res.ok) throw new Error('API server returned error');
    
    const data = await res.json();
    if (data.success && data.players) {
      playersData = data.players;
      console.log(`Loaded ${playersData.length} player splits.`);
      
      // Render Leaderboard initially
      renderLeaderboard('all');
    }
  } catch (err) {
    console.error('Failed to load splits data:', err);
    elements.leaderboardBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--red);">
          ❌ Error: Failed to fetch spreadsheet data. Ensure your server is running and .env is configured.
        </td>
      </tr>
    `;
  }
}

// 🔍 Search and load player profile
function performSearch(query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return;

  const player = playersData.find(p => p.name.toLowerCase() === cleanQuery);
  elements.autocompleteList.innerHTML = ''; // Clear suggestions

  if (player) {
    showPlayerProfile(player);
  } else {
    // Show not found state
    elements.playerProfile.classList.remove('hidden');
    elements.profileName.textContent = `IGN "${query}" not found`;
    elements.profileStatus.className = 'badge debt';
    elements.profileStatus.textContent = 'Unverified';
    elements.valWithdrawable.textContent = '---';
    elements.valStarting.textContent = '---';
    elements.valFines.textContent = '---';
    elements.sessionTimeline.innerHTML = '<p style="color: var(--text-secondary);">Spelt correctly? Check if your name is spelled exactly as listed in the Google Sheet.</p>';
    
    // Smooth scroll down
    elements.playerProfile.scrollIntoView({ behavior: 'smooth' });
  }
}

// Render dynamic profile panel
function showPlayerProfile(player) {
  elements.playerProfile.classList.remove('hidden');
  elements.profileName.textContent = player.name;
  
  // Set badge style
  const activeBal = player.total;
  elements.valWithdrawable.textContent = `${activeBal.toFixed(3)}M`;
  elements.valStarting.textContent = `${player.balance.toFixed(3)}M`;
  elements.valFines.textContent = `${player.fine.toFixed(3)}M`;

  // Set card classes for conditional styles
  const withdrawableCard = document.querySelector('.stat-card.withdrawable');
  withdrawableCard.className = 'stat-card withdrawable'; // reset

  if (activeBal > 0.0001) {
    elements.profileStatus.className = 'badge withdrawable';
    elements.profileStatus.textContent = '🟢 Withdrawable';
  } else if (activeBal < -0.0001) {
    elements.profileStatus.className = 'badge debt';
    elements.profileStatus.textContent = '🔴 Owes Silver';
    withdrawableCard.classList.add('debt');
  } else {
    elements.profileStatus.className = 'badge settled';
    elements.profileStatus.textContent = '⚪ Settled';
  }

  // Populate Timeline
  elements.sessionTimeline.innerHTML = '';
  if (player.sessions && player.sessions.length > 0) {
    player.sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      
      const dot = document.createElement('div');
      dot.className = 'timeline-dot';
      
      const content = document.createElement('div');
      content.className = 'timeline-content';
      
      const info = document.createElement('div');
      info.innerHTML = `
        <div class="session-name">${s.sessionName}</div>
        ${s.comments.length > 0 ? `<div class="session-details">Formula: ${s.comments.join(' | ')}</div>` : ''}
      `;
      
      const val = document.createElement('div');
      val.className = `session-amount ${s.amount < 0 ? 'negative-val' : ''}`;
      val.textContent = `${s.amount >= 0 ? '+' : ''}${s.amount.toFixed(3)}M`;
      if (s.amount < 0) {
        val.style.color = 'var(--red)';
      }
      
      content.appendChild(info);
      content.appendChild(val);
      item.appendChild(dot);
      item.appendChild(content);
      elements.sessionTimeline.appendChild(item);
    });
  } else {
    elements.sessionTimeline.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No recent sessions found for this player.</p>';
  }

  // Smooth scroll
  setTimeout(() => {
    elements.playerProfile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

// 📋 Render standings list
function renderLeaderboard(filter) {
  elements.leaderboardBody.innerHTML = '';

  let filtered = [...playersData];
  if (filter === 'positive') {
    filtered = playersData.filter(p => p.total > 0.0001);
  } else if (filter === 'negative') {
    filtered = playersData.filter(p => p.total < -0.0001);
  }

  // Sort by withdrawable balance descending
  filtered.sort((a, b) => b.total - a.total);

  if (filtered.length === 0) {
    elements.leaderboardBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-secondary); font-style: italic;">
          No players match this filter.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(p => {
    const row = document.createElement('tr');
    
    // Make name clickable
    const nameCell = document.createElement('td');
    nameCell.className = 'player-name-cell';
    nameCell.textContent = p.name;
    nameCell.addEventListener('click', () => {
      // Switch tab to search
      switchTab('search-section');
      elements.ignInput.value = p.name;
      performSearch(p.name);
    });

    const activeBalCell = document.createElement('td');
    activeBalCell.textContent = `${p.total.toFixed(3)}M`;
    if (p.total > 0.0001) {
      activeBalCell.className = 'positive-val';
    } else if (p.total < -0.0001) {
      activeBalCell.className = 'negative-val';
    }

    row.appendChild(nameCell);
    row.appendChild(activeBalCell);
    
    row.innerHTML += `
      <td>${p.balance.toFixed(3)}M</td>
      <td>${p.fine.toFixed(3)}M</td>
      <td>${p.sessions ? p.sessions.length : 0} Sessions</td>
    `;
    
    // Add event listener to the name cell again (innerHTML overwrote nodes, let's just insert elements cleanly)
    row.replaceChild(nameCell, row.firstChild);
    row.replaceChild(activeBalCell, row.children[1]);

    elements.leaderboardBody.appendChild(row);
  });
}

// 🔀 Tabs Event Handlers
function setupTabs() {
  elements.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  // Toggle Tab button actives
  elements.tabs.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle Tab content actives
  document.querySelectorAll('.tab-content').forEach(section => {
    if (section.id === tabId) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });
}

// 🎛️ Directory Filters setup
function setupFilters() {
  elements.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      renderLeaderboard(filter);
    });
  });
}

// 🔍 Search Autocomplete engine
function setupAutocomplete() {
  elements.ignInput.addEventListener('input', function() {
    const val = this.value.trim().toLowerCase();
    elements.autocompleteList.innerHTML = '';
    
    if (!val) return;

    // Filter players that start with query or contain query
    const matches = playersData.filter(p => p.name.toLowerCase().includes(val)).slice(0, 5);
    
    matches.forEach(p => {
      const item = document.createElement('div');
      // Highlight matching letters
      const idx = p.name.toLowerCase().indexOf(val);
      const highlightedName = p.name.substring(0, idx) + 
                              `<strong>${p.name.substring(idx, idx + val.length)}</strong>` + 
                              p.name.substring(idx + val.length);
      
      item.innerHTML = highlightedName;
      item.addEventListener('click', () => {
        elements.ignInput.value = p.name;
        elements.autocompleteList.innerHTML = '';
        performSearch(p.name);
      });
      elements.autocompleteList.appendChild(item);
    });
  });

  // Close suggestions if clicked outside
  document.addEventListener('click', function(e) {
    if (e.target !== elements.ignInput) {
      elements.autocompleteList.innerHTML = '';
    }
  });
}

// Render sample quick buttons for testing
function renderQuickLinks() {
  elements.quickLinks.innerHTML = '<span>Popular Searches:</span>';
  const sampleNames = ['BLACK HEART', 'KING', 'ONIH', 'CURSEOFGRINDING'];
  
  sampleNames.forEach(name => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      elements.ignInput.value = name;
      performSearch(name);
    });
    elements.quickLinks.appendChild(btn);
  });
}

// Launch
window.addEventListener('DOMContentLoaded', init);
