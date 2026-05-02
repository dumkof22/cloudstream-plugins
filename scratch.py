import httpx
from bs4 import BeautifulSoup

def fetch_and_analyze():
    url = 'https://www.selcuksportshd6bec1961ef.xyz'
    
    print(f"\nTrying {url}...")
    try:
        client = httpx.Client(follow_redirects=True, verify=False)
        response = client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        })
        print(f"Status: {response.status_code}")
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        tab = soup.select_one('div.channel-list[id="tab5"]')
        if tab:
            channels = tab.select('li a[data-url]')
            print(f"Selector worked! Found {len(channels)} channels.")
        else:
            print("Selector failed!")
                
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    fetch_and_analyze()
