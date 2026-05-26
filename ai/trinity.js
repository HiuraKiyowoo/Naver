// ai.js
const axios = require('axios');

// Ambil pesan dari argument command line
const pesanUser = process.argv.slice(2).join(' ') || 'Halo, apa kabar?';

const url = 'https://api.puter.com/drivers/call';

const headers = {
  'Accept': '*/*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Connection': 'keep-alive',
  'Content-Type': 'text/plain;actually=json',
  'Origin': 'https://ish.chat',
  'Referer': 'https://ish.chat/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Infinix X6833B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
  'sec-ch-ua': '"Chromium";v="107", "Not=A?Brand";v="24"',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"'
};

const data = {
  interface: "puter-chat-completion",
  driver: "ai-chat",
  test_mode: false,
  method: "complete",
  args: {
    messages: [
      { role: "user", content: pesanUser }
    ],
    model: "openrouter:arcee-ai/trinity-large-preview:free",
    stream: false
  },
  auth_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoiYXUiLCJ2IjoiMC4wLjAiLCJ1dSI6ImZza3ZERXloUm51NFIxcHdFSVVNU1E9PSIsImF1IjoiclZMTGgyNWxYSk9RZXhWdnhUWVdwZz09IiwicyI6Ikg4aFViTEhBN2doWDBkRVoxNFFFOXc9PSIsImlhdCI6MTc3MzA3Mjk4MX0.J3xj_cPEeoxhlggHWEC5wjfDlNceOnPUH0qLUPzu2C8"
};

async function chatDenganAI() {
  console.log(`📤 Mengirim pesan: "${pesanUser}"`);
  console.log('⏳ Menunggu respon AI...\n');
  
  try {
    const response = await axios.post(url, data, { headers });
    
    if (response.data.success) {
      const jawabanAI = response.data.result.message.content;
      console.log('🤖 Respon AI:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(jawabanAI);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📊 Token dipakai: ${response.data.result.usage.total || response.data.result.usage.completion} completion tokens`);
    } else {
      console.log('❌ Gagal:', response.data);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response ? error.response.data : error.message);
  }
}

chatDenganAI();


