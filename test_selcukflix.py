import asyncio
from addons.selcukflix import SelcukFlixScraper
import httpx
import base64

async def main():
    scraper = SelcukFlixScraper()
    
    # 1. Fetch catalog
    print("Fetching catalog...")
    catalog_res = await scraper.handleCatalog({'id': 'selcukflix_turkish'})
    
    instruction = catalog_res['instructions'][0]
    async with httpx.AsyncClient() as client:
        res = await client.request(
            method=instruction['method'],
            url=instruction['url'],
            headers=instruction['headers'],
            data=instruction.get('body')
        )
        fetch_result = {
            'purpose': instruction['purpose'],
            'body': res.text,
            'url': instruction['url'],
            'metadata': instruction['metadata']
        }
        
        cat_result = await scraper.processFetchResult(fetch_result)
        metas = cat_result.get('metas', [])
        print(f"Got {len(metas)} items in catalog")
        
        if not metas:
            return
            
        first_item = metas[0]
        print(f"First item: {first_item['name']} ({first_item['id']})")
        
        # 2. Fetch meta
        print("Fetching meta...")
        meta_res = await scraper.handleMeta({'id': first_item['id']})
        meta_inst = meta_res['instructions'][0]
        
        res = await client.request(
            method=meta_inst['method'],
            url=meta_inst['url'],
            headers=meta_inst['headers']
        )
        fetch_result = {
            'purpose': meta_inst['purpose'],
            'body': res.text,
            'url': meta_inst['url'],
            'metadata': meta_inst.get('metadata', {})
        }
        
        meta_result = await scraper.processFetchResult(fetch_result)
        meta = meta_result.get('meta')
        if not meta:
            print("Meta not found")
            return
            
        print(f"Meta: {meta['name']}")
        
        # 3. Fetch stream
        stream_id = None
        if meta.get('videos') and len(meta['videos']) > 0:
            stream_id = meta['videos'][0]['id']
            print(f"Fetching stream for video: {meta['videos'][0]['title']}")
        else:
            stream_id = meta['id']
            print("Fetching stream for movie")
            
        stream_res = await scraper.handleStream({'id': stream_id})
        stream_inst = stream_res['instructions'][0]
        
        res = await client.request(
            method=stream_inst['method'],
            url=stream_inst['url'],
            headers=stream_inst['headers']
        )
        fetch_result = {
            'purpose': stream_inst['purpose'],
            'body': res.text,
            'url': stream_inst['url'],
            'metadata': stream_inst.get('metadata', {})
        }
        
        stream_result = await scraper.processFetchResult(fetch_result)
        
        # Execute further instructions if any
        current_result = stream_result
        while 'instructions' in current_result and len(current_result['instructions']) > 0:
            inst = current_result['instructions'][0]
            print(f"Executing stream instruction: {inst['purpose']} - {inst['url']}")
            
            res = await client.request(
                method=inst['method'],
                url=inst['url'],
                headers=inst.get('headers', {}),
                data=inst.get('body')
            )
            fetch_result = {
                'purpose': inst['purpose'],
                'body': res.text,
                'url': inst['url'],
                'metadata': inst.get('metadata', {})
            }
            with open(f"test_extractor_{inst['purpose']}.html", 'w', encoding='utf-8') as f:
                f.write(res.text)
            current_result = await scraper.processFetchResult(fetch_result)
            
        print("Final streams:")
        for stream in current_result.get('streams', []):
            print(stream)

if __name__ == '__main__':
    asyncio.run(main())
