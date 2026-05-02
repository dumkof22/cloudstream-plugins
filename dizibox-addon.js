const cheerio = require('cheerio');
const crypto = require('crypto');

// Manifest tanımı
const manifest = {
    id: 'community.dizibox',
    version: '2.0.0',
    name: 'DiziBox',
    description: 'Türkçe dizi izleme platformu - DiziBox için Stremio eklentisi (Instruction Mode)',
    logo: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTy_DY_ss3ztVcluDRxvnc45u9o0labczkN4GXDo_fYs12zD_l9ylx5PhK71d1hzSAnDQ&usqp=CAU',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    catalogs: [
        {
            type: 'series',
            id: 'dizibox_yerli',
            name: 'Yerli Diziler',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_archive',
            name: 'Dizi Arşivi',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_action',
            name: 'Aksiyon',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_drama',
            name: 'Drama',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_comedy',
            name: 'Komedi',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_scifi',
            name: 'Bilimkurgu',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_thriller',
            name: 'Gerilim',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_fantasy',
            name: 'Fantastik',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_crime',
            name: 'Suç',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'dizibox_search',
            name: 'Dizi Ara',
            extra: [
                { name: 'search', isRequired: true },
                { name: 'skip', isRequired: false }
            ]
        }
    ],
    idPrefixes: ['dizibox']
};

const BASE_URL = 'https://www.dizibox.live';

// DiziBox için özel cookies
const DIZIBOX_COOKIES = {
    'LockUser': 'true',
    'isTrustedUser': 'true',
    'dbxu': '1743289650198'
};

// Basit ve çalışan browser headers (fazla header eklemek anti-bot'u tetikler)
function getDefaultHeaders(referer = BASE_URL) {
    return {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
        'Cookie': Object.entries(DIZIBOX_COOKIES).map(([k, v]) => `${k}=${v}`).join('; ')
    };
}

// Katalog URL'lerini dinamik olarak al
function getCatalogUrls() {
    return {
        'dizibox_yerli': `${BASE_URL}/ulke/turkiye`,
        'dizibox_archive': `${BASE_URL}/dizi-arsivi/page/SAYFA/`,
        'dizibox_action': `${BASE_URL}/tur/aksiyon/page/SAYFA`,
        'dizibox_drama': `${BASE_URL}/tur/drama/page/SAYFA`,
        'dizibox_comedy': `${BASE_URL}/tur/komedi/page/SAYFA`,
        'dizibox_scifi': `${BASE_URL}/tur/bilimkurgu/page/SAYFA`,
        'dizibox_thriller': `${BASE_URL}/tur/gerilim/page/SAYFA`,
        'dizibox_fantasy': `${BASE_URL}/tur/fantastik/page/SAYFA`,
        'dizibox_crime': `${BASE_URL}/tur/suc/page/SAYFA`
    };
}

// CryptoJS AES Decrypt (DiziBox king.php player için)
function cryptoJSDecrypt(password, cipherText) {
    try {
        const ctBytes = Buffer.from(cipherText, 'base64');

        // "Salted__" prefix'i kontrol et
        const saltBytes = ctBytes.slice(8, 16);
        const cipherTextBytes = ctBytes.slice(16);

        // Key ve IV türet (EVP_KDF)
        const keySize = 32; // 256 bit
        const ivSize = 16;  // 128 bit

        const passwordBytes = Buffer.from(password, 'utf8');
        const derivedBytes = evpKDF(passwordBytes, saltBytes, keySize + ivSize);

        const key = derivedBytes.slice(0, keySize);
        const iv = derivedBytes.slice(keySize, keySize + ivSize);

        // AES-256-CBC decrypt
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(cipherTextBytes);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString('utf8');
    } catch (error) {
        console.log('❌ CryptoJS decrypt error:', error.message);
        return null;
    }
}

// EVP_KDF implementasyonu (CryptoJS uyumlu)
function evpKDF(password, salt, keySize) {
    const md5Hashes = [];
    let digest = Buffer.alloc(0);

    while (Buffer.concat(md5Hashes).length < keySize) {
        const hash = crypto.createHash('md5');
        hash.update(digest);
        hash.update(password);
        hash.update(salt);
        digest = hash.digest();
        md5Hashes.push(digest);
    }

    return Buffer.concat(md5Hashes).slice(0, keySize);
}

// wmode=opaque parametresi ekle (Kotlin kodundaki gibi)
function addWmodeOpaque(url) {
    if (url.includes('/player/king/king.php')) {
        return url.replace('king.php?v=', 'king.php?wmode=opaque&v=');
    } else if (url.includes('/player/moly/moly.php')) {
        return url.replace('moly.php?h=', 'moly.php?wmode=opaque&h=');
    } else if (url.includes('/player/haydi.php')) {
        return url.replace('haydi.php?v=', 'haydi.php?wmode=opaque&v=');
    }
    return url;
}

// ============ INSTRUCTION HANDLERS ============

