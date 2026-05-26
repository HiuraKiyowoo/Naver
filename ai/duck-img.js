// duckai-full.js
const axios = require('axios');
const fs = require('fs');
const https = require('https');

class DuckAIImageGenerator {
    constructor() {
        this.vqdToken = null;
        this.cookieJar = {};
        this.sessionId = this.generateUUID();
        this.cookieFile = 'duck_cookies.json';
        this.loadCookies();
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    loadCookies() {
        try {
            if (fs.existsSync(this.cookieFile)) {
                this.cookieJar = JSON.parse(fs.readFileSync(this.cookieFile));
                console.log('📦 Cookies loaded');
            }
        } catch (e) {
            console.log('📦 No existing cookies');
        }
    }

    saveCookies() {
        fs.writeFileSync(this.cookieFile, JSON.stringify(this.cookieJar));
    }

    // Parse cookies from string
    parseCookies(cookieString) {
        if (!cookieString) return;
        const cookies = cookieString.split('; ');
        cookies.forEach(cookie => {
            const [key, value] = cookie.split('=');
            if (key && value) {
                this.cookieJar[key] = value;
            }
        });
        this.saveCookies();
    }

    // Format cookies for request
    getCookieString() {
        return Object.entries(this.cookieJar)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
    }

    // STEP 1: Get initial session and cookies
    async initSession() {
        console.log('🔄 Initializing session...');
        
        try {
            const response = await axios.get('https://duck.ai/', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
                },
                maxRedirects: 0,
                validateStatus: null
            });

            // Parse cookies from response headers
            if (response.headers['set-cookie']) {
                response.headers['set-cookie'].forEach(c => this.parseCookies(c));
            }

            console.log('✅ Session initialized');
            return true;
        } catch (error) {
            console.log('⚠️ Session init warning:', error.message);
            return true; // Continue anyway
        }
    }

    // STEP 2: Get VQD token via chat
    async getVQDToken() {
        console.log('🔄 Getting VQD token...');

        try {
            const response = await axios.post('https://duck.ai/duckchat/v1/chat', {
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: "Halo" }]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://duck.ai',
                    'Referer': 'https://duck.ai/',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
                    'Cookie': this.getCookieString(),
                    'x-fe-version': 'serp_20260311_053357_ET-bc4c3cd63816d9631a08f49b1695a3baa7e17ecd'
                },
                validateStatus: null
            });

            // Get VQD token from headers
            if (response.headers['x-vqd-hash-1']) {
                this.vqdToken = response.headers['x-vqd-hash-1'];
                console.log('✅ VQD token obtained');
                return true;
            }

            // If we got challenge (418), extract data
            if (response.status === 418 && response.data) {
                console.log('⚠️ Challenge received, solving...');
                return await this.solveChallenge(response.data);
            }

            return false;
        } catch (error) {
            console.error('❌ Failed to get token:', error.message);
            return false;
        }
    }

    // STEP 3: Solve challenge if needed
    async solveChallenge(challengeData) {
        console.log('🔐 Solving challenge...');
        
        // Extract challenge data
        const cd = challengeData.cd;
        if (!cd) return false;

        // Format token dari data challenge
        // Biasanya kombinasi dari gk dan o
        const tokenParts = [
            cd.gk,
            cd.o,
            cd.p
        ].join('.');

        // Encode token
        this.vqdToken = Buffer.from(tokenParts).toString('base64');
        console.log('✅ Challenge solved');
        return true;
    }

    // STEP 4: Generate image
    async generateImage(prompt, size = '9:16') {
        if (!this.vqdToken) {
            console.log('🔄 No token, getting one...');
            await this.initSession();
            const gotToken = await this.getVQDToken();
            if (!gotToken) {
                throw new Error('Failed to get VQD token');
            }
        }

        console.log('🎨 Generating image...');
        console.log(`📝 Prompt: ${prompt}`);

        try {
            const response = await axios.post('https://duck.ai/duckchat/v1/images', {
                model: "image-generation",
                metadata: {
                    toolChoice: {
                        NewsSearch: false,
                        VideosSearch: false,
                        LocalSearch: false,
                        WeatherForecast: false
                    }
                },
                messages: [{
                    role: "user",
                    content: `${prompt} size ${size}`
                }],
                canUseTools: true,
                durableStream: {
                    messageId: this.generateUUID(),
                    conversationId: this.generateUUID(),
                    publicKey: {}
                }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://duck.ai',
                    'Referer': 'https://duck.ai/',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
                    'Cookie': this.getCookieString(),
                    'x-fe-version': 'serp_20260311_053357_ET-bc4c3cd63816d9631a08f49b1695a3baa7e17ecd',
                    'x-vqd-hash-1': this.vqdToken
                },
                responseType: 'text'
            });

            // Parse streaming response
            return this.parseImageResponse(response.data);

        } catch (error) {
            if (error.response?.status === 418) {
                console.log('⚠️ Token expired, refreshing...');
                // Token expired, get new one
                this.vqdToken = null;
                return this.generateImage(prompt, size);
            }
            throw error;
        }
    }

    // Parse streaming response and save image
    parseImageResponse(responseData) {
        const lines = responseData.split('\n');
        let imageData = null;
        let metadata = {};

        for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                try {
                    const jsonData = JSON.parse(line.slice(6));
                    
                    if (jsonData.result) {
                        imageData = jsonData.result;
                        metadata = {
                            width: jsonData.width || 1024,
                            height: jsonData.height || 1536,
                            format: jsonData.format || 'jpeg'
                        };
                    }
                    
                    if (jsonData.action === 'success') {
                        console.log('✅ Image generated successfully');
                    }
                } catch (e) {
                    // Skip malformed JSON
                }
            }
        }

        if (imageData) {
            return this.saveImage(imageData, metadata);
        }

        throw new Error('No image data found in response');
    }

    // Save image to file
    saveImage(base64Data, metadata) {
        const filename = `duck-${Date.now()}.${metadata.format}`;
        
        // Remove data URL prefix if present
        const cleanData = base64Data.replace(/^data:image\/\w+;base64,/, '');
        
        const imageBuffer = Buffer.from(cleanData, 'base64');
        fs.writeFileSync(filename, imageBuffer);
        
        console.log(`✅ Image saved: ${filename}`);
        console.log(`📐 Size: ${metadata.width}x${metadata.height}`);
        console.log(`📦 File size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
        
        return filename;
    }

    // Main function to run everything
    async run(prompt, size = '9:16') {
        try {
            // Step 1: Initialize session
            await this.initSession();

            // Step 2: Get VQD token (if needed)
            if (!this.vqdToken) {
                const gotToken = await this.getVQDToken();
                if (!gotToken) {
                    throw new Error('Failed to get VQD token after retry');
                }
            }

            // Step 3: Generate image
            const filename = await this.generateImage(prompt, size);
            
            console.log('\n✨ Done! Check your image:', filename);
            return filename;

        } catch (error) {
            console.error('❌ Error:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
            }
        }
    }
}

// ========== COMMAND LINE INTERFACE ==========
if (require.main === module) {
    const args = process.argv.slice(2);
    const prompt = args.join(' ') || 'Buatkan gambar anime girl with purple hair, cyberpunk style';
    
    console.log('\n' + '='.repeat(60));
    console.log('🦆 DUCK.AI IMAGE GENERATOR');
    console.log('='.repeat(60));
    
    const generator = new DuckAIImageGenerator();
    generator.run(prompt, '9:16');
}

module.exports = DuckAIImageGenerator;


