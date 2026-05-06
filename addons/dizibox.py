import base64
import json
import urllib.parse
import random
import time
import hashlib
from bs4 import BeautifulSoup
from Crypto.Cipher import AES

def cryptojs_decrypt(password, cipher_text):
    try:
        ct_bytes = base64.b64decode(cipher_text)
        salt_bytes = ct_bytes[8:16]
        cipher_text_bytes = ct_bytes[16:]

        key_size = 32
        iv_size = 16

        password_bytes = password.encode('utf-8')
        derived_bytes = evp_kdf(password_bytes, salt_bytes, key_size + iv_size)

        key = derived_bytes[:key_size]
        iv = derived_bytes[key_size:key_size + iv_size]

        cipher = AES.new(key, AES.MODE_CBC, iv)
        decrypted_padded = cipher.decrypt(cipher_text_bytes)
        
        pad_len = decrypted_padded[-1]
        decrypted = decrypted_padded[:-pad_len]
        return decrypted.decode('utf-8')
    except Exception as e:
        print(f"❌ CryptoJS decrypt error: {e}")
        return None

def evp_kdf(password, salt, key_size):
    md5_hashes = []
    digest = b''
    while len(b''.join(md5_hashes)) < key_size:
        hash_obj = hashlib.md5()
        hash_obj.update(digest)
        hash_obj.update(password)
        hash_obj.update(salt)
        digest = hash_obj.digest()
        md5_hashes.append(digest)
    return b''.join(md5_hashes)[:key_size]

def add_wmode_opaque(url):
    if '/player/king/king.php' in url:
        return url.replace('king.php?v=', 'king.php?wmode=opaque&v=')
    elif '/player/moly/moly.php' in url:
        return url.replace('moly.php?h=', 'moly.php?wmode=opaque&h=')
    elif '/player/haydi.php' in url:
        return url.replace('haydi.php?v=', 'haydi.php?wmode=opaque&v=')
    return url

