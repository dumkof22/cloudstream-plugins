const cheerio = require('cheerio');
const crypto = require('crypto');

// ============ DiziMag Addon ============
// DiziMag sitesi için Stremio eklentisi (Instruction Mode)
// Kotlin kodundan JavaScript'e port edilmiştir
// =======================================

const manifest = {
    id: 'community.dizimag',
    version: '1.0.0',
    name: 'DiziMag',
    description: 'Türkçe dizi ve film izleme platformu - DiziMag için Stremio eklentisi',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'series',
            id: 'dizimag_new_episodes',
            name: 'Yeni Eklenenler',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizimag_search',
            name: 'Arama',
            extra: [{ name: 'search', isRequired: true }]
        },
        {
            type: 'movie',
            id: 'dizimag_search',
            name: 'Arama',
            extra: [{ name: 'search', isRequired: true }]
        },
        // Genres (Dizi)
        { type: 'series', id: 'dizimag_dizi_aile', name: 'Aile' },
        { type: 'series', id: 'dizimag_dizi_aksiyon', name: 'Aksiyon-Macera' },
        { type: 'series', id: 'dizimag_dizi_animasyon', name: 'Animasyon' },
        { type: 'series', id: 'dizimag_dizi_belgesel', name: 'Belgesel' },
        { type: 'series', id: 'dizimag_dizi_bilimkurgu', name: 'Bilim Kurgu' },
        { type: 'series', id: 'dizimag_dizi_dram', name: 'Dram' },
        { type: 'series', id: 'dizimag_dizi_gizem', name: 'Gizem' },
        { type: 'series', id: 'dizimag_dizi_komedi', name: 'Komedi' },
        { type: 'series', id: 'dizimag_dizi_savas', name: 'Savaş Politik' },
        { type: 'series', id: 'dizimag_dizi_suc', name: 'Suç' },
        // Genres (Film)
        { type: 'movie', id: 'dizimag_film_aile', name: 'Aile Film' },
        { type: 'movie', id: 'dizimag_film_animasyon', name: 'Animasyon Film' },
        { type: 'movie', id: 'dizimag_film_bilimkurgu', name: 'Bilim-Kurgu Film' }
    ],
    idPrefixes: ['dizimag']
};

const BASE_URL = 'https://dizimag.nl';

// Headers helper
function getHeaders(referer = BASE_URL) {
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0',
        'Referer': referer
    };
}

// URL helper
function fixUrl(url) {
    if (!url) return null;
    if (url.startsWith('//')) return 'https:' + url;
    if (!url.startsWith('http')) return BASE_URL + (url.startsWith('/') ? '' : '/') + url;
    return url;
}

// Decryption Helper (OpenSSL EVP_BytesToKey)
// Matches DiziMagUtils.kt 'evpkdf' implementation which mimics OpenSSL's EVP_BytesToKey.
// Note: DiziMagUtils.kt overwrites the 'iv' passed to it with the derived IV from the password and salt.
// Therefore, we ignore the 'iv' from the JSON and use the derived IV here as well.
function evp_bytes_to_key(password, salt, keyLen, ivLen) {
    const passwordBuffer = Buffer.from(password);
    const saltBuffer = Buffer.from(salt, 'hex');

    let derivedKey = Buffer.alloc(0);
    let block = null;
    const targetLen = keyLen + ivLen;

    while (derivedKey.length < targetLen) {
        const hash = crypto.createHash('md5');
        if (block) hash.update(block);
        hash.update(passwordBuffer);
        hash.update(saltBuffer);
        block = hash.digest();
        derivedKey = Buffer.concat([derivedKey, block]);
    }

    const key = derivedKey.slice(0, keyLen);
    const iv = derivedKey.slice(keyLen, keyLen + ivLen);
    return { key, iv };
}

