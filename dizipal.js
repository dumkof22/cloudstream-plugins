const cheerio = require('cheerio');

// ============ BOT KORUMA İYİLEŞTİRMELERİ ============
// DiziPal sitesi CloudFlare olmadan da bot detection yapıyor!
// Muhtemelen TLS/HTTP2 fingerprinting veya JS challenges kullanıyor.
//
// ÇÖZÜM: Flutter tarafında WebView kullanarak cookie'leri al
// 
// Flutter'da yapılması gerekenler:
// 1. flutter_inappwebview ile gizli bir WebView aç
// 2. BASE_URL'yi yükle (örn: https://dizipal1210.com)
// 3. Cookie'leri al (özellikle session cookies)
// 4. Bu cookie'leri sonraki tüm HTTP isteklerinde kullan
// 5. User-Agent'ı WebView ile aynı tut
//
// JavaScript iyileştirmeleri:
// - Enhanced browser-like headers
// - Realistic timing patterns
// - Sequential request ordering
// - Cookie persistence hints
// =================================================

// ============ GÜVENLİK NOTU ============
// Bu plugin Flutter tarafından sandbox'lanmış bir ortamda çalışır.
// Güvenlik kontrolleri:
// - Sadece HTTP/HTTPS URL'lerine istek atabilir
// - Private IP'lere (127.0.0.1, 192.168.x.x) istek atılamaz
// - Sadece GET/POST metodları kullanılabilir
// - Tek istekte maksimum 20 instruction döndürülebilir
// - Response boyutu maksimum 50 MB
// - Rate limit: Dakikada 100 istek
// Detaylar için: SECURITY_MEASURES.md
// =======================================

// Manifest tanımı
const manifest = {
    id: 'community.dizipal',
    version: '2.0.0',
    name: 'DiziPal',
    description: 'Türkçe dizi ve film izleme platformu - DiziPal için Stremio eklentisi (Instruction Mode)',
    logo: 'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://dizipal953.com&size=128',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'series',
            id: 'dizipal_latest_episodes',
            name: 'Son Bölümler',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_series',
            name: 'Yeni Diziler',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'dizipal_movies',
            name: 'Yeni Filmler',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_netflix',
            name: 'Netflix Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_exxen',
            name: 'Exxen Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_blutv',
            name: 'BluTV Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_disney',
            name: 'Disney+ Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_prime',
            name: 'Amazon Prime Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_anime',
            name: 'Anime',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_scifi_series',
            name: 'Bilimkurgu Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'dizipal_scifi_movies',
            name: 'Bilimkurgu Filmleri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizipal_comedy_series',
            name: 'Komedi Dizileri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'dizipal_comedy_movies',
            name: 'Komedi Filmleri',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'dizipal_search',
            name: 'Film Ara',
            extra: [
                { name: 'search', isRequired: true },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'series',
            id: 'dizipal_search_series',
            name: 'Dizi Ara',
            extra: [
                { name: 'search', isRequired: true },
                { name: 'skip', isRequired: false }]
        }
    ],
    idPrefixes: ['dizipal']
};

const BASE_URL = 'https://dizipal1551.com';

// ============ BOT DETECTION PREVENTION ============
// Delay helper function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Enhanced headers with more browser-like fingerprint
function getEnhancedHeaders(referer = BASE_URL, isAjax = false, includeCookieHint = true) {
    const headers = {
        'Accept': isAjax ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        // Accept-Encoding kaldırıldı - Flutter HTTP client compressed response'u decode edemiyor
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Chromium";v="134", "Not)A;Brand";v="24", "Google Chrome";v="134"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': isAjax ? 'empty' : 'document',
        'Sec-Fetch-Mode': isAjax ? 'cors' : 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Priority': 'u=0, i'
    };

    if (referer) {
        headers['Referer'] = referer;
    }

    if (isAjax) {
        headers['X-Requested-With'] = 'XMLHttpRequest';
        headers['Origin'] = BASE_URL;
    }

    // IMPORTANT: Flutter should inject cookies from WebView here
    // This is a placeholder - Flutter client must handle cookie injection
    if (includeCookieHint) {
        headers['__COOKIE_HINT__'] = 'FLUTTER_INJECT_WEBVIEW_COOKIES';
    }

    return headers;
}

// Katalog URL'lerini dinamik olarak al
function getCatalogUrls() {
    return {
        'dizipal_latest_episodes': `${BASE_URL}/diziler/son-bolumler`,
        'dizipal_series': `${BASE_URL}/diziler`,
        'dizipal_movies': `${BASE_URL}/filmler`,
        'dizipal_netflix': `${BASE_URL}/koleksiyon/netflix`,
        'dizipal_exxen': `${BASE_URL}/koleksiyon/exxen`,
        'dizipal_blutv': `${BASE_URL}/koleksiyon/blutv`,
        'dizipal_disney': `${BASE_URL}/koleksiyon/disney`,
        'dizipal_prime': `${BASE_URL}/koleksiyon/amazon-prime`,
        'dizipal_anime': `${BASE_URL}/diziler?kelime=&durum=&tur=26&type=&siralama=`,
        'dizipal_scifi_series': `${BASE_URL}/diziler?kelime=&durum=&tur=5&type=&siralama=`,
        'dizipal_scifi_movies': `${BASE_URL}/tur/bilimkurgu`,
        'dizipal_comedy_series': `${BASE_URL}/diziler?kelime=&durum=&tur=11&type=&siralama=`,
        'dizipal_comedy_movies': `${BASE_URL}/tur/komedi`
    };
}

// ============ INSTRUCTION HANDLERS ============