class DiziBoxScraper:
    def __init__(self):
        self.BASE_URL = 'https://www.dizibox.live'
        self.manifest = {
            'id': 'community.dizibox',
            'version': '2.0.0',
            'name': 'DiziBox',
            'description': 'Türkçe dizi izleme platformu - DiziBox için Stremio eklentisi (Instruction Mode)',
            'logo': 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTy_DY_ss3ztVcluDRxvnc45u9o0labczkN4GXDo_fYs12zD_l9ylx5PhK71d1hzSAnDQ&usqp=CAU',
            'resources': ['catalog', 'meta', 'stream'],
            'types': ['series'],
            'catalogs': [
                {'type': 'series', 'id': 'dizibox_yerli', 'name': 'Yerli Diziler', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_archive', 'name': 'Dizi Arşivi', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_action', 'name': 'Aksiyon', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_drama', 'name': 'Drama', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_comedy', 'name': 'Komedi', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_scifi', 'name': 'Bilimkurgu', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_thriller', 'name': 'Gerilim', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_fantasy', 'name': 'Fantastik', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_crime', 'name': 'Suç', 'extra': [{'name': 'skip', 'isRequired': False}]},
                {'type': 'series', 'id': 'dizibox_search', 'name': 'Dizi Ara', 'extra': [{'name': 'search', 'isRequired': True}, {'name': 'skip', 'isRequired': False}]}
            ],
            'idPrefixes': ['dizibox']
        }
        self.DIZIBOX_COOKIES = {
            'LockUser': 'true',
            'isTrustedUser': 'true',
            'dbxu': '1743289650198'
        }
        self.CATALOG_URLS = {
            'dizibox_yerli': f"{self.BASE_URL}/ulke/turkiye",
            'dizibox_archive': f"{self.BASE_URL}/dizi-arsivi/page/SAYFA/",
            'dizibox_action': f"{self.BASE_URL}/tur/aksiyon/page/SAYFA",
            'dizibox_drama': f"{self.BASE_URL}/tur/drama/page/SAYFA",
            'dizibox_comedy': f"{self.BASE_URL}/tur/komedi/page/SAYFA",
            'dizibox_scifi': f"{self.BASE_URL}/tur/bilimkurgu/page/SAYFA",
            'dizibox_thriller': f"{self.BASE_URL}/tur/gerilim/page/SAYFA",
            'dizibox_fantasy': f"{self.BASE_URL}/tur/fantastik/page/SAYFA",
            'dizibox_crime': f"{self.BASE_URL}/tur/suc/page/SAYFA"
        }

    def get_default_headers(self, referer=None):
        if not referer: referer = self.BASE_URL
        cookie_str = "; ".join([f"{k}={v}" for k, v in self.DIZIBOX_COOKIES.items()])
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': referer,
            'Cookie': cookie_str
        }

    def getManifest(self):
        return self.manifest

    async def handleCatalog(self, args):
        catalogId = args.get('id')
        extra = args.get('extra', {})
        searchQuery = extra.get('search')
        skip = int(extra.get('skip', '0'))
        page = (skip // 20) + 1
        randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))

        if catalogId == 'dizibox_search':
            if not searchQuery: return {'metas': []}
            return {
                'instructions': [{
                    'requestId': f"dizibox-search-{int(time.time()*1000)}-{randomId}",
                    'purpose': 'catalog-search',
                    'url': f"{self.BASE_URL}/?s={urllib.parse.quote(searchQuery)}",
                    'method': 'GET',
                    'headers': self.get_default_headers(self.BASE_URL),
                    'metadata': {'catalogId': catalogId, 'hiddenweb': True}
                }]
            }

        url = self.CATALOG_URLS.get(catalogId)
        if not url: return {'instructions': []}
        url = url.replace('SAYFA', str(page))

        return {
            'instructions': [{
                'requestId': f"dizibox-catalog-{catalogId}-{int(time.time()*1000)}-{randomId}",
                'purpose': 'catalog',
                'url': url,
                'method': 'GET',
                'headers': self.get_default_headers(self.BASE_URL),
                'metadata': {'catalogId': catalogId, 'hiddenweb': True}
            }]
        }

    async def handleMeta(self, args):
        urlBase64 = args.get('id', '').replace('dizibox:', '')
        urlBase64 += '=' * (-len(urlBase64) % 4)
        url = base64.b64decode(urlBase64).decode('utf-8')
        randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
        return {
            'instructions': [{
                'requestId': f"dizibox-meta-{int(time.time()*1000)}-{randomId}",
                'purpose': 'meta',
                'url': url,
                'method': 'GET',
                'headers': self.get_default_headers(self.BASE_URL),
                'metadata': {'hiddenweb': True}
            }]
        }

    async def handleStream(self, args):
        urlBase64 = args.get('id', '').replace('dizibox:', '')
        urlBase64 += '=' * (-len(urlBase64) % 4)
        url = base64.b64decode(urlBase64).decode('utf-8')
        randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
        return {
            'instructions': [{
                'requestId': f"dizibox-stream-{int(time.time()*1000)}-{randomId}",
                'purpose': 'stream',
                'url': url,
                'method': 'GET',
                'headers': self.get_default_headers(url),
                'metadata': {'hiddenweb': True}
            }]
        }

    def parse_series_item(self, soup, elem):
        try:
            a_tag = elem.find('a')
            if not a_tag: return None
            title = a_tag.text.strip()
            href = a_tag.get('href')
            if not title or not href: return None
            
            fullUrl = href if href.startswith('http') else f"{self.BASE_URL}{href}"
            img = elem.find('img')
            posterUrl = None
            if img: posterUrl = img.get('data-src') or img.get('src')
            
            meta_id = 'dizibox:' + base64.b64encode(fullUrl.encode('utf-8')).decode('utf-8').replace('=', '')
            return {'id': meta_id, 'type': 'series', 'name': title, 'poster': posterUrl}
        except: return None

    async def processFetchResult(self, fetchResult):
        purpose = fetchResult.get('purpose')
        body = fetchResult.get('body', '')
        url = fetchResult.get('url', '')
        metadata = fetchResult.get('metadata', {})
        status = fetchResult.get('status')

        if status and status != 200:
            if purpose in ['catalog', 'catalog-search']: return {'metas': []}
            if purpose in ['meta', 'season-episodes']: return {'meta': None}
            if 'stream' in purpose or 'iframe' in purpose or 'decrypt' in purpose: return {'streams': []}
            return {'ok': False, 'error': f'HTTP {status}'}

        if purpose in ['catalog-search', 'catalog']:
            soup = BeautifulSoup(body, 'html.parser')
            metas = []
            catalogId = metadata.get('catalogId')
            
            if catalogId == 'dizibox_archive' or purpose == 'catalog-search':
                for elem in soup.select('article.detailed-article'):
                    meta = self.parse_series_item(soup, elem)
                    if meta: metas.append(meta)
                    
            if not metas:
                for elem in soup.select('article.article-series-poster'):
                    meta = self.parse_series_item(soup, elem)
                    if meta: metas.append(meta)
                    
            if not metas:
                for elem in soup.select('article'):
                    meta = self.parse_series_item(soup, elem)
                    if meta: metas.append(meta)
                    
            return {'metas': metas}

        if purpose == 'meta':
            soup = BeautifulSoup(body, 'html.parser')
            title_el = soup.select_one('div.tv-overview h1 a')
            if not title_el: return {'meta': None}
            title = title_el.text.strip()
            
            poster = None
            for selector in ['div.tv-overview figure img', 'div.tv-overview img', 'figure.poster img', 'img.poster']:
                img_el = soup.select_one(selector)
                if img_el and img_el.get('src'):
                    poster = img_el.get('src')
                    break
            if not poster:
                og = soup.select_one('meta[property="og:image"]')
                if og: poster = og.get('content')
                
            if poster and not poster.startswith('http'):
                poster = f"{self.BASE_URL}{poster}" if poster.startswith('/') else f"{self.BASE_URL}/{poster}"
                
            desc_el = soup.select_one('div.tv-story p')
            description = desc_el.text.strip() if desc_el else 'Açıklama mevcut değil'
            
            year = None
            year_el = soup.select_one('a[href*="/yil/"]')
            if year_el:
                try: year = int(year_el.text.strip())
                except: pass
                
            tags = [el.text.strip() for el in soup.select('a[href*="/tur/"]')]
            
            imdbRating = None
            rating_el = soup.select_one('span.label-imdb b')
            if rating_el:
                try: imdbRating = str(float(rating_el.text.strip()))
                except: pass
                
            cast = [el.text.strip() for el in soup.select('a[href*="/oyuncu/"]')]
            
            videos = []
            for elem in soup.select('article.grid-box'):
                ep_a = elem.select_one('div.post-title a')
                if not ep_a: continue
                epTitle = ep_a.text.strip()
                epHref = ep_a.get('href')
                
                if epTitle and epHref:
                    import re
                    seasonMatch = re.search(r'(\d+)\.\s*Sezon', epTitle, re.IGNORECASE)
                    episodeMatch = re.search(r'(\d+)\.\s*Bölüm', epTitle, re.IGNORECASE)
                    season = int(seasonMatch.group(1)) if seasonMatch else 1
                    episode = int(episodeMatch.group(1)) if episodeMatch else None
                    fullEpUrl = epHref if epHref.startswith('http') else f"{self.BASE_URL}{epHref}"
                    videoId = 'dizibox:' + base64.b64encode(fullEpUrl.encode('utf-8')).decode('utf-8').replace('=', '')
                    videos.append({'id': videoId, 'title': epTitle, 'season': season, 'episode': episode})
                    
            seasonLinks = []
            for elem in soup.select('div#seasons-list a'):
                s_href = elem.get('href')
                if s_href: seasonLinks.append(s_href if s_href.startswith('http') else f"{self.BASE_URL}{s_href}")
                
            if seasonLinks:
                limitedSeasonLinks = seasonLinks[:5]
                instructions = []
                for i, link in enumerate(limitedSeasonLinks):
                    randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
                    instructions.append({
                        'requestId': f"dizibox-season-{int(time.time()*1000)}-{randomId}-{i}",
                        'purpose': 'season-episodes',
                        'url': link,
                        'method': 'GET',
                        'headers': self.get_default_headers(url),
                        'metadata': {'seriesUrl': url, 'seriesTitle': title, 'poster': poster, 'hiddenweb': True}
                    })
                    
                partialMeta = {
                    'id': 'dizibox:' + base64.b64encode(url.encode('utf-8')).decode('utf-8').replace('=', ''),
                    'type': 'series',
                    'name': title,
                    'poster': poster,
                    'background': poster,
                    'description': description,
                    'releaseInfo': str(year) if year else None,
                    'imdbRating': imdbRating,
                    'genres': tags if tags else None,
                    'cast': cast if cast else None,
                    'videos': videos
                }
                return {'instructions': instructions, 'partialMeta': partialMeta}
                
            return {
                'meta': {
                    'id': 'dizibox:' + base64.b64encode(url.encode('utf-8')).decode('utf-8').replace('=', ''),
                    'type': 'series',
                    'name': title,
                    'poster': poster,
                    'background': poster,
                    'description': description,
                    'releaseInfo': str(year) if year else None,
                    'imdbRating': imdbRating,
                    'genres': tags if tags else None,
                    'cast': cast if cast else None,
                    'videos': videos
                }
            }

        if purpose == 'season-episodes':
            soup = BeautifulSoup(body, 'html.parser')
            videos = []
            for elem in soup.select('article.grid-box, article.grid-four'):
                ep_link = elem.select_one('div.post-title a')
                epTitle = ep_link.text.strip() if ep_link else None
                epHref = ep_link.get('href') if ep_link else None
                
                if not epTitle or not epHref:
                    seasonEpLink = elem.select_one('a.season-episode')
                    if seasonEpLink:
                        epTitle = seasonEpLink.text.strip()
                        epHref = seasonEpLink.get('href')
                        
                if epTitle and epHref:
                    import re
                    seasonMatch = re.search(r'(\d+)[\.\s]*(Sezon|sezon)', epTitle, re.IGNORECASE)
                    episodeMatch = re.search(r'(\d+)[\.\s]*(Bölüm|bolum|bölum)', epTitle, re.IGNORECASE)
                    season = int(seasonMatch.group(1)) if seasonMatch else 1
                    episode = int(episodeMatch.group(1)) if episodeMatch else None
                    fullEpUrl = epHref if epHref.startswith('http') else f"{self.BASE_URL}{epHref}"
                    videoId = 'dizibox:' + base64.b64encode(fullEpUrl.encode('utf-8')).decode('utf-8').replace('=', '')
                    videos.append({'id': videoId, 'title': epTitle, 'season': season, 'episode': episode})
                    
            seriesTitle = metadata.get('seriesTitle', 'Dizi')
            seriesUrl = metadata.get('seriesUrl', url)
            poster = metadata.get('poster')
            
            return {
                'meta': {
                    'id': 'dizibox:' + base64.b64encode(seriesUrl.encode('utf-8')).decode('utf-8').replace('=', ''),
                    'type': 'series',
                    'name': seriesTitle,
                    'poster': poster,
                    'videos': videos
                }
            }

        if purpose == 'stream':
            soup = BeautifulSoup(body, 'html.parser')
            iframe_el = soup.select_one('div#video-area iframe')
            if not iframe_el or not iframe_el.get('src'): return {'streams': []}
            
            iframeSrc = iframe_el.get('src')
            mainIframeUrl = iframeSrc if iframeSrc.startswith('http') else f"{self.BASE_URL}{iframeSrc}"
            mainIframeUrl = add_wmode_opaque(mainIframeUrl)
            
            instructions = []
            randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
            instructions.append({
                'requestId': f"dizibox-iframe-{int(time.time()*1000)}-{randomId}",
                'purpose': 'iframe-extract',
                'url': mainIframeUrl,
                'method': 'GET',
                'headers': self.get_default_headers(url),
                'metadata': {'originalUrl': url, 'streamName': 'DiziBox Server 1', 'hiddenweb': True}
            })
            
            altServers = []
            altServerIndex = 2
            for elem in soup.select('div.video-toolbar option[value]'):
                altUrl = elem.get('value')
                if altUrl and altUrl != url:
                    fullAltUrl = altUrl if altUrl.startswith('http') else f"{self.BASE_URL}{altUrl}"
                    altServers.append({'url': fullAltUrl, 'name': f"DiziBox Server {altServerIndex}"})
                    altServerIndex += 1
                    
            if altServers:
                firstAlt = altServers[0]
                instructions.append({
                    'requestId': f"dizibox-alt-page-{int(time.time()*1000)}-{randomId}-0",
                    'purpose': 'alternative-page',
                    'url': firstAlt['url'],
                    'method': 'GET',
                    'headers': self.get_default_headers(url),
                    'metadata': {'originalUrl': url, 'streamName': firstAlt['name'], 'hiddenweb': True}
                })
                
            return {'instructions': instructions}

        if purpose == 'alternative-page':
            soup = BeautifulSoup(body, 'html.parser')
            iframe_el = soup.select_one('div#video-area iframe')
            if not iframe_el or not iframe_el.get('src'): return {'streams': []}
            
            iframeUrl = iframe_el.get('src') if iframe_el.get('src').startswith('http') else f"{self.BASE_URL}{iframe_el.get('src')}"
            iframeUrl = add_wmode_opaque(iframeUrl)
            
            randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
            return {
                'instructions': [{
                    'requestId': f"dizibox-alt-iframe-{int(time.time()*1000)}-{randomId}",
                    'purpose': 'iframe-extract',
                    'url': iframeUrl,
                    'method': 'GET',
                    'headers': self.get_default_headers(url),
                    'metadata': {'originalUrl': metadata.get('originalUrl', url), 'streamName': metadata.get('streamName', 'DiziBox'), 'hiddenweb': True}
                }]
            }

        if purpose == 'iframe-extract':
            soup = BeautifulSoup(body, 'html.parser')
            streamName = metadata.get('streamName', 'DiziBox')
            playerIframe_el = soup.select_one('div#Player iframe')
            
            if playerIframe_el and playerIframe_el.get('src'):
                playerIframe = playerIframe_el.get('src')
                fullIframeUrl = playerIframe if playerIframe.startswith('http') else f"{self.BASE_URL}{playerIframe}"
                sheilaUrl = fullIframeUrl.replace('/embed/', '/embed/sheila/').replace('vidmoly.me', 'vidmoly.net')
                
                randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
                if 'dbx.molystream' in sheilaUrl:
                    return {
                        'instructions': [{
                            'requestId': f"dizibox-molystream-{int(time.time()*1000)}-{randomId}",
                            'purpose': 'molystream-direct',
                            'url': sheilaUrl,
                            'method': 'GET',
                            'headers': {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': fullIframeUrl},
                            'metadata': {'streamName': streamName, 'embedUrl': fullIframeUrl, 'hiddenweb': True}
                        }]
                    }
                    
                return {
                    'instructions': [{
                        'requestId': f"dizibox-iframe-stream-{int(time.time()*1000)}-{randomId}",
                        'purpose': 'iframe-stream',
                        'url': sheilaUrl,
                        'method': 'GET',
                        'headers': self.get_default_headers(url),
                        'metadata': {'streamName': streamName, 'embedUrl': fullIframeUrl, 'hiddenweb': True}
                    }]
                }
                
            anyIframe = soup.select_one('iframe')
            if anyIframe and anyIframe.get('src'):
                randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
                return {
                    'instructions': [{
                        'requestId': f"dizibox-general-{int(time.time()*1000)}-{randomId}",
                        'purpose': 'iframe-stream',
                        'url': anyIframe.get('src'),
                        'method': 'GET',
                        'headers': self.get_default_headers(url),
                        'metadata': {'streamName': streamName, 'hiddenweb': True}
                    }]
                }
            return {'streams': []}

        if purpose == 'molystream-direct':
            import re
            m3uMatch = re.search(r'file\s*:\s*["\'](.*?\.m3u8.*?)["\']', body)
            if m3uMatch:
                return {'streams': [{
                    'name': metadata.get('streamName', 'DiziBox'),
                    'title': 'Auto',
                    'url': m3uMatch.group(1),
                    'type': 'm3u8',
                    'behaviorHints': {'notWebReady': False}
                }]}
            return {'streams': []}

        if purpose == 'iframe-stream':
            import re
            streamName = metadata.get('streamName', 'DiziBox')
            
            cryptMatch = re.search(r'CryptoJS\.AES\.decrypt\(["\'](.+?)["\'],\s*["\'](.+?)["\']\)', body)
            if cryptMatch:
                encryptedData = cryptMatch.group(1)
                password = cryptMatch.group(2)
                randomId = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
                return {
                    'instructions': [{
                        'requestId': f"dizibox-decrypt-{int(time.time()*1000)}-{randomId}",
                        'purpose': 'king-decrypt',
                        'url': url,
                        'method': 'GET',
                        'metadata': {'streamName': streamName, 'encryptedData': encryptedData, 'password': password, 'body': body, 'hiddenweb': True}
                    }]
                }
                
            m3uMatch = re.search(r'file:\s*["\']([^"\']+\.m3u8[^"\']*)["\']', body)
            if not m3uMatch: m3uMatch = re.search(r'"file"\s*:\s*"([^"]+\.m3u8[^"]*)"', body)
            if not m3uMatch: m3uMatch = re.search(r'source:\s*["\']([^"\']+\.m3u8[^"\']*)["\']', body)
            if not m3uMatch: m3uMatch = re.search(r'sources:\s*\[\s*["\']([^"\']+\.m3u8[^"\']*)["\']', body)
            if not m3uMatch: m3uMatch = re.search(r'(https?://[^\s"\'<>()]+\.m3u8[^\s"\'<>()]*)', body)
            
            if m3uMatch:
                return {'streams': [{
                    'name': streamName,
                    'title': streamName,
                    'url': m3uMatch.group(1),
                    'type': 'm3u8',
                    'behaviorHints': {'notWebReady': False}
                }]}
            return {'streams': []}

        if purpose == 'king-decrypt':
            encryptedData = metadata.get('encryptedData')
            password = metadata.get('password')
            orig_body = metadata.get('body', '')
            streamName = metadata.get('streamName', 'DiziBox')
            
            if encryptedData and password:
                decrypted = cryptojs_decrypt(password, encryptedData)
                if decrypted:
                    import re
                    m3uMatch = re.search(r'(https?://[^\s"\'<>()]+\.m3u8[^\s"\'<>()]*)', decrypted)
                    if m3uMatch:
                        return {'streams': [{
                            'name': streamName,
                            'title': 'Auto (Decrypted)',
                            'url': m3uMatch.group(1),
                            'type': 'm3u8',
                            'behaviorHints': {'notWebReady': False}
                        }]}
            return {'streams': []}

        return {'ok': True}