function decryptBePlayer(password, cipherText, saltHex) {
    try {
        // Key size 256 bits (32 bytes), IV size 128 bits (16 bytes)
        // Matches DiziMagUtils.kt logic where IV is derived from password+salt
        const { key, iv } = evp_bytes_to_key(password, saltHex, 32, 16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(cipherText, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.log('Decryption error:', e.message);
        return null;
    }
}

// ============ INSTRUCTION HANDLERS ============

async function handleCatalog(args) {
    const catalogId = args.id;
    const skip = parseInt(args.extra?.skip || 0);
    const page = Math.floor(skip / 24) + 1; // Assuming 24 items per page
    const searchQuery = args.extra?.search;

    console.log(`🎯 [DiziMag Catalog] ID: ${catalogId}, Page: ${page}`);

    // Search
    if (catalogId === 'dizimag_search' && searchQuery) {
        return {
            instructions: [{
                requestId: `dizimag-search-${Date.now()}`,
                purpose: 'catalog-search',
                url: `${BASE_URL}/search`,
                method: 'POST',
                headers: {
                    ...getHeaders(),
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01'
                },
                body: `query=${encodeURIComponent(searchQuery)}`
            }]
        };
    }

    // New Episodes
    if (catalogId === 'dizimag_new_episodes') {
        const url = `${BASE_URL}/kesfet/eyJ0eXBlIjoic2VyaWVzIn0=/${page}`;
        return {
            instructions: [{
                requestId: `dizimag-new-${Date.now()}`,
                purpose: 'catalog-new',
                url: url,
                method: 'GET',
                headers: getHeaders()
            }]
        };
    }

    // Genres
    const genreMap = {
        'dizimag_dizi_aile': '/dizi/tur/aile',
        'dizimag_dizi_aksiyon': '/dizi/tur/aksiyon-macera',
        'dizimag_dizi_animasyon': '/dizi/tur/animasyon',
        'dizimag_dizi_belgesel': '/dizi/tur/belgesel',
        'dizimag_dizi_bilimkurgu': '/dizi/tur/bilim-kurgu-fantazi',
        'dizimag_dizi_dram': '/dizi/tur/dram',
        'dizimag_dizi_gizem': '/dizi/tur/gizem',
        'dizimag_dizi_komedi': '/dizi/tur/komedi',
        'dizimag_dizi_savas': '/dizi/tur/savas-politik',
        'dizimag_dizi_suc': '/dizi/tur/suc',
        'dizimag_film_aile': '/film/tur/aile',
        'dizimag_film_animasyon': '/film/tur/animasyon',
        'dizimag_film_bilimkurgu': '/film/tur/bilim-kurgu'
    };

    if (genreMap[catalogId]) {
        const url = `${BASE_URL}${genreMap[catalogId]}`; // Pagination might be needed but not clear in Kotlin
        // Kotlin uses request.data which is the URL.
        // Assuming pagination is /page/X or just /X
        // DiziMag.kt line 52: "${request.data}/${page}"

        return {
            instructions: [{
                requestId: `dizimag-genre-${Date.now()}`,
                purpose: 'catalog-genre',
                url: page > 1 ? `${url}/${page}` : url,
                method: 'GET',
                headers: getHeaders()
            }]
        };
    }

    return { metas: [] };
}

async function handleMeta(args) {
    const id = args.id;
    const url = Buffer.from(id.replace('dizimag:', ''), 'base64').toString('utf-8');

    console.log(`📺 [DiziMag Meta] URL: ${url}`);

    return {
        instructions: [{
            requestId: `dizimag-meta-${Date.now()}`,
            purpose: 'meta',
            url: url,
            method: 'GET',
            headers: getHeaders()
        }]
    };
}

async function handleStream(args) {
    const id = args.id;
    const url = Buffer.from(id.replace('dizimag:', ''), 'base64').toString('utf-8');

    console.log(`🎬 [DiziMag Stream] URL: ${url}`);

    // First fetch main page to init session (get cookies)
    return {
        instructions: [{
            requestId: `dizimag-init-${Date.now()}`,
            purpose: 'init-session',
            url: BASE_URL,
            method: 'GET',
            headers: getHeaders(),
            metadata: {
                targetUrl: url
            }
        }]
    };
}

// ============ FETCH RESULT PROCESSOR ============

async function processFetchResult(fetchResult) {
    const { purpose, body, url, metadata } = fetchResult;

    // ========== CATALOGS ==========
    if (purpose === 'catalog-new' || purpose === 'catalog-genre') {
        const $ = cheerio.load(body);
        const metas = [];

        // Keşfet sayfası (Yeni Eklenenler)
        if (purpose === 'catalog-new') {
            $('div.filter-result-box').each((i, elem) => {
                const title = $(elem).find('h2.truncate').text().trim();
                const href = $(elem).find('div.filter-result-box-image a').attr('href');
                const posterUrl = $(elem).find('div.filter-result-box-image img').attr('data-src');

                if (title && href) {
                    const fullUrl = fixUrl(href);
                    const type = href.includes('/dizi/') ? 'series' : 'movie';

                    metas.push({
                        id: 'dizimag:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, ''),
                        type: type,
                        name: title,
                        poster: fixUrl(posterUrl)
                    });
                }
            });
        }
        // Tür sayfaları (Genres)
        else if (purpose === 'catalog-genre') {
            $('div.poster-long').each((i, elem) => {
                const title = $(elem).find('h2.truncate').text().trim();
                const href = $(elem).find('div.poster-long-image a').attr('href');
                const posterUrl = $(elem).find('div.poster-long-image img').attr('data-src');

                if (title && href) {
                    const fullUrl = fixUrl(href);
                    const type = href.includes('/dizi/') ? 'series' : 'movie';

                    metas.push({
                        id: 'dizimag:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, ''),
                        type: type,
                        name: title,
                        poster: fixUrl(posterUrl)
                    });
                }
            });
        }

        return { metas };
    }

    if (purpose === 'catalog-search') {
        try {
            const json = JSON.parse(body);
            if (!json.success || !json.theme) return { metas: [] };

            const $ = cheerio.load(json.theme);
            const metas = [];

            // Series - <a> elementi .result-series'in parent'ı
            $('.result-series').each((i, elem) => {
                const parentA = $(elem).parent('a');
                const href = parentA.attr('href');
                const title = $(elem).find('span.truncate').text().trim();
                const posterUrl = $(elem).find('img').attr('data-src');

                if (title && href) {
                    const fullUrl = fixUrl(href);
                    metas.push({
                        id: 'dizimag:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, ''),
                        type: 'series',
                        name: title,
                        poster: fixUrl(posterUrl)
                    });
                }
            });

            // Movies - href ve title .result-movies-text içindeki a'da
            $('.result-movies').each((i, elem) => {
                const titleLink = $(elem).find('.result-movies-text a');
                const href = titleLink.attr('href');
                const title = titleLink.text().trim();
                const posterUrl = $(elem).find('.result-movies-image img').attr('data-src');

                if (title && href) {
                    const fullUrl = fixUrl(href);
                    metas.push({
                        id: 'dizimag:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, ''),
                        type: 'movie',
                        name: title,
                        poster: fixUrl(posterUrl)
                    });
                }
            });

            return { metas };
        } catch (e) {
            console.log('Search parse error:', e);
            return { metas: [] };
        }
    }

    // ========== META ==========
    if (purpose === 'meta') {
        const $ = cheerio.load(body);

        const title = $('div.page-title h1 a').text().trim();
        const orgTitle = $('div.page-title p').text().trim();
        const fullTitle = orgTitle ? `${title} - ${orgTitle}` : title;

        const poster = $('div.series-profile-image img').attr('src');
        const year = $('h1 span').text().split('(')[1]?.split(')')[0];
        const rating = $('span.color-imdb').text().trim();
        const description = $('div.series-profile-summary p').text().trim();
        const tags = $('div.series-profile-type a').map((i, el) => $(el).text().trim()).get();

        const actors = $('div.series-profile-cast li').map((i, el) => {
            return $(el).find('h5.truncate').text().trim();
        }).get();

        // Episodes - Yeni yapı
        const videos = [];
        if (url.includes('/dizi/')) {
            // Sezonları bul
            $('div.series-profile-episodes-area').each((seasonIndex, seasonElem) => {
                const seasonNo = seasonIndex + 1;

                // Her sezondaki bölümleri bul
                $(seasonElem).find('li').each((epIndex, epElem) => {
                    const epName = $(epElem).find('h6.truncate a').text().trim();
                    const epHref = $(epElem).find('a').first().attr('href');

                    if (epName && epHref) {
                        const episodeNo = epIndex + 1;
                        videos.push({
                            id: 'dizimag:' + Buffer.from(fixUrl(epHref)).toString('base64').replace(/=/g, ''),
                            title: epName,
                            season: seasonNo,
                            episode: episodeNo
                        });
                    }
                });
            });
        }

        const type = url.includes('/dizi/') ? 'series' : 'movie';

        return {
            meta: {
                id: 'dizimag:' + Buffer.from(url).toString('base64').replace(/=/g, ''),
                type: type,
                name: fullTitle,
                poster: fixUrl(poster),
                background: fixUrl(poster),
                description: description,
                releaseInfo: year,
                imdbRating: rating,
                genres: tags,
                cast: actors,
                videos: videos.length > 0 ? videos : undefined
            }
        };
    }

    // ========== STREAM FLOW ==========
    if (purpose === 'init-session') {
        // Just to get cookies, now fetch the actual page
        // Note: In this environment, we assume cookies are preserved if the system supports it.
        // If not, we might fail, but DiziMag.kt explicitly handles it.
        // We will proceed to fetch the stream page.

        return {
            instructions: [{
                requestId: `dizimag-stream-page-${Date.now()}`,
                purpose: 'stream-page',
                url: metadata.targetUrl,
                method: 'GET',
                headers: getHeaders()
            }]
        };
    }

    if (purpose === 'stream-page') {
        const $ = cheerio.load(body);
        const iframeSrc = $('div#tv-spoox2 iframe').attr('src');

        if (!iframeSrc) {
            console.log('❌ Iframe not found');
            return { streams: [] };
        }

        const iframeUrl = fixUrl(iframeSrc);
        console.log(`✅ Iframe found: ${iframeUrl}`);

        return {
            instructions: [{
                requestId: `dizimag-iframe-${Date.now()}`,
                purpose: 'stream-iframe',
                url: iframeUrl,
                method: 'GET',
                headers: getHeaders(url)
            }]
        };
    }

    if (purpose === 'stream-iframe') {
        const $ = cheerio.load(body);
        let bePlayerScript = null;

        $('script').each((i, elem) => {
            const html = $(elem).html();
            if (html && html.includes("bePlayer")) {
                bePlayerScript = html;
            }
        });

        if (bePlayerScript) {
            const match = /bePlayer\('(.*?)', '(.*?)'\)/.exec(bePlayerScript);
            if (match) {
                const key = match[1];
                const jsonCipherStr = match[2];

                try {
                    const cipherData = JSON.parse(jsonCipherStr.replace(/\\\//g, '/'));
                    // cipherData has ct, iv, s

                    console.log(`🔐 Decrypting bePlayer... Key: ${key.substring(0, 5)}...`);

                    const decrypted = decryptBePlayer(key, cipherData.ct, cipherData.s);

                    if (decrypted) {
                        const jsonData = JSON.parse(decrypted);
                        const streams = [];
                        const subtitles = [];

                        // Subtitles
                        if (jsonData.strSubtitles && Array.isArray(jsonData.strSubtitles)) {
                            jsonData.strSubtitles.forEach(sub => {
                                const keywords = ['tur', 'tr', 'türkçe', 'turkce'];
                                const label = sub.label || '';
                                const isTurkish = keywords.some(k => label.toLowerCase().includes(k));
                                const lang = isTurkish ? 'Turkish' : label;

                                subtitles.push({
                                    id: lang.toLowerCase().replace(/\s+/g, '_'),
                                    url: 'https://epikplayer.xyz' + sub.file,
                                    lang: lang
                                });
                            });
                        }

                        // Stream
                        if (jsonData.video_location) {
                            streams.push({
                                name: 'DiziMag',
                                title: 'Auto',
                                url: jsonData.video_location,
                                type: 'm3u8',
                                subtitles: subtitles.length > 0 ? subtitles : undefined,
                                behaviorHints: {
                                    notWebReady: false,
                                    proxyHeaders: {
                                        request: {
                                            'Referer': url, // Iframe URL
                                            'User-Agent': getHeaders()['User-Agent']
                                        }
                                    }
                                }
                            });
                        }

                        return { streams };
                    }
                } catch (e) {
                    console.log('❌ Decryption/Parsing error:', e);
                }
            }
        }

        console.log('❌ bePlayer not found or failed');
        return { streams: [] };
    }

    return { metas: [] };
}

module.exports = {
    manifest,
    getManifest: () => manifest,
    handleCatalog,
    handleMeta,
    handleStream,
    processFetchResult
};