async function handleCatalog(args) {
    console.log('\n🎯 [DiziBox Catalog] Generating instructions...');
    console.log('📋 Args:', JSON.stringify(args, null, 2));

    const catalogId = args.id;
    const searchQuery = args.extra?.search;
    const skip = parseInt(args.extra?.skip || '0');
    const page = Math.floor(skip / 20) + 1;
    const randomId = Math.random().toString(36).substring(2, 10);

    // Search catalog
    if (catalogId === 'dizibox_search') {
        if (!searchQuery) {
            console.log('⚠️ Search kataloğu için search parametresi gerekli');
            return { metas: [] };
        }

        const requestId = `dizibox-search-${Date.now()}-${randomId}`;
        return {
            instructions: [{
                requestId,
                purpose: 'catalog-search',
                url: `${BASE_URL}/?s=${encodeURIComponent(searchQuery)}`,
                method: 'GET',
                headers: getDefaultHeaders(BASE_URL),
                metadata: { catalogId }
            }]
        };
    }

    // Normal catalogs
    const catalogUrls = getCatalogUrls();
    let url = catalogUrls[catalogId];

    if (!url) {
        console.log(`Katalog URL bulunamadı: ${catalogId}`);
        return { instructions: [] };
    }

    // Sayfa numarasını değiştir
    url = url.replace('SAYFA', page.toString());

    const requestId = `dizibox-catalog-${catalogId}-${Date.now()}-${randomId}`;
    return {
        instructions: [{
            requestId,
            purpose: 'catalog',
            url: url,
            method: 'GET',
            headers: getDefaultHeaders(BASE_URL),
            metadata: { catalogId }
        }]
    };
}

async function handleMeta(args) {
    const urlBase64 = args.id.replace('dizibox:', '');
    const url = Buffer.from(urlBase64, 'base64').toString('utf-8');

    console.log(`📺 [DiziBox Meta] Generating instructions for: ${url.substring(0, 80)}...`);

    const randomId = Math.random().toString(36).substring(2, 10);
    const requestId = `dizibox-meta-${Date.now()}-${randomId}`;
    return {
        instructions: [{
            requestId,
            purpose: 'meta',
            url: url,
            method: 'GET',
            headers: getDefaultHeaders(BASE_URL)
        }]
    };
}

async function handleStream(args) {
    const urlBase64 = args.id.replace('dizibox:', '');
    const url = Buffer.from(urlBase64, 'base64').toString('utf-8');

    console.log(`🎬 [DiziBox Stream] Generating instructions for: ${url.substring(0, 80)}...`);

    const randomId = Math.random().toString(36).substring(2, 10);
    const requestId = `dizibox-stream-${Date.now()}-${randomId}`;
    return {
        instructions: [{
            requestId,
            purpose: 'stream',
            url: url,
            method: 'GET',
            headers: getDefaultHeaders(url)
        }]
    };
}

// ============ FETCH RESULT PROCESSOR ============