async function handleCatalog(args) {
    console.log('\n🎯 [DiziPal Catalog] Generating instructions...');
    console.log('📋 Args:', JSON.stringify(args, null, 2));

    const catalogId = args.id;
    const searchQuery = args.extra?.search;
    const randomId = Math.random().toString(36).substring(2, 10);

    // Search catalogs
    if ((catalogId === 'dizipal_search' || catalogId === 'dizipal_search_series') && searchQuery) {
        const requestId = `dizipal-search-${catalogId}-${Date.now()}-${randomId}`;
        const headers = getEnhancedHeaders(BASE_URL, true);
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

        return {
            instructions: [{
                requestId,
                purpose: 'catalog-search',
                url: `${BASE_URL}/api/search-autocomplete`,
                method: 'POST',
                headers: headers,
                body: `query=${encodeURIComponent(searchQuery)}`,
                metadata: { catalogId }
            }]
        };
    }

    // Normal catalogs
    const catalogUrls = getCatalogUrls();
    const url = catalogUrls[catalogId];

    if (!url) {
        console.log(`Katalog URL bulunamadı: ${catalogId}`);
        return { instructions: [] };
    }

    const requestId = `dizipal-catalog-${catalogId}-${Date.now()}-${randomId}`;
    return {
        instructions: [{
            requestId,
            purpose: 'catalog',
            url: url,
            method: 'GET',
            headers: getEnhancedHeaders(BASE_URL, false),
            metadata: { catalogId }
        }]
    };
}

async function handleMeta(args) {
    const urlBase64 = args.id.replace('dizipal:', '');
    const url = Buffer.from(urlBase64, 'base64').toString('utf-8');

    console.log(`📺 [DiziPal Meta] Generating instructions for: ${url.substring(0, 80)}...`);

    const randomId = Math.random().toString(36).substring(2, 10);
    const requestId = `dizipal-meta-${Date.now()}-${randomId}`;
    return {
        instructions: [{
            requestId,
            purpose: 'meta',
            url: url,
            method: 'GET',
            headers: getEnhancedHeaders(BASE_URL, false)
        }]
    };
}

async function handleStream(args) {
    const urlBase64 = args.id.replace('dizipal:', '');
    const url = Buffer.from(urlBase64, 'base64').toString('utf-8');

    console.log(`🎬 [DiziPal Stream] Generating instructions for: ${url.substring(0, 80)}...`);

    const randomId = Math.random().toString(36).substring(2, 10);
    const requestId = `dizipal-stream-${Date.now()}-${randomId}`;
    return {
        instructions: [{
            requestId,
            purpose: 'stream',
            url: url,
            method: 'GET',
            headers: getEnhancedHeaders(BASE_URL, false)
        }]
    };
}

// ============ FETCH RESULT PROCESSOR ============

// Son bölümler parse etme
function parseSonBolumler($, elem) {
    try {
        const name = $(elem).find('div.name').text().trim();
        if (!name) return null;

        const episode = $(elem).find('div.episode').text().trim()
            .replace('. Sezon ', 'x')
            .replace('. Bölüm', '');

        const title = `${name} ${episode}`;
        const href = $(elem).find('a').attr('href');
        if (!href) return null;

        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        const posterUrl = $(elem).find('img').attr('src');

        // URL'den sezon bilgisini kaldır
        const seriesUrl = fullUrl.split('/sezon')[0];

        const id = 'dizipal:' + Buffer.from(seriesUrl).toString('base64').replace(/=/g, '');

        return {
            id: id,
            type: 'series',
            name: title,
            poster: posterUrl || null
        };
    } catch (e) {
        return null;
    }
}

// Normal dizi/film parse etme
function parseDiziler($, elem) {
    try {
        const title = $(elem).find('span.title').text().trim();
        if (!title) return null;

        const href = $(elem).find('a').attr('href');
        if (!href) return null;

        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        const posterUrl = $(elem).find('img').attr('src');

        const id = 'dizipal:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, '');
        const type = fullUrl.includes('/dizi/') ? 'series' : 'movie';

        return {
            id: id,
            type: type,
            name: title,
            poster: posterUrl || null
        };
    } catch (e) {
        return null;
    }
}

