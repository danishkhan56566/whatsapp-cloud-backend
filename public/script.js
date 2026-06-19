const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayLetters = { sunday: 'S', monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S' };

let profiles = [];
let whatsappGroups = [];
let activeProfileIndex = 0;

// DOM Elements
const profileSelect = document.getElementById('profile-select');
const scheduleList = document.getElementById('schedule-list');
const editModal = document.getElementById('edit-modal');

async function fetchData() {
    try {
        const res = await fetch('/api/profiles');
        profiles = await res.json();
    } catch(e) { console.error(e); }
    
    if (profiles.length === 0) {
        profiles.push({
            id: null,
            name: "New Profile",
            target: "",
            groups: [],
            message: "",
            schedule: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }
        });
    }
    renderProfileDropdown();
    renderSchedule();
    
    // Fetch groups in background
    fetchGroups();
}

async function fetchGroups() {
    try {
        const res = await fetch('/api/groups');
        if (res.ok) {
            whatsappGroups = await res.json();
        } else {
            console.warn("Failed to load groups. WhatsApp might not be ready.");
        }
    } catch(e) { console.error("Error fetching groups:", e); }
}

function renderProfileDropdown() {
    profileSelect.innerHTML = '';
    profiles.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = p.name;
        profileSelect.appendChild(opt);
    });
    profileSelect.value = activeProfileIndex;
}

profileSelect.addEventListener('change', (e) => {
    activeProfileIndex = parseInt(e.target.value);
    renderSchedule();
});

function renderSchedule() {
    scheduleList.innerHTML = '';
    const profile = profiles[activeProfileIndex];
    if(!profile.schedule) {
        profile.schedule = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
    }

    // Render Mon-Sun 
    const displayDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    displayDays.forEach(day => {
        const times = profile.schedule[day] || [];
        
        const row = document.createElement('div');
        row.className = 'day-row';
        
        // Badge
        const badge = document.createElement('div');
        badge.className = 'day-badge';
        badge.textContent = dayLetters[day];
        row.appendChild(badge);

        // Times Container
        const tc = document.createElement('div');
        tc.className = 'times-container';

        if (times.length === 0) {
            const slot = document.createElement('div');
            slot.className = 'time-slot';
            slot.innerHTML = `
                <span class="unavailable-text">Unavailable</span>
                <button class="icon-btn" onclick="addTime('${day}')">➕</button>
            `;
            tc.appendChild(slot);
        } else {
            times.forEach((time, tIdx) => {
                const slot = document.createElement('div');
                slot.className = 'time-slot';
                slot.innerHTML = `
                    <input type="time" class="time-input" value="${time}" onchange="updateTime('${day}', ${tIdx}, this.value)">
                    <button class="icon-btn" onclick="removeTime('${day}', ${tIdx})">❌</button>
                    ${tIdx === times.length - 1 ? `<button class="icon-btn" onclick="addTime('${day}')">➕</button>` : ''}
                `;
                tc.appendChild(slot);
            });
        }
        
        row.appendChild(tc);
        scheduleList.appendChild(row);
    });
}

// Actions
window.addTime = (day) => {
    const profile = profiles[activeProfileIndex];
    if (!profile.schedule[day]) profile.schedule[day] = [];
    profile.schedule[day].push("09:00");
    renderSchedule();
}

window.removeTime = (day, idx) => {
    profiles[activeProfileIndex].schedule[day].splice(idx, 1);
    renderSchedule();
}

window.updateTime = (day, idx, val) => {
    profiles[activeProfileIndex].schedule[day][idx] = val;
}

function populateGroupsModal(profile) {
    const container = document.getElementById('groups-container');
    if (whatsappGroups.length === 0) {
        container.innerHTML = '<p class="loading-groups">No groups found or still loading...</p>';
        return;
    }

    container.innerHTML = '';
    const selectedGroups = profile.groups || [];

    whatsappGroups.forEach(g => {
        const label = document.createElement('label');
        label.className = 'group-checkbox-row';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = g.id;
        if (selectedGroups.includes(g.id)) {
            input.checked = true;
        }

        const span = document.createElement('span');
        span.textContent = g.name;

        label.appendChild(input);
        label.appendChild(span);
        container.appendChild(label);
    });
}

// Modal Logic
document.getElementById('edit-profile-btn').onclick = () => {
    document.getElementById('modal-title').textContent = "Edit Profile Details";
    const p = profiles[activeProfileIndex];
    document.getElementById('edit-name').value = p.name || '';
    document.getElementById('edit-target').value = p.target || '';
    document.getElementById('edit-message').value = p.message || '';
    
    populateGroupsModal(p);
    editModal.classList.add('active');
};

document.getElementById('new-profile-btn').onclick = () => {
    document.getElementById('modal-title').textContent = "Create New Profile";
    document.getElementById('edit-name').value = 'New Profile';
    document.getElementById('edit-target').value = '';
    document.getElementById('edit-message').value = '';
    
    activeProfileIndex = profiles.length; // Set to new
    populateGroupsModal({ groups: [] });
    editModal.classList.add('active');
};

document.getElementById('cancel-modal-btn').onclick = () => {
    if(activeProfileIndex === profiles.length) activeProfileIndex = 0; // revert
    editModal.classList.remove('active');
};

document.getElementById('save-modal-btn').onclick = () => {
    const name = document.getElementById('edit-name').value;
    const target = document.getElementById('edit-target').value;
    const message = document.getElementById('edit-message').value;

    // Get checked groups
    const checkedInputs = document.querySelectorAll('#groups-container input[type="checkbox"]:checked');
    const selectedGroups = Array.from(checkedInputs).map(i => i.value);

    if (activeProfileIndex === profiles.length) {
        profiles.push({
            id: null,
            name, target, message, groups: selectedGroups,
            schedule: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }
        });
    } else {
        profiles[activeProfileIndex].name = name;
        profiles[activeProfileIndex].target = target;
        profiles[activeProfileIndex].message = message;
        profiles[activeProfileIndex].groups = selectedGroups;
    }
    
    renderProfileDropdown();
    renderSchedule();
    editModal.classList.remove('active');
};

// Save everything to backend
document.getElementById('save-btn').onclick = async () => {
    const profile = profiles[activeProfileIndex];
    if ((!profile.target && (!profile.groups || profile.groups.length === 0)) || !profile.message) {
        alert("Please set a Target Number OR select at least one Group, and enter a Message in Edit Details.");
        return;
    }

    try {
        const res = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });
        if(res.ok) {
            const savedProfile = await res.json();
            profiles[activeProfileIndex] = savedProfile; // Update ID
            alert("Schedule saved successfully!");
        }
    } catch (e) {
        alert("Error saving schedule.");
    }
};

fetchData();
