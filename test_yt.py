import urllib.request, re
req = urllib.request.Request('https://www.youtube.com/results?search_query=cyberpunk+2077+trailer', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
match = re.search(r'\"videoId\":\"(.*?)\"', html)
if match:
    print(match.group(1))
