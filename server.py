import http.server
import socketserver
import urllib.request
import urllib.error
import json
import os

PORT = 5500

class GameVaultHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path == '/proxy/hltb':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_data = self.rfile.read(content_length)
                
                print(f"[SmartProxy] Request received for HLTB...")
                
                try:
                    # Parse incoming JSON to get search term
                    json_body = json.loads(post_data.decode('utf-8'))
                    terms = json_body.get('searchTerms', [])
                    query_name = terms[0] if terms else ""
                    
                    if not query_name:
                         raise Exception("No search term provided")

                    print(f"[SmartProxy] Library Search: '{query_name}'")

                    from howlongtobeatpy import HowLongToBeat
                    # Re-instantiate to avoid any state/session issues between threads
                    hltb = HowLongToBeat()
                    results = hltb.search(query_name)
                    
                    formatted_results = []
                    
                    if results:
                        for game in results:
                            try:
                                # Defensive extraction
                                main = game.main_story if (game.main_story and str(game.main_story).replace('.','',1).isdigit()) else 0
                                extra = game.main_extra if (game.main_extra and str(game.main_extra).replace('.','',1).isdigit()) else 0
                                completionist = game.completionist if (game.completionist and str(game.completionist).replace('.','',1).isdigit()) else 0
                                
                                formatted_results.append({
                                    'game_name': game.game_name,
                                    'game_image': game.game_image_url, 
                                    'comp_main': int(float(main) * 3600),
                                    'comp_plus': int(float(extra) * 3600),
                                    'comp_100': int(float(completionist) * 3600)
                                })
                            except Exception as conversion_error:
                                print(f"[SmartProxy] Error converting game '{game.game_name}': {conversion_error}")
                                continue
                    
                    print(f"[SmartProxy] Found {len(formatted_results)} results for '{query_name}'")

                    response_json = json.dumps({'data': formatted_results})
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response_json.encode('utf-8'))
                    print(f"[SmartProxy] Success: Sent {len(formatted_results)} items.")

                except ImportError:
                    print("[SmartProxy] Error: 'howlongtobeatpy' module missing.")
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(json.dumps({'error': 'Please run: pip install howlongtobeatpy'}).encode('utf-8'))
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"[SmartProxy] Critical Error: {str(e)}")
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        super().do_GET()

    # Enable CORS for local dev
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == "__main__":
    Handler = GameVaultHandler
    # Prevent 'Address already in use'
    socketserver.TCPServer.allow_reuse_address = True
    
    print(f"----------------------------------------------------------------")
    print(f"🚀 GAME VAULT :: SMART SERVER (howlongtobeatpy)")
    print(f"----------------------------------------------------------------")
    print(f"📡 Serving at http://localhost:{PORT}")
    print(f"🔧 HLTB Proxy Active at /proxy/hltb")
    print(f"----------------------------------------------------------------")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")
            httpd.server_close()