async function processFetchResult(fetchResult) {
    const { purpose, body, url, metadata } = fetchResult;

    console.log(`\n⚙️ [DiziPal Process] Purpose: ${purpose}`);
    console.log(`   URL: ${url?.substring(0, 80)}...`);

    // ========== BOT DETECTION & BLOCKING DETECTION ==========
    if (body && typeof body === 'string') {
        // CloudFlare challenge detection
        if (body.includes('Just a moment') ||
            body.includes('cf-browser-verification') ||
            body.includes('Checking your browser') ||
            body.includes('DDoS protection by Cloudflare') ||
            body.includes('cf_clearance')) {
            console.log('⚠️ CloudFlare challenge detected!');
            console.log('   Flutter tarafında WebView ile cookie alınmalı.');

            // Return empty result instead of error
            if (purpose === 'catalog' || purpose === 'catalog-search') {
                return { metas: [] };
            }
            if (purpose === 'meta') {
                return { meta: null };
            }
            if (purpose === 'stream' || purpose === 'iframe-stream' || purpose === 'series-player-stream') {
                return { streams: [] };
            }
        }

        // Check for other blocking pages
        if (body.includes('Access denied') ||
            body.includes('403 Forbidden') ||
            body.includes('Bot detected') ||
            body.includes('Please enable JavaScript') ||
            body.length < 500) { // Suspiciously small response
            console.log('⚠️ Bot detection or access denied!');
            console.log(`   Response size: ${body.length} bytes`);
            console.log('   Olası sebepler:');
            console.log('   1. TLS/HTTP2 fingerprinting farklı');
            console.log('   2. Cookie/Session eksik');
            console.log('   3. JavaScript challenge çözülmemiş');
            console.log('   4. Behavior pattern (timing) şüpheli');
            console.log('');
            console.log('   ÇÖZÜM: Flutter WebView kullanarak cookie al!');

            // Return empty but don't crash
            if (purpose === 'catalog' || purpose === 'catalog-search') {
                return { metas: [] };
            }
            if (purpose === 'meta') {
                return { meta: null };
            }
            if (purpose === 'stream' || purpose === 'iframe-stream' || purpose === 'series-player-stream') {
                return { streams: [] };
            }
        }
    }

    if (purpose === 'catalog-search') {
        // Search results are JSON
        try {
            const searchResults = JSON.parse(body);
            const metas = [];
            const catalogId = metadata?.catalogId;

            for (const key in searchResults) {
                const item = searchResults[key];
                if (item && item.title && item.url) {
                    const fullUrl = `${BASE_URL}${item.url}`;
                    const type = item.type === 'series' ? 'series' : 'movie';

                    // Katalog tipine göre filtrele
                    if (catalogId === 'dizipal_search' && type !== 'movie') continue;
                    if (catalogId === 'dizipal_search_series' && type !== 'series') continue;

                    const id = 'dizipal:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, '');

                    metas.push({
                        id: id,
                        type: type,
                        name: item.title,
                        poster: item.poster || null
                    });
                }
            }

            console.log(`✅ Found ${metas.length} search results`);
            return { metas };
        } catch (error) {
            console.log('❌ Search parsing error:', error.message);
            return { metas: [] };
        }
    }

    if (purpose === 'catalog') {
        const $ = cheerio.load(body);
        const metas = [];
        const catalogId = metadata?.catalogId;

        // Son bölümler için özel parsing
        if (catalogId === 'dizipal_latest_episodes') {
            $('div.episode-item').each((i, elem) => {
                const meta = parseSonBolumler($, elem);
                if (meta) metas.push(meta);
            });
        } else {
            // Normal dizi/film listesi - birden fazla selector dene
            $('article.type2 ul li').each((i, elem) => {
                const meta = parseDiziler($, elem);
                if (meta) metas.push(meta);
            });

            // Eğer bulunamadıysa alternatif selector'ları dene
            if (metas.length === 0) {
                $('li.film').each((i, elem) => {
                    const title = $(elem).find('span.film-title, span.title, .title').text().trim();
                    const href = $(elem).find('a').attr('href');
                    const posterUrl = $(elem).find('img').attr('src') || $(elem).find('img').attr('data-src');

                    if (title && href) {
                        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                        const id = 'dizipal:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, '');
                        const type = fullUrl.includes('/dizi/') ? 'series' : 'movie';

                        metas.push({
                            id: id,
                            type: type,
                            name: title,
                            poster: posterUrl || null
                        });
                    }
                });
            }

            // Hala bulunamadıysa tüm li'leri dene
            if (metas.length === 0) {
                $('ul li').each((i, elem) => {
                    const title = $(elem).find('span.title, .title, span').first().text().trim();
                    const href = $(elem).find('a').attr('href');
                    const posterUrl = $(elem).find('img').attr('src') || $(elem).find('img').attr('data-src');

                    if (title && href && href.includes('/dizi/')) {
                        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
                        const id = 'dizipal:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, '');

                        metas.push({
                            id: id,
                            type: 'series',
                            name: title,
                            poster: posterUrl || null
                        });
                    }
                });
            }
        }

        console.log(`✅ Found ${metas.length} items in catalog`);
        return { metas };
    }

    if (purpose === 'meta') {
        const $ = cheerio.load(body);

        const poster = $('[property="og:image"]').attr('content');
        const description = $('div.summary p').text().trim();

        // Yapım yılı
        let year = null;
        $('div.col-md-6').each((i, elem) => {
            const label = $(elem).find('div').first().text().trim();
            if (label === 'Yapım Yılı') {
                year = $(elem).find('div').last().text().trim();
            }
        });

        // Türler
        const tags = [];
        $('div.col-md-6').each((i, elem) => {
            const label = $(elem).find('div').first().text().trim();
            if (label === 'Türler') {
                const genresText = $(elem).find('div').last().text().trim();
                tags.push(...genresText.split(' ').map(t => t.trim()).filter(t => t));
            }
        });

        // IMDB Puanı
        let imdbRating = null;
        $('div.col-md-6').each((i, elem) => {
            const label = $(elem).find('div').first().text().trim();
            if (label === 'IMDB Puanı') {
                imdbRating = $(elem).find('div').last().text().trim();
            }
        });

        // Ortalama Süre
        let runtime = null;
        $('div.col-md-6').each((i, elem) => {
            const label = $(elem).find('div').first().text().trim();
            if (label === 'Ortalama Süre') {
                const durationText = $(elem).find('div').last().text().trim();
                const match = durationText.match(/(\d+)/);
                if (match) runtime = `${match[1]} dk`;
            }
        });

        // Dizi mi film mi kontrol et
        if (url.includes('/dizi/')) {
            const title = $('div.cover h5').text().trim();

            // Bölümleri topla
            const videos = [];
            $('div.episode-item').each((i, elem) => {
                const epName = $(elem).find('div.name').text().trim();
                const epHref = $(elem).find('a').attr('href');
                const epText = $(elem).find('div.episode').text().trim();

                if (epHref && epText) {
                    const parts = epText.split(' ');
                    const season = parts[0] ? parseInt(parts[0].replace('.', '')) : null;
                    const episode = parts[2] ? parseInt(parts[2].replace('.', '')) : null;

                    const fullUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
                    const videoId = 'dizipal:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, '');

                    videos.push({
                        id: videoId,
                        title: epName || `${season}. Sezon ${episode}. Bölüm`,
                        season: season,
                        episode: episode
                    });
                }
            });

            return {
                meta: {
                    id: 'dizipal:' + Buffer.from(url).toString('base64').replace(/=/g, ''),
                    type: 'series',
                    name: title,
                    poster: poster || null,
                    background: poster || null,
                    description: description || 'Açıklama mevcut değil',
                    releaseInfo: year || null,
                    imdbRating: imdbRating || null,
                    genres: tags.length > 0 ? tags : undefined,
                    runtime: runtime || null,
                    videos: videos
                }
            };
        } else {
            // Film
            const title = $('div.g-title').eq(1).find('div').text().trim() ||
                $('[property="og:title"]').attr('content') ||
                'Film';

            return {
                meta: {
                    id: 'dizipal:' + Buffer.from(url).toString('base64').replace(/=/g, ''),
                    type: 'movie',
                    name: title,
                    poster: poster || null,
                    background: poster || null,
                    description: description || 'Açıklama mevcut değil',
                    releaseInfo: year || null,
                    imdbRating: imdbRating || null,
                    genres: tags.length > 0 ? tags : undefined,
                    runtime: runtime || null
                }
            };
        }
    }

    if (purpose === 'stream') {
        const $ = cheerio.load(body);
        const streams = [];

        // Debug logging
        console.log('\n🎬 [STREAM DETECTION] Başlıyor...');
        console.log('📄 Body preview:', body.substring(0, 300));
        console.log('🔍 Body içinde anahtar kelimeler:');
        console.log('   - ".m3u8":', body.includes('.m3u8'));
        console.log('   - "series-player":', body.includes('series-player'));
        console.log('   - "iframe":', body.includes('iframe'));
        console.log('   - "embed":', body.includes('embed'));

        // ========== ADIM 1: IFRAME DETECTION (EN GÜVENİLİR) ==========
        console.log('\n1️⃣ Iframe sources kontrol ediliyor...');

        const iframeSources = [
            // Visible iframe in vast_new
            $('#vast_new iframe').attr('src'),
            $('#vast_new iframe').attr('data-src'),

            // Hidden iframe in pre-player (reklam oynarken)
            $('.pre-player iframe').attr('src'),
            $('.pre-player iframe').attr('data-src'),

            // Series-player-container iframe
            $('.series-player-container iframe').attr('src'),
            $('.series-player-container iframe').attr('data-src'),

            // Generic embed iframe
            $('iframe[src*="embed"]').first().attr('src'),
            $('iframe[data-src*="embed"]').first().attr('data-src'),

            // Any iframe with src
            $('iframe[src]').first().attr('src'),
            $('iframe[data-src]').first().attr('data-src')
        ].filter(Boolean); // null/undefined temizle

        console.log(`   Bulunan iframe sources: ${iframeSources.length} adet`);
        if (iframeSources.length > 0) {
            console.log(`   İlk iframe: ${iframeSources[0].substring(0, 60)}...`);
        }

        if (iframeSources.length > 0) {
            // Iframe'leri extraction için instruction olarak döndür
            console.log(`✅ ${iframeSources.length} iframe bulundu, extraction instruction olarak ekleniyor...`);

            const instructions = [];
            for (let i = 0; i < Math.min(iframeSources.length, 5); i++) { // Max 5 iframe
                const iframeSrc = iframeSources[i];
                const iframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `https:${iframeSrc}`;

                console.log(`   Iframe ${i + 1}: ${iframeUrl.substring(0, 80)}...`);

                const randomId = Math.random().toString(36).substring(2, 10);
                const requestId = `dizipal-iframe-extract-${Date.now()}-${randomId}`;

                const iframeHeaders = getEnhancedHeaders(url, false);
                iframeHeaders['Sec-Fetch-Dest'] = 'iframe';
                iframeHeaders['Sec-Fetch-Site'] = 'cross-site';

                instructions.push({
                    requestId,
                    purpose: 'iframe-stream',
                    url: iframeUrl,
                    method: 'GET',
                    headers: iframeHeaders,
                    metadata: { streamName: `DiziPal Server ${i + 1}` }
                });
            }

            console.log(`📊 Toplam ${instructions.length} iframe extraction instruction eklendi`);
            return { instructions };
        }

        // ========== ADIM 2: SERIES-PLAYER ENDPOINT (FALLBACK) ==========
        console.log('\n2️⃣ Series-player kontrol ediliyor...');

        // Body içinde ara
        let seriesPlayerMatch = body.match(/file:\s*["']?(\/series-player\/[^"'\s,]+)["']?/);

        // Script tag'lerinde ara
        if (!seriesPlayerMatch) {
            $('script').each((i, script) => {
                const content = $(script).html() || '';
                if (content.includes('series-player')) {
                    const match = content.match(/["'](\/series-player\/[^"']+)["']/);
                    if (match) {
                        seriesPlayerMatch = match;
                        console.log('   Series-player script tag içinde bulundu');
                        return false; // break
                    }
                }
            });
        }

        // Inline onclick/data attributelerinde ara
        if (!seriesPlayerMatch) {
            $('[onclick*="series-player"], [data-url*="series-player"]').each((i, elem) => {
                const onclick = $(elem).attr('onclick') || '';
                const dataUrl = $(elem).attr('data-url') || '';
                const combined = onclick + dataUrl;
                const match = combined.match(/\/series-player\/[^\s"']+/);
                if (match) {
                    seriesPlayerMatch = [match[0], match[0]];
                    console.log('   Series-player inline attribute içinde bulundu');
                    return false;
                }
            });
        }

        if (seriesPlayerMatch) {
            const seriesPlayerUrl = `${BASE_URL}${seriesPlayerMatch[1] || seriesPlayerMatch[0]}`;
            console.log(`✅ Series player endpoint bulundu: ${seriesPlayerUrl.substring(0, 80)}...`);

            const randomId = Math.random().toString(36).substring(2, 10);
            const requestId = `dizipal-series-player-${Date.now()}-${randomId}`;

            const seriesPlayerHeaders = getEnhancedHeaders(url, true);
            seriesPlayerHeaders['Accept'] = '*/*';

            return {
                instructions: [{
                    requestId,
                    purpose: 'series-player-stream',
                    url: seriesPlayerUrl,
                    method: 'GET',
                    headers: seriesPlayerHeaders,
                    metadata: {
                        originalUrl: url,
                        streamName: 'DiziPal Series Player'
                    }
                }]
            };
        }

        // ========== ADIM 3: DIRECT M3U8 DETECTION ==========
        console.log('\n3️⃣ M3U8 pattern\'leri aranıyor...');

        // ÖNCE: En kesin pattern'ler
        let m3uMatch = body.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
        if (!m3uMatch) m3uMatch = body.match(/source:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/sources:\s*\[\s*["']([^"']+\.m3u8[^"']*)["']/);

        // SONRA: URL içinde m3u8 olanlar
        if (!m3uMatch) {
            m3uMatch = body.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);
        }

        // EN SON: Script tag'leri içinde detaylı arama
        if (!m3uMatch) {
            console.log('   Script tag\'leri taranıyor...');
            const scripts = $('script').toArray();
            for (let script of scripts) {
                const scriptContent = $(script).html() || '';

                if (scriptContent.includes('.m3u8')) {
                    // Önce JSON parse dene
                    if (scriptContent.includes('{') && scriptContent.includes('file')) {
                        try {
                            const jsonMatch = scriptContent.match(/\{[^}]*"file"[^}]*\}/);
                            if (jsonMatch) {
                                const data = JSON.parse(jsonMatch[0]);
                                if (data.file && data.file.includes('.m3u8')) {
                                    m3uMatch = [data.file, data.file];
                                    console.log('   M3U8 JSON formatında bulundu');
                                    break;
                                }
                            }
                        } catch (e) {
                            // JSON parse hatası, devam et
                        }
                    }

                    // Pattern matching
                    if (!m3uMatch) m3uMatch = scriptContent.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
                    if (!m3uMatch) m3uMatch = scriptContent.match(/["']([^"']*\.m3u8[^"']*)["']/);
                    if (!m3uMatch) m3uMatch = scriptContent.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);

                    // Manuel extraction (tüm m3u8 URL'lerini bul)
                    if (!m3uMatch) {
                        const allUrls = scriptContent.match(/https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*/g);
                        if (allUrls && allUrls.length > 0) {
                            // En uzun olanı al (genelde daha detaylı parametrelere sahip)
                            const longestUrl = allUrls.sort((a, b) => b.length - a.length)[0];
                            m3uMatch = [longestUrl, longestUrl];
                            console.log(`   M3U8 manuel extraction ile bulundu (${allUrls.length} aday)`);
                            break;
                        }
                    }

                    // Son çare: .m3u8'den geriye doğru URL çıkar
                    if (!m3uMatch) {
                        const m3u8Pos = scriptContent.indexOf('.m3u8');
                        if (m3u8Pos !== -1) {
                            let urlStart = scriptContent.lastIndexOf('http://', m3u8Pos);
                            if (urlStart === -1) urlStart = scriptContent.lastIndexOf('https://', m3u8Pos);

                            if (urlStart !== -1) {
                                let urlEnd = m3u8Pos + 5;
                                while (urlEnd < scriptContent.length &&
                                    !/[\s"'<>]/.test(scriptContent[urlEnd])) {
                                    urlEnd++;
                                }

                                const extractedUrl = scriptContent.substring(urlStart, urlEnd);
                                m3uMatch = [extractedUrl, extractedUrl];
                                console.log('   M3U8 reverse extraction ile bulundu');
                            }
                        }
                    }

                    if (m3uMatch) break;
                }
            }
        }

        // ========== ADIM 4: STREAM OLUŞTUR ==========
        if (m3uMatch) {
            const finalUrl = m3uMatch[1] || m3uMatch[0];
            console.log(`✅ M3U8 stream bulundu: ${finalUrl.substring(0, 80)}...`);

            streams.push({
                name: 'DiziPal Direct',
                title: 'DiziPal Direct Server',
                url: finalUrl,
                type: 'm3u8',
                behaviorHints: {
                    notWebReady: false // Direkt m3u8, oynatılabilir
                }
            });

            // Altyazıları ve ses parçalarını bul
            const subtitles = [];
            const audioTracks = [];

            // Method 1: "subtitle" field (eski format)
            const subtitleMatch = body.match(/"subtitle":"([^"]+)"/);
            if (subtitleMatch) {
                const subtitleData = subtitleMatch[1];

                if (subtitleData.includes(',')) {
                    const subtitleParts = subtitleData.split(',');
                    for (const part of subtitleParts) {
                        const langMatch = part.match(/\[([^\]]+)\]/);
                        if (langMatch) {
                            const lang = langMatch[1];
                            const subUrl = part.replace(`[${lang}]`, '').trim();
                            if (subUrl) {
                                subtitles.push({
                                    id: lang.toLowerCase().replace(/\s+/g, '_'),
                                    url: subUrl.startsWith('http') ? subUrl : `${BASE_URL}${subUrl}`,
                                    lang: lang
                                });
                            }
                        }
                    }
                } else {
                    const langMatch = subtitleData.match(/\[([^\]]+)\]/);
                    if (langMatch) {
                        const lang = langMatch[1];
                        const subUrl = subtitleData.replace(`[${lang}]`, '').trim();
                        if (subUrl) {
                            subtitles.push({
                                id: lang.toLowerCase().replace(/\s+/g, '_'),
                                url: subUrl.startsWith('http') ? subUrl : `${BASE_URL}${subUrl}`,
                                lang: lang
                            });
                        }
                    }
                }
            }

            // Method 2: JWPlayer tracks format
            const tracksMatch = body.match(/tracks\s*:\s*(\[[\s\S]*?\])/);
            if (tracksMatch) {
                try {
                    const tracksData = JSON.parse(tracksMatch[1]);

                    // Subtitles
                    tracksData.filter(t => t.kind === 'captions' || t.kind === 'subtitles').forEach(track => {
                        if (track.file) {
                            const subUrl = track.file.startsWith('http') ? track.file : `${BASE_URL}${track.file}`;
                            const id = (track.language || track.label || 'tr').toLowerCase().replace(/\s+/g, '_');

                            // Duplicate check
                            if (!subtitles.find(s => s.id === id)) {
                                subtitles.push({
                                    id: id,
                                    url: subUrl,
                                    lang: track.label || track.language || 'Türkçe'
                                });
                            }
                        }
                    });

                    // Audio tracks
                    tracksData.filter(t => t.kind === 'audio' || t.kind === 'audiotrack').forEach(track => {
                        if (track.file) {
                            const audioUrl = track.file.startsWith('http') ? track.file : `${BASE_URL}${track.file}`;
                            audioTracks.push({
                                id: (track.language || track.label || 'default').toLowerCase().replace(/\s+/g, '_'),
                                url: audioUrl,
                                lang: track.label || track.language || 'Orijinal'
                            });
                        }
                    });
                } catch (e) {
                    console.log('⚠️  Tracks parse error:', e.message);
                }
            }

            if (subtitles.length > 0) {
                streams[0].subtitles = subtitles;
                console.log(`   ${subtitles.length} altyazı bulundu`);
            }
            if (audioTracks.length > 0) {
                streams[0].audioTracks = audioTracks;
                console.log(`   ${audioTracks.length} ses parçası bulundu`);
            }
        } else {
            console.log('\n❌ Hiçbir stream kaynağı bulunamadı!');
            console.log('   Kontrol edilenler:');
            console.log('   ✗ Iframe (visible/hidden)');
            console.log('   ✗ Series-player endpoint');
            console.log('   ✗ Direct M3U8 link');
        }

        console.log(`\n📊 Toplam ${streams.length} stream bulundu`);
        return { streams };
    }

    if (purpose === 'iframe-stream') {
        console.log('\n🔍 [IFRAME STREAM DETECTION] Başlıyor...');
        console.log('📄 Iframe body preview:', body.substring(0, 300));
        const streams = [];
        const streamName = metadata?.streamName || 'DiziPal';

        // ÖNCE: En kesin pattern'ler (file:, source:, src:)
        let m3uMatch = body.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
        if (!m3uMatch) m3uMatch = body.match(/source:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/src:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/sources:\s*\[\s*["']([^"']+\.m3u8[^"']*)["']/);

        // SONRA: Direkt URL match (query parametreleri dahil)
        if (!m3uMatch) {
            m3uMatch = body.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);
        }

        // Script tag'leri içinde detaylı arama
        if (!m3uMatch) {
            console.log('   Script tag\'leri taranıyor...');
            const scriptMatches = body.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
            if (scriptMatches) {
                for (const scriptTag of scriptMatches) {
                    const scriptContent = scriptTag.replace(/<\/?script[^>]*>/gi, '');

                    if (scriptContent.includes('.m3u8')) {
                        // JSON parse dene
                        if (scriptContent.includes('{') && scriptContent.includes('file')) {
                            try {
                                const jsonMatch = scriptContent.match(/\{[^}]*"file"[^}]*\}/);
                                if (jsonMatch) {
                                    const data = JSON.parse(jsonMatch[0]);
                                    if (data.file && data.file.includes('.m3u8')) {
                                        m3uMatch = [data.file, data.file];
                                        console.log('   M3U8 JSON formatında bulundu');
                                        break;
                                    }
                                }
                            } catch (e) {
                                // JSON parse hatası, devam et
                            }
                        }

                        // Pattern matching
                        m3uMatch = scriptContent.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
                        if (!m3uMatch) m3uMatch = scriptContent.match(/(https?:\/\/[^\s"'<>()]+master\.m3u8[^\s"'<>()]*)/);
                        if (!m3uMatch) m3uMatch = scriptContent.match(/(https?:\/\/[^\s"'<>()]+playlist\.m3u8[^\s"'<>()]*)/);
                        if (!m3uMatch) m3uMatch = scriptContent.match(/(https?:\/\/[^\s"'<>()]+index\.m3u8[^\s"'<>()]*)/);
                        if (!m3uMatch) m3uMatch = scriptContent.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);
                        if (!m3uMatch) m3uMatch = scriptContent.match(/=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);

                        if (m3uMatch) {
                            console.log('   M3U8 script içinde bulundu');
                            break;
                        }
                    }
                }
            }
        }

        // Tüm body içinde son çare araması (tüm m3u8 URL'lerini bul)
        if (!m3uMatch && body.includes('.m3u8')) {
            console.log('   Son çare: Tüm body taranıyor...');
            const allM3u8 = body.match(/https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*/g);
            if (allM3u8 && allM3u8.length > 0) {
                console.log(`   ${allM3u8.length} adet m3u8 URL bulundu, en uzunu seçiliyor...`);
                // En uzun URL'i al (genelde master.m3u8 daha detaylı parametrelere sahip)
                m3uMatch = [allM3u8.reduce((a, b) => a.length > b.length ? a : b)];
            }
        }

        if (m3uMatch) {
            let m3uLink = m3uMatch[1] || m3uMatch[0];

            // URL'i temizle
            m3uLink = m3uLink.replace(/\\"/g, '"').replace(/\\/g, '').trim();
            m3uLink = m3uLink.replace(/[,;]+$/, '');

            console.log(`✅ Iframe M3U8 bulundu: ${m3uLink.substring(0, 100)}...`);

            streams.push({
                name: streamName,
                title: streamName,
                url: m3uLink,
                type: 'm3u8',
                behaviorHints: {
                    notWebReady: false // Extract edilmiş, direkt oynatılabilir
                }
            });

            // Altyazıları ve ses parçalarını ara
            const subtitles = [];
            const audioTracks = [];

            // Method 1: subtitle field
            const subtitleMatch = body.match(/["']subtitle["']\s*:\s*["']([^"']+)["']/);
            if (subtitleMatch) {
                const subtitleData = subtitleMatch[1];
                if (subtitleData.includes(',')) {
                    const subtitleParts = subtitleData.split(',');
                    for (const part of subtitleParts) {
                        const langMatch = part.match(/\[([^\]]+)\]/);
                        if (langMatch) {
                            const lang = langMatch[1];
                            const subUrl = part.replace(`[${lang}]`, '').trim();
                            if (subUrl) {
                                subtitles.push({
                                    id: lang.toLowerCase().replace(/\s+/g, '_'),
                                    url: subUrl.startsWith('http') ? subUrl : `https:${subUrl}`,
                                    lang: lang
                                });
                            }
                        }
                    }
                } else {
                    const langMatch = subtitleData.match(/\[([^\]]+)\]/);
                    if (langMatch) {
                        const lang = langMatch[1];
                        const subUrl = subtitleData.replace(`[${lang}]`, '').trim();
                        if (subUrl) {
                            subtitles.push({
                                id: lang.toLowerCase().replace(/\s+/g, '_'),
                                url: subUrl.startsWith('http') ? subUrl : `https:${subUrl}`,
                                lang: lang
                            });
                        }
                    }
                }
            }

            // Method 2: tracks array
            const tracksMatch = body.match(/tracks\s*:\s*(\[[\s\S]*?\])/);
            if (tracksMatch) {
                try {
                    const tracksData = JSON.parse(tracksMatch[1]);
                    tracksData.filter(t => t.kind === 'captions' || t.kind === 'subtitles').forEach(track => {
                        if (track.file) {
                            const subUrl = track.file.startsWith('http') ? track.file : `https:${track.file}`;
                            const id = (track.language || track.label || 'tr').toLowerCase().replace(/\s+/g, '_');
                            if (!subtitles.find(s => s.id === id)) {
                                subtitles.push({
                                    id: id,
                                    url: subUrl,
                                    lang: track.label || track.language || 'Türkçe'
                                });
                            }
                        }
                    });
                    tracksData.filter(t => t.kind === 'audio' || t.kind === 'audiotrack').forEach(track => {
                        if (track.file) {
                            const audioUrl = track.file.startsWith('http') ? track.file : `https:${track.file}`;
                            audioTracks.push({
                                id: (track.language || track.label || 'default').toLowerCase().replace(/\s+/g, '_'),
                                url: audioUrl,
                                lang: track.label || track.language || 'Orijinal'
                            });
                        }
                    });
                } catch (e) {
                    console.log('⚠️  Tracks parse error:', e.message);
                }
            }

            if (subtitles.length > 0) {
                streams[0].subtitles = subtitles;
                console.log(`   ${subtitles.length} altyazı bulundu`);
            }
            if (audioTracks.length > 0) {
                streams[0].audioTracks = audioTracks;
                console.log(`   ${audioTracks.length} ses parçası bulundu`);
            }
        } else {
            console.log('\n❌ Iframe içinde M3U8 bulunamadı!');
            if (body.includes('m3u8')) {
                console.log('   ⚠️ Body içinde "m3u8" kelimesi var ama pattern eşleşmedi');
                console.log(`   📄 Body preview: ${body.substring(0, 500)}...`);
            }
        }

        console.log(`\n📊 Iframe'den ${streams.length} stream bulundu`);
        return { streams };
    }

    if (purpose === 'series-player-stream') {
        console.log('\n🔍 [SERIES-PLAYER STREAM DETECTION] Başlıyor...');
        console.log('📄 Series-player body preview:', body.substring(0, 300));
        const streams = [];
        const streamName = metadata?.streamName || 'DiziPal Series Player';

        // ÖNCE: En kesin pattern'ler
        let m3uMatch = body.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
        if (!m3uMatch) m3uMatch = body.match(/source:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/src:\s*["']([^"']+\.m3u8[^"']*)["']/);

        // JSON formatında olabilir
        if (!m3uMatch) {
            try {
                const jsonMatch = body.match(/\{[^}]*"file"[^}]*\}/);
                if (jsonMatch) {
                    const jsonData = JSON.parse(jsonMatch[0]);
                    if (jsonData.file && jsonData.file.includes('.m3u8')) {
                        m3uMatch = [jsonData.file, jsonData.file];
                        console.log('   M3U8 JSON formatında bulundu');
                    }
                }
            } catch (e) {
                // JSON parse hatası, devam et
            }
        }

        // SONRA: Direkt URL match
        if (!m3uMatch) {
            m3uMatch = body.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);
        }

        // Tüm m3u8 URL'lerini ara
        if (!m3uMatch && body.includes('.m3u8')) {
            console.log('   Tüm m3u8 URL\'leri aranıyor...');
            const allUrls = body.match(/https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*/g);
            if (allUrls && allUrls.length > 0) {
                console.log(`   ${allUrls.length} adet m3u8 URL bulundu`);
                m3uMatch = [allUrls.sort((a, b) => b.length - a.length)[0]];
            }
        }

        if (m3uMatch) {
            let m3uLink = m3uMatch[1] || m3uMatch[0];
            m3uLink = m3uLink.replace(/\\"/g, '"').replace(/\\/g, '').trim();
            m3uLink = m3uLink.replace(/[,;]+$/, '');

            console.log(`✅ Series-player M3U8 bulundu: ${m3uLink.substring(0, 100)}...`);

            streams.push({
                name: streamName,
                title: streamName,
                url: m3uLink,
                type: 'm3u8',
                behaviorHints: {
                    notWebReady: false // Extract edilmiş, direkt oynatılabilir
                }
            });

            // Altyazıları ve ses parçalarını ara
            const subtitles = [];
            const audioTracks = [];

            // Method 1: subtitle field
            const subtitleMatch = body.match(/["']subtitle["']\s*:\s*["']([^"']+)["']/);
            if (subtitleMatch) {
                const subtitleData = subtitleMatch[1];
                if (subtitleData.includes(',')) {
                    const subtitleParts = subtitleData.split(',');
                    for (const part of subtitleParts) {
                        const langMatch = part.match(/\[([^\]]+)\]/);
                        if (langMatch) {
                            const lang = langMatch[1];
                            const subUrl = part.replace(`[${lang}]`, '').trim();
                            if (subUrl) {
                                subtitles.push({
                                    id: lang.toLowerCase().replace(/\s+/g, '_'),
                                    url: subUrl.startsWith('http') ? subUrl : `${BASE_URL}${subUrl}`,
                                    lang: lang
                                });
                            }
                        }
                    }
                } else {
                    const langMatch = subtitleData.match(/\[([^\]]+)\]/);
                    if (langMatch) {
                        const lang = langMatch[1];
                        const subUrl = subtitleData.replace(`[${lang}]`, '').trim();
                        if (subUrl) {
                            subtitles.push({
                                id: lang.toLowerCase().replace(/\s+/g, '_'),
                                url: subUrl.startsWith('http') ? subUrl : `${BASE_URL}${subUrl}`,
                                lang: lang
                            });
                        }
                    }
                }
            }

            // Method 2: tracks array
            const tracksMatch = body.match(/tracks\s*:\s*(\[[\s\S]*?\])/);
            if (tracksMatch) {
                try {
                    const tracksData = JSON.parse(tracksMatch[1]);
                    tracksData.filter(t => t.kind === 'captions' || t.kind === 'subtitles').forEach(track => {
                        if (track.file) {
                            const subUrl = track.file.startsWith('http') ? track.file : `${BASE_URL}${track.file}`;
                            const id = (track.language || track.label || 'tr').toLowerCase().replace(/\s+/g, '_');
                            if (!subtitles.find(s => s.id === id)) {
                                subtitles.push({
                                    id: id,
                                    url: subUrl,
                                    lang: track.label || track.language || 'Türkçe'
                                });
                            }
                        }
                    });
                    tracksData.filter(t => t.kind === 'audio' || t.kind === 'audiotrack').forEach(track => {
                        if (track.file) {
                            const audioUrl = track.file.startsWith('http') ? track.file : `${BASE_URL}${track.file}`;
                            audioTracks.push({
                                id: (track.language || track.label || 'default').toLowerCase().replace(/\s+/g, '_'),
                                url: audioUrl,
                                lang: track.label || track.language || 'Orijinal'
                            });
                        }
                    });
                } catch (e) {
                    console.log('⚠️  Tracks parse error:', e.message);
                }
            }

            if (subtitles.length > 0) {
                streams[0].subtitles = subtitles;
                console.log(`   ${subtitles.length} altyazı bulundu`);
            }
            if (audioTracks.length > 0) {
                streams[0].audioTracks = audioTracks;
                console.log(`   ${audioTracks.length} ses parçası bulundu`);
            }
        } else {
            console.log('\n❌ Series-player içinde M3U8 bulunamadı!');
            console.log(`   📄 Body preview: ${body.substring(0, 500)}...`);
        }

        console.log(`\n📊 Series-player'dan ${streams.length} stream bulundu`);
        return { streams };
    }

    return { ok: true };
}

// Export functions
module.exports = {
    manifest,
    getManifest: () => manifest,
    handleCatalog,
    handleMeta,
    handleStream,
    processFetchResult
};