// Dizi parse etme fonksiyonu
function parseSeriesItem($, elem) {
    try {
        const title = $(elem).find('a').text().trim();
        if (!title) return null;

        const href = $(elem).find('a').attr('href');
        if (!href) return null;

        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

        // Poster URL - data-src veya src
        let posterUrl = $(elem).find('img').attr('data-src');
        if (!posterUrl) {
            posterUrl = $(elem).find('img').attr('src');
        }

        const id = 'dizibox:' + Buffer.from(fullUrl).toString('base64').replace(/=/g, '');

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

async function processFetchResult(fetchResult) {
    const { purpose, body, url, metadata, status } = fetchResult;

    console.log(`\n⚙️ [DiziBox Process] Purpose: ${purpose}`);
    console.log(`   URL: ${url?.substring(0, 80)}...`);

    // HTTP hata kontrolü
    if (status && status !== 200) {
        console.log(`❌ [HTTP Error ${status}] Purpose: ${purpose}`);
        console.log(`   Returning empty result for purpose: ${purpose}`);

        if (purpose === 'catalog' || purpose === 'catalog-search') {
            console.log(`   → Returning empty metas array`);
            return { metas: [] };
        } else if (purpose === 'meta' || purpose === 'season-episodes') {
            console.log(`   → Returning null meta`);
            return { meta: null };
        } else if (purpose.includes('stream') || purpose.includes('iframe') || purpose.includes('decrypt')) {
            console.log(`   → Returning empty streams array`);
            return { streams: [] };
        }

        console.log(`   → Returning error object`);
        return { ok: false, error: `HTTP ${status}` };
    }

    if (purpose === 'catalog-search' || purpose === 'catalog') {
        const $ = cheerio.load(body);
        const metas = [];
        const catalogId = metadata?.catalogId;

        // Dizi Arşivi için özel selector
        if (catalogId === 'dizibox_archive' || purpose === 'catalog-search') {
            $('article.detailed-article').each((i, elem) => {
                const meta = parseSeriesItem($, elem);
                if (meta) metas.push(meta);
            });
        }

        // Eğer bulunamadıysa normal poster selector'ı dene
        if (metas.length === 0) {
            $('article.article-series-poster').each((i, elem) => {
                const meta = parseSeriesItem($, elem);
                if (meta) metas.push(meta);
            });
        }

        // Hala bulunamadıysa tüm article'ları dene
        if (metas.length === 0) {
            $('article').each((i, elem) => {
                const meta = parseSeriesItem($, elem);
                if (meta) metas.push(meta);
            });
        }

        console.log(`✅ Found ${metas.length} items in catalog`);
        return { metas };
    }

    if (purpose === 'meta') {
        const $ = cheerio.load(body);

        const title = $('div.tv-overview h1 a').text().trim();
        if (!title) {
            console.log('❌ Dizi başlığı bulunamadı');
            return { meta: null };
        }

        // Poster - birden fazla selector dene
        let poster = $('div.tv-overview figure img').attr('src');
        if (!poster) poster = $('div.tv-overview img').first().attr('src');
        if (!poster) poster = $('figure.poster img').attr('src');
        if (!poster) poster = $('img.poster').attr('src');
        if (!poster) poster = $('meta[property="og:image"]').attr('content');

        // Poster URL'sini tam URL'ye çevir
        if (poster && !poster.startsWith('http')) {
            poster = poster.startsWith('/') ? `${BASE_URL}${poster}` : `${BASE_URL}/${poster}`;
        }

        console.log(`   Poster URL: ${poster || 'YOK'}`);

        const description = $('div.tv-story p').text().trim();

        // Yapım yılı
        let year = null;
        const yearLink = $('a[href*="/yil/"]').first();
        if (yearLink.length) {
            year = parseInt(yearLink.text().trim());
        }

        // Türler
        const tags = [];
        $('a[href*="/tur/"]').each((i, elem) => {
            tags.push($(elem).text().trim());
        });

        // IMDB puanı
        let imdbRating = null;
        const ratingElem = $('span.label-imdb b');
        if (ratingElem.length) {
            const rating = parseFloat(ratingElem.text().trim());
            if (!isNaN(rating)) {
                imdbRating = rating.toString();
            }
        }

        // Oyuncular
        const cast = [];
        $('a[href*="/oyuncu/"]').each((i, elem) => {
            cast.push($(elem).text().trim());
        });

        // Önce ana sayfadaki bölümleri topla (bazı dizilerde doğrudan listeleniyor)
        const videos = [];
        $('article.grid-box').each((i, elem) => {
            const epTitle = $(elem).find('div.post-title a').first().text().trim();
            const epHref = $(elem).find('div.post-title a').first().attr('href');

            if (epTitle && epHref) {
                // Sezon ve bölüm numaralarını parse et
                const seasonMatch = epTitle.match(/(\d+)\.\s*Sezon/i);
                const episodeMatch = epTitle.match(/(\d+)\.\s*Bölüm/i);

                const season = seasonMatch ? parseInt(seasonMatch[1]) : 1;
                const episode = episodeMatch ? parseInt(episodeMatch[1]) : null;

                const fullEpUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
                const videoId = 'dizibox:' + Buffer.from(fullEpUrl).toString('base64').replace(/=/g, '');

                videos.push({
                    id: videoId,
                    title: epTitle,
                    season: season,
                    episode: episode
                });
            }
        });

        console.log(`   Ana sayfada ${videos.length} bölüm bulundu`);

        // Sezon linklerini topla
        const seasonLinks = [];
        $('div#seasons-list a').each((i, elem) => {
            const seasonUrl = $(elem).attr('href');
            if (seasonUrl) {
                const fullSeasonUrl = seasonUrl.startsWith('http') ? seasonUrl : `${BASE_URL}${seasonUrl}`;
                seasonLinks.push(fullSeasonUrl);
            }
        });

        console.log(`   ${seasonLinks.length} sezon linki bulundu, bölümler için instruction oluşturuluyor...`);

        if (seasonLinks.length > 0) {
            // Ana sayfada bölüm varsa bile sezon sayfalarını da işleyelim
            // Kullanıcı örneğinden anlaşıldığı üzere sezon sayfaları önemli

            // Performans için sezon sayısını sınırlayalım
            const maxSeasons = Math.min(seasonLinks.length, 5); // En fazla 5 sezon al
            const limitedSeasonLinks = seasonLinks.slice(0, maxSeasons);

            if (maxSeasons < seasonLinks.length) {
                console.log(`   ⚡ Performans için sadece ilk ${maxSeasons} sezon alınacak`);
            } else {
                console.log(`   ✅ Tüm sezonlar işlenecek (${seasonLinks.length} sezon)`);
            }

            // Sezon sayfalarını fetch etmek için instructions döndür
            const instructions = [];
            for (let i = 0; i < limitedSeasonLinks.length; i++) {
                const randomId = Math.random().toString(36).substring(2, 10);
                const requestId = `dizibox-season-${Date.now()}-${randomId}-${i}`;

                instructions.push({
                    requestId,
                    purpose: 'season-episodes',
                    url: limitedSeasonLinks[i],
                    method: 'GET',
                    headers: getDefaultHeaders(url),
                    metadata: {
                        seriesUrl: url,
                        seriesTitle: title,
                        poster: poster
                    }
                });
            }

            const partialMeta = {
                id: 'dizibox:' + Buffer.from(url).toString('base64').replace(/=/g, ''),
                type: 'series',
                name: title,
                poster: poster || null,
                background: poster || null,
                description: description || 'Açıklama mevcut değil',
                releaseInfo: year ? year.toString() : null,
                imdbRating: imdbRating,
                genres: tags.length > 0 ? tags : undefined,
                cast: cast.length > 0 ? cast : undefined,
                videos: videos // Ana sayfada bulunan bölümleri ekle
            };

            console.log(`📋 [Meta Response] Returning ${instructions.length} instruction(s) + partialMeta`);
            console.log(`   PartialMeta has ${videos.length} videos from main page`);

            return {
                instructions,
                partialMeta: partialMeta
            };
        }

        // Sezon yoksa ana sayfadaki bölümlerle meta döndür
        console.log(`📋 [Meta Response] No season links, returning complete meta`);
        console.log(`   Meta has ${videos.length} videos from main page`);

        return {
            meta: {
                id: 'dizibox:' + Buffer.from(url).toString('base64').replace(/=/g, ''),
                type: 'series',
                name: title,
                poster: poster || null,
                background: poster || null,
                description: description || 'Açıklama mevcut değil',
                releaseInfo: year ? year.toString() : null,
                imdbRating: imdbRating,
                genres: tags.length > 0 ? tags : undefined,
                cast: cast.length > 0 ? cast : undefined,
                videos: videos // Ana sayfadaki bölümler
            }
        };
    }

    if (purpose === 'season-episodes') {
        const $ = cheerio.load(body);
        const videos = [];

        console.log('   Sezon bölümleri parse ediliyor...');

        // Kullanıcının gönderdiği HTML'e göre düzeltilmiş seçici
        // Hem grid-box hem de grid-four sınıflarını kontrol edelim
        $('article.grid-box, article.grid-four').each((i, elem) => {
            // İlk a etiketini bölüm linki olarak al
            const epLink = $(elem).find('div.post-title a').first();
            let epTitle = epLink.text().trim();
            let epHref = epLink.attr('href');

            // Alternatif olarak season-episode sınıfını da kontrol et
            if (!epTitle || !epHref) {
                const seasonEpLink = $(elem).find('a.season-episode');
                if (seasonEpLink.length) {
                    epTitle = seasonEpLink.text().trim();
                    epHref = seasonEpLink.attr('href');
                }
            }

            if (epTitle && epHref) {
                // Sezon ve bölüm numaralarını parse et (daha esnek regex)
                const seasonMatch = epTitle.match(/(\d+)[\.\s]*(Sezon|sezon)/i);
                const episodeMatch = epTitle.match(/(\d+)[\.\s]*(Bölüm|bolum|bölum)/i);

                const season = seasonMatch ? parseInt(seasonMatch[1]) : 1;
                const episode = episodeMatch ? parseInt(episodeMatch[1]) : null;

                const fullEpUrl = epHref.startsWith('http') ? epHref : `${BASE_URL}${epHref}`;
                const videoId = 'dizibox:' + Buffer.from(fullEpUrl).toString('base64').replace(/=/g, '');

                videos.push({
                    id: videoId,
                    title: epTitle,
                    season: season,
                    episode: episode
                });
            }
        });

        console.log(`   ${videos.length} bölüm bulundu`);

        // Meta formatında döndür - Stremio otomatik birleştirecek
        const seriesTitle = metadata?.seriesTitle || 'Dizi';
        const seriesUrl = metadata?.seriesUrl || url;
        const poster = metadata?.poster;

        const meta = {
            id: 'dizibox:' + Buffer.from(seriesUrl).toString('base64').replace(/=/g, ''),
            type: 'series',
            name: seriesTitle,
            poster: poster || null,
            videos: videos
        };

        console.log(`📋 [Season-Episodes Response] Returning meta with ${videos.length} videos`);
        console.log(`   Meta ID: ${meta.id.substring(0, 40)}...`);

        return { meta };
    }

    if (purpose === 'stream') {
        const $ = cheerio.load(body);
        const streams = [];

        console.log('\n🎬 [STREAM DETECTION] DiziBox stream aranıyor...');

        // Ana video iframe'ini bul
        let iframeSrc = $('div#video-area iframe').attr('src');

        if (!iframeSrc) {
            console.log('❌ Ana iframe bulunamadı');
            return { streams: [] };
        }

        let mainIframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `${BASE_URL}${iframeSrc}`;

        // wmode=opaque parametresi ekle (Kotlin kodundaki gibi)
        mainIframeUrl = addWmodeOpaque(mainIframeUrl);

        console.log(`✅ Ana iframe bulundu: ${mainIframeUrl.substring(0, 80)}...`);

        const instructions = [];
        const randomId = Math.random().toString(36).substring(2, 10);

        // Ana iframe'i işle
        instructions.push({
            requestId: `dizibox-iframe-${Date.now()}-${randomId}`,
            purpose: 'iframe-extract',
            url: mainIframeUrl,
            method: 'GET',
            headers: getDefaultHeaders(url),
            metadata: {
                originalUrl: url,
                streamName: 'DiziBox Server 1'
            }
        });

        // Alternatif sunucuları bul - Kotlin kodundaki gibi sadece ilk alternatifi al
        let altServerIndex = 2;
        const altServers = [];

        $('div.video-toolbar option[value]').each((i, elem) => {
            const altUrl = $(elem).attr('value');
            if (altUrl && altUrl !== url) {
                const fullAltUrl = altUrl.startsWith('http') ? altUrl : `${BASE_URL}${altUrl}`;
                altServers.push({
                    url: fullAltUrl,
                    name: `DiziBox Server ${altServerIndex++}`
                });
            }
        });

        // Sadece ilk alternatif sunucuyu işle (Kotlin kodunda olduğu gibi)
        if (altServers.length > 0) {
            // En fazla 1 alternatif sunucu ekle (ana sunucu çalışmazsa yedek olarak)
            const firstAlt = altServers[0];
            console.log(`   ⚡ Performans için sadece ilk alternatif sunucu işlenecek: ${firstAlt.name}`);

            instructions.push({
                requestId: `dizibox-alt-page-${Date.now()}-${randomId}-0`,
                purpose: 'alternative-page',
                url: firstAlt.url,
                method: 'GET',
                headers: getDefaultHeaders(url),
                metadata: {
                    originalUrl: url,
                    streamName: firstAlt.name
                }
            });
        }

        console.log(`📊 Toplam ${instructions.length} iframe instruction oluşturuldu`);
        return { instructions };
    }

    // Alternatif sunucu sayfasından iframe çıkar (Kotlin kodundaki gibi)
    if (purpose === 'alternative-page') {
        const $ = cheerio.load(body);
        const streamName = metadata?.streamName || 'DiziBox';
        const originalUrl = metadata?.originalUrl || url;

        console.log(`\n🔄 [ALTERNATIVE PAGE] ${streamName} işleniyor...`);
        console.log(`   URL: ${url.substring(0, 80)}...`);

        // Alternatif sayfadan iframe'i çıkar
        let iframeSrc = $('div#video-area iframe').attr('src');

        if (!iframeSrc) {
            console.log('   ❌ Alternatif sayfada iframe bulunamadı');
            return { streams: [] };
        }

        let iframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `${BASE_URL}${iframeSrc}`;

        // wmode=opaque parametresi ekle
        iframeUrl = addWmodeOpaque(iframeUrl);

        console.log(`   ✅ Alternatif iframe bulundu: ${iframeUrl.substring(0, 80)}...`);

        const randomId = Math.random().toString(36).substring(2, 10);
        return {
            instructions: [{
                requestId: `dizibox-alt-iframe-${Date.now()}-${randomId}`,
                purpose: 'iframe-extract',
                url: iframeUrl,
                method: 'GET',
                headers: getDefaultHeaders(url),
                metadata: {
                    originalUrl: originalUrl,
                    streamName: streamName
                }
            }]
        };
    }

    if (purpose === 'iframe-extract') {
        const $ = cheerio.load(body);
        const streams = [];
        const streamName = metadata?.streamName || 'DiziBox';
        const originalUrl = metadata?.originalUrl || url;

        console.log(`\n🔍 [IFRAME EXTRACT] ${streamName} işleniyor...`);
        console.log(`   URL: ${url.substring(0, 80)}...`);

        // Kotlin kodundaki gibi doğrudan Player iframe'i bul ve işle
        const playerIframe = $('div#Player iframe').attr('src');

        if (playerIframe) {
            // İçteki iframe'i doğrudan işle (Kotlin kodundaki gibi)
            const fullIframeUrl = playerIframe.startsWith('http') ? playerIframe : `${BASE_URL}${playerIframe}`;
            console.log(`   ✅ Player iframe bulundu: ${fullIframeUrl.substring(0, 80)}...`);

            // Kotlin kodunda olduğu gibi vidmoly.me -> vidmoly.net değişimi yap
            let sheilaUrl = fullIframeUrl.replace('/embed/', '/embed/sheila/').replace('vidmoly.me', 'vidmoly.net');

            // dbx.molystream kontrolü (Kotlin kodundaki gibi)
            if (sheilaUrl.includes('dbx.molystream')) {
                console.log(`   🎯 dbx.molystream tespit edildi, doğrudan m3u8 alınacak`);

                const randomId = Math.random().toString(36).substring(2, 10);
                return {
                    instructions: [{
                        requestId: `dizibox-molystream-${Date.now()}-${randomId}`,
                        purpose: 'molystream-direct',
                        url: sheilaUrl,
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': fullIframeUrl
                        },
                        metadata: { streamName, embedUrl: fullIframeUrl }
                    }]
                };
            }

            // Diğer iframe'ler için doğrudan stream extraction yap
            const randomId = Math.random().toString(36).substring(2, 10);
            return {
                instructions: [{
                    requestId: `dizibox-iframe-stream-${Date.now()}-${randomId}`,
                    purpose: 'iframe-stream',
                    url: sheilaUrl,
                    method: 'GET',
                    headers: getDefaultHeaders(url),
                    metadata: { streamName, embedUrl: fullIframeUrl }
                }]
            };
        }

        // Genel iframe arama (yedek)
        const anyIframe = $('iframe').first().attr('src');
        if (anyIframe) {
            console.log('   ℹ️ Genel iframe bulundu, stream extraction yapılıyor...');

            const randomId = Math.random().toString(36).substring(2, 10);
            return {
                instructions: [{
                    requestId: `dizibox-general-${Date.now()}-${randomId}`,
                    purpose: 'iframe-stream',
                    url: anyIframe,
                    method: 'GET',
                    headers: getDefaultHeaders(url),
                    metadata: { streamName }
                }]
            };
        }

        console.log('   ❌ Hiçbir iframe bulunamadı');
        return { streams };
    }

    if (purpose === 'king-decrypt') {
        console.log('\n🔓 [KING DECRYPT] CryptoJS decrypt işlemi...');
        const streams = [];
        const streamName = metadata?.streamName || 'DiziBox King';

        // CryptoJS encrypted data'yı bul - hem tek hem çift tırnak için
        const cryptMatch = body.match(/CryptoJS\.AES\.decrypt\(["'](.+?)["'],\s*["'](.+?)["']\)/);

        if (cryptMatch) {
            const encryptedData = cryptMatch[1];
            const password = cryptMatch[2];

            console.log(`   Encrypted data bulundu (${encryptedData.length} chars)`);
            console.log(`   Password: ${password}`);

            const decrypted = cryptoJSDecrypt(password, encryptedData);

            if (decrypted) {
                console.log('   ✅ Decrypt başarılı');

                // Decrypt edilmiş içerikte M3U8 ara - Kotlin kodundaki gibi daha esnek regex
                const fileMatch = decrypted.match(/file:\s*['"](.+?)['"]/);

                if (fileMatch) {
                    let embedUrl = fileMatch[1];
                    console.log(`   ✅ Embed URL bulundu: ${embedUrl.substring(0, 80)}...`);

                    // Kotlin kodundaki gibi: embedUrl'yi sheila URL'sine çevir
                    // Eğer zaten /embed/sheila/ içermiyorsa, /embed/ yerine /embed/sheila/ koy
                    let sheilaUrl;
                    if (embedUrl.includes('/embed/sheila/')) {
                        sheilaUrl = embedUrl;
                        console.log(`   ℹ️ URL zaten sheila formatında`);
                    } else {
                        sheilaUrl = embedUrl.replace('/embed/', '/embed/sheila/');
                        console.log(`   🔄 Sheila URL'ye dönüştürülüyor: ${sheilaUrl.substring(0, 80)}...`);
                    }

                    // Sheila URL'den M3U8 içeriğini fetch et (Kotlin: m3uContent)
                    const randomId = Math.random().toString(36).substring(2, 10);
                    return {
                        instructions: [{
                            requestId: `dizibox-king-sheila-${Date.now()}-${randomId}`,
                            purpose: 'king-sheila',
                            url: sheilaUrl,
                            method: 'GET',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': embedUrl
                            },
                            metadata: { streamName, embedUrl }
                        }]
                    };
                } else {
                    console.log('   ❌ Decrypt edildi ama file: bulunamadı');
                    console.log(`   Decrypted preview: ${decrypted.substring(0, 200)}...`);
                }
            } else {
                console.log('   ❌ Decrypt başarısız');
            }
        } else {
            console.log('   ❌ CryptoJS pattern bulunamadı');
        }

        console.log(`\n📊 King player'dan ${streams.length} stream bulundu`);
        return { streams };
    }

    if (purpose === 'king-sheila' || purpose === 'molystream-direct') {
        console.log(`\n📥 [${purpose === 'king-sheila' ? 'KING SHEILA' : 'MOLYSTREAM DIRECT'}] M3U8 içeriği alınıyor...`);
        const streams = [];
        const streamName = metadata?.streamName || 'DiziBox';
        const embedUrl = metadata?.embedUrl || url;

        // Body'nin kendisi M3U8 playlist içeriği (Kotlin: m3uContent.lineSequence())
        const lines = body.split('\n').map(line => line.trim()).filter(line => line);

        for (const line of lines) {
            // HTTP/HTTPS ile başlayan ilk satırı al (Kotlin: firstOrNull { it.startsWith("http") })
            if (line.startsWith('http://') || line.startsWith('https://')) {
                console.log(`   ✅ M3U8 stream URL bulundu: ${line.substring(0, 80)}...`);

                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': embedUrl
                };

                streams.push({
                    name: `${streamName} 📺 1080p`,
                    title: `${streamName} 📺 1080p`,
                    url: line,
                    type: 'm3u8',
                    behaviorHints: {
                        notWebReady: false,
                        bingeGroup: 'dizibox-stream',
                        httpHeaders: headers, // Flutter format
                        proxyHeaders: { request: headers } // Stremio standard
                    }
                });

                // İlk URL'i kullan
                break;
            }
        }

        if (streams.length === 0) {
            console.log(`   ❌ Response'da HTTP URL bulunamadı`);
            console.log(`   Body preview: ${body.substring(0, 200)}...`);
        }

        console.log(`\n📊 ${purpose === 'king-sheila' ? 'Sheila' : 'Molystream'}'dan ${streams.length} stream bulundu`);
        return { streams };
    }

    if (purpose === 'iframe-stream') {
        console.log('\n🔍 [IFRAME STREAM] M3U8 aranıyor...');
        const streams = [];
        const streamName = metadata?.streamName || 'DiziBox';

        // Önce body'nin kendisinin M3U8 playlist olup olmadığını kontrol et
        if (body.trim().startsWith('#EXTM3U') || body.trim().startsWith('#EXT-X-')) {
            console.log('   ✅ Body M3U8 playlist formatında!');

            // M3U8 playlist'i parse et ve URL'leri çıkar
            const lines = body.split('\n').map(line => line.trim()).filter(line => line);

            for (const line of lines) {
                // HTTP/HTTPS ile başlayan satırları bul
                if (line.startsWith('http://') || line.startsWith('https://')) {
                    console.log(`   ✅ M3U8 stream URL bulundu: ${line.substring(0, 80)}...`);

                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': url,
                        'Origin': new URL(url).origin
                    };

                    streams.push({
                        name: `${streamName} 📺`,
                        title: `${streamName} 📺`,
                        url: line,
                        type: 'm3u8',
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: 'dizibox-stream',
                            httpHeaders: headers, // Flutter format
                            proxyHeaders: { request: headers } // Stremio standard
                        }
                    });

                    // İlk bulduğumuz URL'i kullan (genelde en yüksek kalite)
                    break;
                }
            }

            if (streams.length > 0) {
                console.log(`\n📊 M3U8 playlist'ten ${streams.length} stream bulundu`);
                return { streams };
            }
        }

        // OK.ru için özel extraction
        if (url.includes('ok.ru/videoembed')) {
            console.log('   🔍 OK.ru video tespit edildi, JSON data aranıyor...');

            // Önce video engellenmiş mi kontrol et
            if (body.includes('yayın hakları') ||
                body.includes('engellenmiştir') ||
                body.includes('COPYRIGHTS_RESTRICTED') ||
                body.includes('vp_video_stub __na') ||
                body.includes('blocked') ||
                body.includes('restricted')) {
                console.log('   ⛔ OK.ru videosu telif hakkı nedeniyle engellenmiş');
                console.log('   💡 Bu sunucu kullanılamıyor, diğer sunucuları deneyin');
                // Boş sonuç döndür, diğer sunucular denenecek
                return { streams: [] };
            }

            let videoData = null;
            let jsonStr = null;

            // Pattern 1: data-video attribute
            let okVideoMatch = body.match(/data-video="([^"]+)"/);
            if (!okVideoMatch) okVideoMatch = body.match(/data-video='([^']+)'/);
            if (!okVideoMatch) okVideoMatch = body.match(/data-video=&quot;([^&]+)&quot;/);

            if (okVideoMatch) {
                jsonStr = okVideoMatch[1];
                console.log(`   📄 data-video attribute bulundu`);
            }

            // Pattern 2: data-options attribute
            if (!jsonStr) {
                const dataOptionsMatch = body.match(/data-options="([^"]+)"/);
                if (dataOptionsMatch) {
                    jsonStr = dataOptionsMatch[1];
                    console.log(`   📄 data-options attribute bulundu`);
                }
            }

            // Pattern 3: data-module attribute içinde flashvars
            if (!jsonStr) {
                const dataModuleMatch = body.match(/data-module="OKVideo"[^>]*data-options='([^']+)'/);
                if (dataModuleMatch) {
                    jsonStr = dataModuleMatch[1];
                    console.log(`   📄 data-module OKVideo bulundu`);
                }
            }

            // Pattern 4: JavaScript içinde __PLAYER_CONFIG__ veya benzer değişkenler
            if (!jsonStr) {
                const patterns = [
                    /__PLAYER_CONFIG__\s*=\s*({[\s\S]*?});/,
                    /window\.VideoPlayer\s*=\s*({[\s\S]*?});/,
                    /var\s+flashvars\s*=\s*({[\s\S]*?});/,
                    /data\.flashvars\s*=\s*({[\s\S]*?});/,
                    /videoData\s*=\s*({[\s\S]*?});/
                ];

                for (const pattern of patterns) {
                    const jsMatch = body.match(pattern);
                    if (jsMatch) {
                        jsonStr = jsMatch[1];
                        console.log(`   📄 JavaScript içinde video data bulundu`);
                        break;
                    }
                }
            }

            // Pattern 5: Script tag içinde metadata JSON
            if (!jsonStr && body.includes('metadata')) {
                const metaMatch = body.match(/"metadata"\s*:\s*({[^}]+})/);
                if (metaMatch) {
                    jsonStr = metaMatch[1];
                    console.log(`   📄 metadata JSON bulundu`);
                }
            }

            // JSON string'i varsa parse et
            if (jsonStr) {
                try {
                    // HTML entity'lerini decode et
                    jsonStr = jsonStr
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, '&')
                        .replace(/&#039;/g, "'")
                        .replace(/&#39;/g, "'")
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/\\/g, '');

                    console.log(`   📄 JSON parse ediliyor (${jsonStr.length} chars)...`);

                    videoData = JSON.parse(jsonStr);
                    console.log(`   ✅ JSON parse başarılı, keys: ${Object.keys(videoData).slice(0, 10).join(', ')}`);

                } catch (e) {
                    console.log(`   ❌ JSON parse hatası: ${e.message}`);
                    console.log(`   🔍 JSON preview: ${jsonStr.substring(0, 300)}...`);
                }
            }

            // Video data parse edildiyse stream'leri çıkar
            if (videoData) {
                // HLS URL'i varsa kullan (öncelikli)
                if (videoData.hlsMasterPlaylistUrl) {
                    const hlsUrl = videoData.hlsMasterPlaylistUrl;
                    console.log(`   ✅ OK.ru HLS URL bulundu: ${hlsUrl.substring(0, 80)}...`);

                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': url,
                        'Origin': 'https://ok.ru'
                    };

                    streams.push({
                        name: `${streamName} 📺 HLS`,
                        title: `${streamName} 📺 HLS`,
                        url: hlsUrl,
                        type: 'm3u8',
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: 'dizibox-stream',
                            httpHeaders: headers, // Flutter format
                            proxyHeaders: { request: headers } // Stremio standard
                        }
                    });
                }

                // MP4 videos array'i varsa
                if (videoData.videos && Array.isArray(videoData.videos) && videoData.videos.length > 0) {
                    // En yüksek kaliteli videoyu al
                    const sortedVideos = videoData.videos.sort((a, b) => {
                        const heightA = parseInt(a.name) || parseInt(a.height) || 0;
                        const heightB = parseInt(b.name) || parseInt(b.height) || 0;
                        return heightB - heightA;
                    });

                    for (let i = 0; i < Math.min(sortedVideos.length, 3); i++) {
                        const video = sortedVideos[i];
                        const quality = video.name || video.height || 'SD';
                        console.log(`   ✅ OK.ru video URL bulundu (${quality}): ${video.url.substring(0, 80)}...`);

                        const headers = {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': url,
                            'Origin': 'https://ok.ru'
                        };

                        streams.push({
                            name: `${streamName} 📺 ${quality}`,
                            title: `${streamName} 📺 ${quality}`,
                            url: video.url,
                            type: 'direct',
                            behaviorHints: {
                                notWebReady: false,
                                bingeGroup: 'dizibox-stream',
                                httpHeaders: headers, // Flutter format
                                proxyHeaders: { request: headers } // Stremio standard
                            }
                        });
                    }
                }

                if (streams.length > 0) {
                    console.log(`\n📊 OK.ru'dan ${streams.length} stream bulundu`);
                    return { streams };
                }
            }

            // Hiçbir pattern match etmediyse, detaylı log
            if (!jsonStr) {
                console.log('   ⚠️ OK.ru sayfasında hiçbir video data pattern\'i bulunamadı');
                console.log(`   🔍 Body size: ${body.length} bytes`);
                console.log(`   🔍 Body preview (first 500): ${body.substring(0, 500)}...`);
                console.log(`   🔍 Body preview (chars 1000-1500): ${body.substring(1000, 1500)}...`);

                // data- attribute'larını listele
                const dataAttrs = body.match(/data-[a-z-]+=/gi);
                if (dataAttrs) {
                    console.log(`   🔍 Bulunan data attributes: ${[...new Set(dataAttrs)].join(', ')}`);
                }
            }
        }

        // M3U8 URL'ini bul - daha geniş pattern'ler
        let m3uMatch = body.match(/file:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/);
        if (!m3uMatch) m3uMatch = body.match(/source:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/src:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/playlist:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/videoUrl:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (!m3uMatch) m3uMatch = body.match(/hlsManifestUrl['"]\s*:\s*['"]([^'"]+)['"]/);
        if (!m3uMatch) m3uMatch = body.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);

        // Script tag'lerinde ara
        if (!m3uMatch && body.includes('.m3u8')) {
            const scriptMatches = body.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
            if (scriptMatches) {
                for (const scriptTag of scriptMatches) {
                    const scriptContent = scriptTag.replace(/<\/?script[^>]*>/gi, '');
                    if (scriptContent.includes('.m3u8')) {
                        m3uMatch = scriptContent.match(/(https?:\/\/[^\s"'<>()]+\.m3u8[^\s"'<>()]*)/);
                        if (m3uMatch) break;
                    }
                }
            }
        }

        // Embedded iframe içinde ara
        if (!m3uMatch) {
            const iframeMatch = body.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch) {
                const iframeUrl = iframeMatch[1];
                if (iframeUrl.includes('.m3u8') || iframeUrl.includes('playlist')) {
                    console.log(`   ℹ️ Iframe içinde M3U8 bulundu: ${iframeUrl.substring(0, 80)}...`);
                    m3uMatch = [iframeUrl, iframeUrl];
                }
            }
        }

        if (m3uMatch) {
            let m3uUrl = m3uMatch[1] || m3uMatch[0];
            m3uUrl = m3uUrl.replace(/\\"/g, '"').replace(/\\/g, '').trim();
            m3uUrl = m3uUrl.replace(/[,;]+$/, '');

            console.log(`   ✅ M3U8 bulundu: ${m3uUrl.substring(0, 80)}...`);

            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': url,
                'Origin': new URL(url).origin
            };

            streams.push({
                name: `${streamName} 📺`,
                title: `${streamName} 📺`,
                url: m3uUrl,
                type: 'm3u8',
                behaviorHints: {
                    notWebReady: false,
                    bingeGroup: 'dizibox-stream',
                    httpHeaders: headers, // Flutter format
                    proxyHeaders: { request: headers } // Stremio standard
                }
            });
        } else {
            console.log('   ❌ M3U8 bulunamadı');
            console.log(`   Body preview (first 500 chars): ${body.substring(0, 500)}...`);
        }

        console.log(`\n📊 Iframe'den ${streams.length} stream bulundu`);
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


