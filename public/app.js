// State Management
let sheet1Data = [];
let sheet2Data = [];
let owner1Name = 'JosephSteel';
let owner2Name = 'King';
let activeStandingsSheet = 'sheet1'; // 'sheet1' or 'sheet2'

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
  combinedTotalValue: document.getElementById('combined-total-value'),
  leaderboardBody: document.getElementById('leaderboard-body'),
  quickLinks: document.getElementById('quick-links'),
  tabs: document.querySelectorAll('.tab-btn'),
  filterBtns: document.querySelectorAll('.filter-controls .filter-btn'),
  linksBody: document.getElementById('links-body')
};

// Initialize Application
async function init() {
  setupTabs();
  setupFilters();
  setupAutocomplete();
  
  // 1. Fetch Bot status
  checkBotStatus();
  
  // 2. Fetch Spreadsheets data
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

// 📋 Fetch sheets splits
async function loadSpreadsheetData() {
  try {
    const res = await fetch('/api/splits');
    if (!res.ok) throw new Error('API server returned error');
    
    const data = await res.json();
    if (data.success) {
      sheet1Data = data.josephsteel || [];
      sheet2Data = data.king || [];
      owner1Name = data.owner1 || 'JosephSteel';
      owner2Name = data.owner2 || 'King';
      
      // Update HTML labels dynamically
      document.getElementById('title-owner1').textContent = `⚔️ ${owner1Name}'s Splits`;
      document.getElementById('title-owner2').textContent = `👑 ${owner2Name}'s Splits`;
      elements.btnToggleSheet1.textContent = `${owner1Name}'s Splits`;
      elements.btnToggleSheet2.textContent = `${owner2Name}'s Splits`;

      // Render footer links
      const linksContainer = document.getElementById('footer-sheet-links');
      if (linksContainer) {
        let linksHTML = `<a href="${data.url1}" target="_blank">🔗 View ${owner1Name}'s Loot Sheet</a>`;
        if (data.url2) {
          linksHTML += ` | <a href="${data.url2}" target="_blank">🔗 View ${owner2Name}'s Loot Sheet</a>`;
        }
        linksContainer.innerHTML = linksHTML;
      }

      console.log(`Loaded ${sheet1Data.length} players from ${owner1Name} sheet.`);
      console.log(`Loaded ${sheet2Data.length} players from ${owner2Name} sheet.`);
      
      // Render Leaderboard initially
      renderLeaderboard('all');
    }
  } catch (err) {
    console.error('Failed to load splits data:', err);
    elements.leaderboardBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--red);">
          ❌ Error: Failed to fetch spreadsheets data. Ensure your server is running and .env is configured.
        </td>
      </tr>
    `;
  }
}

// 🔍 Search and load player profile
function performSearch(query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return;

  const player1 = sheet1Data.find(p => p.name.toLowerCase() === cleanQuery);
  const player2 = sheet2Data.find(p => p.name.toLowerCase() === cleanQuery);
  elements.autocompleteList.innerHTML = ''; // Clear suggestions

  if (player1 || player2) {
    showPlayerProfile(player1, player2, query);
  } else {
    // Show not found state
    elements.playerProfile.classList.remove('hidden');
    elements.profileName.textContent = `IGN "${query}" not found`;
    elements.profileStatus.className = 'badge debt';
    elements.profileStatus.textContent = 'Unverified';
    elements.combinedTotalValue.textContent = '0.000M';

    // Show blank columns
    document.getElementById('o1-withdrawable').textContent = '---';
    document.getElementById('o1-starting').textContent = '---';
    document.getElementById('o1-fines').textContent = '---';
    document.getElementById('o1-timeline').innerHTML = '<p style="color: var(--text-secondary);">Spelt correctly? Check if your name is listed on either sheet.</p>';

    document.getElementById('o2-withdrawable').textContent = '---';
    document.getElementById('o2-starting').textContent = '---';
    document.getElementById('o2-fines').textContent = '---';
    document.getElementById('o2-timeline').innerHTML = '<p style="color: var(--text-secondary);">Spelt correctly? Check if your name is listed on either sheet.</p>';
    
    // Smooth scroll down
    elements.playerProfile.scrollIntoView({ behavior: 'smooth' });
  }
}

// Render dynamic profile panel for both sheets
function showPlayerProfile(player1, player2, query) {
  elements.playerProfile.classList.remove('hidden');
  const resolvedName = player1 ? player1.name : (player2 ? player2.name : query);
  elements.profileName.textContent = resolvedName;

  const total1 = player1 ? player1.total : 0;
  const total2 = player2 ? player2.total : 0;
  const combinedTotal = total1 + total2;

  elements.combinedTotalValue.textContent = `${combinedTotal.toFixed(3)}M`;

  // Combined status badge
  if (combinedTotal > 0.0001) {
    elements.profileStatus.className = 'badge withdrawable';
    elements.profileStatus.textContent = '🟢 Withdrawable';
  } else if (combinedTotal < -0.0001) {
    elements.profileStatus.className = 'badge debt';
    elements.profileStatus.textContent = '🔴 Owes Silver';
  } else {
    elements.profileStatus.className = 'badge settled';
    elements.profileStatus.textContent = '⚪ Settled';
  }

  // Render Owner 1 details
  if (player1) {
    document.getElementById('o1-withdrawable').textContent = `${player1.total.toFixed(3)}M`;
    document.getElementById('o1-starting').textContent = `${player1.balance.toFixed(3)}M`;
    document.getElementById('o1-fines').textContent = `${player1.fine.toFixed(3)}M`;

    const timelineContainer = document.getElementById('o1-timeline');
    timelineContainer.innerHTML = '';
    if (player1.sessions && player1.sessions.length > 0) {
      player1.sessions.forEach(s => {
        timelineContainer.innerHTML += createTimelineItemHTML(s);
      });
    } else {
      timelineContainer.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No recent sessions found on this sheet.</p>';
    }
  } else {
    document.getElementById('o1-withdrawable').textContent = '0.000M';
    document.getElementById('o1-starting').textContent = '0.000M';
    document.getElementById('o1-fines').textContent = '0.000M';
    document.getElementById('o1-timeline').innerHTML = `<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">Not listed on ${owner1Name}'s splits.</p>`;
  }

  // Render Owner 2 details
  if (player2) {
    document.getElementById('o2-withdrawable').textContent = `${player2.total.toFixed(3)}M`;
    document.getElementById('o2-starting').textContent = `${player2.balance.toFixed(3)}M`;
    document.getElementById('o2-fines').textContent = `${player2.fine.toFixed(3)}M`;

    const timelineContainer = document.getElementById('o2-timeline');
    timelineContainer.innerHTML = '';
    if (player2.sessions && player2.sessions.length > 0) {
      player2.sessions.forEach(s => {
        timelineContainer.innerHTML += createTimelineItemHTML(s);
      });
    } else {
      timelineContainer.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No recent sessions found on this sheet.</p>';
    }
  } else {
    document.getElementById('o2-withdrawable').textContent = '0.000M';
    document.getElementById('o2-starting').textContent = '0.000M';
    document.getElementById('o2-fines').textContent = '0.000M';
    document.getElementById('o2-timeline').innerHTML = `<p style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">Not listed on ${owner2Name}'s splits.</p>`;
  }

  // Smooth scroll
  setTimeout(() => {
    elements.playerProfile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

// Timeline item structure builder
function createTimelineItemHTML(s) {
  const details = s.comments.length > 0 ? `<div class="session-details">Formula: ${s.comments.join(' | ')}</div>` : '';
  return `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content" style="padding: 0.8rem 1rem;">
        <div>
          <div class="session-name" style="font-size: 0.85rem;">${s.sessionName}</div>
          ${details}
        </div>
        <div class="session-amount" style="font-size: 0.95rem; color: ${s.amount < 0 ? 'var(--red)' : 'var(--green)'};">
          ${s.amount >= 0 ? '+' : ''}${s.amount.toFixed(3)}M
        </div>
      </div>
    </div>
  `;
}

// 📋 Render standings list for JosephSteel (Sheet 1) only
function renderLeaderboard(filter) {
  elements.leaderboardBody.innerHTML = '';

  let filtered = [...sheet1Data];

  if (filter === 'positive') {
    filtered = sheet1Data.filter(p => p.total > 0.0001);
  } else if (filter === 'negative') {
    filtered = sheet1Data.filter(p => p.total < -0.0001);
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
    
    const nameCell = document.createElement('td');
    nameCell.className = 'player-name-cell';
    nameCell.textContent = p.name;
    nameCell.addEventListener('click', () => {
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

  // Load database links if selected
  if (tabId === 'links-section') {
    loadDatabaseLinks();
  }
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

// Standings switcher was removed in favor of side-by-side combined table.

// 🔍 Search Autocomplete engine
function setupAutocomplete() {
  elements.ignInput.addEventListener('input', function() {
    const val = this.value.trim().toLowerCase();
    elements.autocompleteList.innerHTML = '';
    
    if (!val) return;

    // Union unique names across both sheets
    const allNames = [...new Set([
      ...sheet1Data.map(p => p.name),
      ...sheet2Data.map(p => p.name)
    ])];

    // Filter players that start with query or contain query
    const matches = allNames.filter(name => name.toLowerCase().includes(val)).slice(0, 5);
    
    matches.forEach(name => {
      const item = document.createElement('div');
      const idx = name.toLowerCase().indexOf(val);
      const highlightedName = name.substring(0, idx) + 
                              `<strong>${name.substring(idx, idx + val.length)}</strong>` + 
                              name.substring(idx + val.length);
      
      item.innerHTML = highlightedName;
      item.addEventListener('click', () => {
        elements.ignInput.value = name;
        elements.autocompleteList.innerHTML = '';
        performSearch(name);
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

// Load active database links
async function loadDatabaseLinks() {
  elements.linksBody.innerHTML = `
    <tr>
      <td colspan="3" style="text-align: center; color: var(--text-secondary);">
        ⏳ Loading database mappings from bot...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/links');
    if (!res.ok) throw new Error('API error');
    const data = await res.json();

    if (data.success && data.links) {
      elements.linksBody.innerHTML = '';
      if (data.links.length === 0) {
        elements.linksBody.innerHTML = `
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-secondary); font-style: italic;">
              No accounts linked in the bot database yet. Nicknames will auto-sync when they check splits!
            </td>
          </tr>
        `;
        return;
      }

      // Sort links by IGN alphabetically
      data.links.sort((a, b) => a.ign.localeCompare(b.ign));

      data.links.forEach(link => {
        const row = document.createElement('tr');
        
        const ignCell = document.createElement('td');
        ignCell.className = 'player-name-cell';
        ignCell.textContent = link.ign;
        ignCell.addEventListener('click', () => {
          switchTab('search-section');
          elements.ignInput.value = link.ign;
          performSearch(link.ign);
        });

        row.appendChild(ignCell);
        
        row.innerHTML += `
          <td style="color: var(--gold); font-weight: 500;">@${link.discord_username}</td>
          <td style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary);">${link.discord_id}</td>
        `;

        row.replaceChild(ignCell, row.firstChild);
        elements.linksBody.appendChild(row);
      });
    }
  } catch (err) {
    console.error('Failed to load database links:', err);
    elements.linksBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--red);">
          ❌ Error: Failed to fetch bot database links.
        </td>
      </tr>
    `;
  }
}

// Launch
window.addEventListener('DOMContentLoaded', init);
