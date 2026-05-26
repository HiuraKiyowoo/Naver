// ai-cli.js - VERSION FOR TERMUX (no shebang)
const axios = require('axios');

// ============================================
// 🔥 TOKEN INDUK LANGSUNG DI SINI BRO!
// Ganti kalo perlu, tapi ini udah work
// ============================================
const SESSION_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoicyIsInYiOiIwLjAuMCIsInUiOiJqbW1DYVdDc1E2dWpKZUVDNWlNbXBnPT0iLCJ1dSI6ImZza3ZERXloUm51NFIxcHdFSVVNU1E9PSIsImlhdCI6MTc3MzA3NTE3N30.Rvqtp1EL3bIKy7TPwHPqJ1lUHm__ySGstA5QqBUfAAs';

async function getGuiToken() {
    try {
        const response = await axios.get('https://puter.com/get-gui-token', {
            headers: { 
                'cookie': `puter_auth_token=${SESSION_TOKEN}`,
                'User-Agent': 'Mozilla/5.0 (Linux; Android 14)'
            }
        });
        return response.data.token;
    } catch (error) {
        console.error('❌ Gagal ambil GUI token:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        return null;
    }
}

async function chatWithAI(pesan) {
    // Step 1: Dapetin GUI token dulu
    console.log('🔄 Ambil GUI token...');
    const guiToken = await getGuiToken();
    if (!guiToken) {
        console.log('❌ Gagal dapet token. Cek session token-nya.');
        return;
    }
    console.log('✅ Token berhasil didapat!\n');

    // Step 2: Kirim chat pake token yang baru
    try {
        const response = await axios.post('https://api.puter.com/drivers/call', {
            interface: "puter-chat-completion",
            driver: "ai-chat",
            method: "complete",
            args: {
                messages: [{ role: "user", content: pesan }],
                model: "arcee-ai/trinity-large-preview:free",
                stream: false
            },
            auth_token: guiToken
        }, {
            headers: { 
                'Content-Type': 'text/plain;actually=json',
                'Origin': 'https://puter.com',
                'Referer': 'https://puter.com/'
            }
        });

        if (response.data.success) {
            console.log('🤖 Respon AI:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(response.data.result.message.content);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📊 Token dipake: ${response.data.result.usage.completion}`);
        } else {
            console.log('❌ Gagal:', response.data);
        }
    } catch (error) {
        console.error('❌ Error chat:', error.response?.data || error.message);
    }
}

// Ambil pesan dari command line
const pesan = process.argv.slice(2).join(' ') || 'Halo';
console.log(`\n👤 Kamu: "${pesan}"\n`);
chatWithAI(pesan);


