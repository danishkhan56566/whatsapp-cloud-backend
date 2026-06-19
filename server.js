const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const dataDir = process.env.DATA_DIR || __dirname;
const DB_FILE = path.join(dataDir, 'database.json');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// --- Express App Setup ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readDb() {
    try {
        const rawData = fs.readFileSync(DB_FILE);
        return JSON.parse(rawData);
    } catch (err) {
        console.error("Error reading database:", err);
        return { profiles: [] };
    }
}

function writeDb(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// API: Get Profiles
app.get('/api/profiles', (req, res) => {
    res.json(readDb().profiles || []);
});

// API: Update Profile (Save changes)
app.post('/api/profiles', (req, res) => {
    const profile = req.body;
    const db = readDb();
    
    if (!db.profiles) db.profiles = [];
    
    const idx = db.profiles.findIndex(p => p.id === profile.id);
    if (idx !== -1) {
        // preserve lastRun
        profile.lastRun = db.profiles[idx].lastRun || {};
        db.profiles[idx] = profile;
    } else {
        profile.id = Date.now();
        profile.lastRun = {};
        db.profiles.push(profile);
    }
    
    writeDb(db);
    res.status(200).json(profile);
});

// API: Get WhatsApp Groups
app.get('/api/groups', async (req, res) => {
    if (!isWhatsappReady) {
        return res.status(503).json({ error: "WhatsApp not ready yet. Please wait a moment." });
    }
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup).map(g => ({
            id: g.id._serialized,
            name: g.name
        }));
        res.json(groups);
    } catch (e) {
        console.error("Error fetching groups:", e);
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`UI Dashboard running on port ${PORT}`));


// --- WhatsApp Bot Setup ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dataDir }),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

let isWhatsappReady = false;

client.on('qr', (qr) => {
    console.log('====== SCAN THIS QR CODE IN YOUR WHATSAPP ======');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready! Bot is now running locally.');
    isWhatsappReady = true;
});

client.on('auth_failure', msg => {
    console.error('WhatsApp Authentication failure:', msg);
});

client.initialize();

// Run every minute
cron.schedule('* * * * *', async () => {
    if (!isWhatsappReady) return;

    try {
        const now = new Date();
        const currentDay = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
        const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

        const db = readDb();
        let modified = false;

        if (!db.profiles) return;

        for (const profile of db.profiles) {
            const timesToday = profile.schedule[currentDay] || [];
            
            if (timesToday.includes(currentTime)) {
                // Ensure we haven't already run this exact time today
                if (profile.lastRun && profile.lastRun[currentDay] === currentTime) {
                    continue; 
                }

                console.log(`Executing Profile: ${profile.name} - Sending "${profile.message}"`);
                
                // Send to individual target if exists
                if (profile.target) {
                    const chatId = `${profile.target}@c.us`; 
                    try {
                        await client.sendMessage(chatId, profile.message);
                        console.log(`Sent to individual: ${profile.target}`);
                    } catch (err) {
                        console.error(`Failed to send to ${profile.target}:`, err.message);
                    }
                }

                // Send to selected groups
                if (profile.groups && profile.groups.length > 0) {
                    for (const groupId of profile.groups) {
                        try {
                            await client.sendMessage(groupId, profile.message);
                            console.log(`Sent to group: ${groupId}`);
                        } catch (err) {
                            console.error(`Failed to send to group ${groupId}:`, err.message);
                        }
                    }
                }

                // Update last run
                if (!profile.lastRun) profile.lastRun = {};
                profile.lastRun[currentDay] = currentTime;
                modified = true;
            }
        }

        if (modified) {
            writeDb(db);
        }

    } catch (e) {
        console.error("Cron Job Error:", e);
    }
});

// --- Auto-Ping for Render Free Tier ---
// Keeps the server awake without needing cron-job.org
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    console.log(`Self-pinging activated for: ${RENDER_URL}`);
    setInterval(async () => {
        try {
            await fetch(RENDER_URL);
            console.log(`[Keep-Awake] Pinged ${RENDER_URL}`);
        } catch (err) {
            console.error('[Keep-Awake] Ping failed:', err.message);
        }
    }, 14 * 60 * 1000); // 14 minutes
}
